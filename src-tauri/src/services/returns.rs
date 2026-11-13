use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnItemDto {
    pub product_id: i64,
    pub base_units: i64,
    pub refund_rate_paisa: i64,
    pub condition: String, // "SALABLE" or "DAMAGED"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordSalesReturnDto {
    pub invoice_id: Option<i64>,
    pub customer_id: i64,
    #[serde(default)]
    pub return_date: Option<String>,
    pub items: Vec<ReturnItemDto>,
    pub refund_mode: String, // "CREDIT_NOTE", "CASH", "BANK"
    pub reason: String,
    pub crates_returned_by_customer: Option<i32>,
    pub authorized_by: Option<i64>,
}

pub type ReturnsService = SalesReturnService;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalesReturnResult {
    pub return_id: i64,
    pub return_number: String,
    pub total_return_paisa: i64,
    pub refund_mode: String,
    pub salable_units_restocked: i64,
    pub damaged_units_logged: i64,
    pub new_customer_balance_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalesReturnListItemDto {
    pub id: i64,
    pub return_number: String,
    pub invoice_id: Option<i64>,
    pub customer_id: i64,
    pub customer_name: String,
    pub return_date: String,
    pub total_return_paisa: i64,
    pub refund_mode: String,
    pub reason: String,
    pub created_at: String,
}

pub struct SalesReturnService;

impl SalesReturnService {
    pub fn record_sales_return(
        conn: &mut Connection,
        req: RecordSalesReturnDto,
    ) -> Result<SalesReturnResult, AppError> {
        let user_id = req.authorized_by.unwrap_or(1);
        let return_date = req.return_date.clone().unwrap_or_else(|| {
            Utc::now().format("%Y-%m-%d").to_string()
        });

        // 0. Non-negative validation for quantities and refund rates
        for it in &req.items {
            if it.base_units < 0 || it.refund_rate_paisa < 0 {
                return Err(AppError::Validation(
                    "Return quantities and rates cannot be negative".into(),
                ));
            }
        }

        let tx = conn.transaction()?;

        // Day-locking check: Check if daily closing is already locked for return_date
        let is_date_locked: bool = tx
            .query_row(
                "SELECT COUNT(*) FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                params![return_date],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);

        if is_date_locked {
            return Err(AppError::DayLocked(format!(
                "Accounting date {} is locked by finalized daily closing",
                return_date
            )));
        }

        // Verify customer exists
        let (current_balance_paisa, current_balance, current_crate_balance): (i64, i64, i32) = tx
            .query_row(
                "SELECT current_balance_paisa, current_balance, current_crate_balance FROM customers WHERE id = ?1",
                params![req.customer_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Customer".into(),
                id: req.customer_id.to_string(),
            })?;

        // If invoice_id is provided, validate return against original sales invoice
        if let Some(inv_id) = req.invoice_id {
            // Check if sales invoice is locked or on a locked date
            let inv_lock_info: Option<(bool, String)> = tx
                .query_row(
                    "SELECT is_locked, invoice_date FROM sales_invoices WHERE id = ?1",
                    params![inv_id],
                    |r| Ok((r.get::<_, i32>(0)? == 1, r.get(1)?)),
                )
                .optional()?;

            if let Some((is_inv_locked, inv_date)) = inv_lock_info {
                if is_inv_locked {
                    return Err(AppError::DayLocked(format!(
                        "Sales invoice {} belongs to a locked daily closing",
                        inv_id
                    )));
                }
                let is_inv_date_locked: bool = tx
                    .query_row(
                        "SELECT COUNT(*) FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                        params![inv_date],
                        |r| Ok(r.get::<_, i64>(0)? > 0),
                    )
                    .unwrap_or(false);
                if is_inv_date_locked {
                    return Err(AppError::DayLocked(format!(
                        "Original invoice date {} is locked by finalized daily closing",
                        inv_date
                    )));
                }
            }

            for it in &req.items {
                let inv_item: Option<(i64, i64, i64)> = tx
                    .query_row(
                        "SELECT total_base_units, unit_price_paisa, line_total_paisa FROM sales_invoice_items WHERE invoice_id = ?1 AND product_id = ?2",
                        params![inv_id, it.product_id],
                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                    )
                    .optional()?;

                let (billed_units, unit_price_paisa, line_total_paisa) = match inv_item {
                    Some(vals) => vals,
                    None => {
                        return Err(AppError::Validation(
                            "Product is not part of the specified sales invoice".into(),
                        ));
                    }
                };

                let max_unit_rate = if billed_units > 0 {
                    line_total_paisa / billed_units
                } else {
                    unit_price_paisa
                };

                if it.refund_rate_paisa > max_unit_rate {
                    return Err(AppError::Validation(format!(
                        "Refund amount must not exceed original invoice unit price (billed rate: {} Paisas, attempted: {} Paisas)",
                        max_unit_rate, it.refund_rate_paisa
                    )));
                }

                let prev_returned: i64 = tx
                    .query_row(
                        "SELECT COALESCE(SUM(sri.base_units), 0)
                         FROM sales_return_items sri
                         JOIN sales_returns sr ON sri.return_id = sr.id
                         WHERE sr.invoice_id = ?1 AND sri.product_id = ?2",
                        params![inv_id, it.product_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);

                let current_request_units_for_prod: i64 = req
                    .items
                    .iter()
                    .filter(|item| item.product_id == it.product_id)
                    .map(|item| item.base_units)
                    .sum();

                if prev_returned + current_request_units_for_prod > billed_units {
                    return Err(AppError::Validation(format!(
                        "Cumulative return quantity {} (plus {} previously returned) exceeds billed quantity {}",
                        current_request_units_for_prod, prev_returned, billed_units
                    )));
                }
            }
        }

        let mut total_return_paisa: i64 = 0;
        let mut salable_units: i64 = 0;
        let mut damaged_units: i64 = 0;
        let return_num = format!("RET-{}", Uuid::new_v4().to_string()[..8].to_uppercase());

        let mut processed_lines = Vec::new();

        // 1. Process line items
        for it in &req.items {
            if it.base_units < 0 || it.refund_rate_paisa < 0 {
                return Err(AppError::Validation(
                    "Return quantities and rates cannot be negative".into(),
                ));
            }
            if it.base_units == 0 {
                continue; // Zero unit item cleanly ignored per F05-B5
            }

            let line_total_paisa = it.base_units * it.refund_rate_paisa;
            total_return_paisa += line_total_paisa;

            let (_prod_name, units_per_pack, purchase_price_pack_paisa): (String, i64, i64) = tx
                .query_row(
                    "SELECT name, units_per_pack, purchase_price_pack_paisa FROM products WHERE id = ?1",
                    params![it.product_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()?
                .ok_or_else(|| AppError::NotFound {
                    entity: "Product".into(),
                    id: it.product_id.to_string(),
                })?;

            let is_salable = it.condition.to_uppercase() == "SALABLE";
            let mut breakage_id = None;

            if is_salable {
                salable_units += it.base_units;

                // Restock sellable inventory
                tx.execute(
                    "UPDATE products SET 
                        stock_base_units = stock_base_units + ?1,
                        current_stock_base_units = current_stock_base_units + ?1,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                     WHERE id = ?2",
                    params![it.base_units, it.product_id],
                )?;

                // Sync main depot location
                tx.execute(
                    "INSERT INTO product_location_balances (product_id, location_id, balance_base_units, updated_at)
                     VALUES (?1, 1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                     ON CONFLICT(product_id, location_id) DO UPDATE SET
                        balance_base_units = balance_base_units + ?2,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                    params![it.product_id, it.base_units],
                )?;

                // Stock movement
                let mov_code = format!("MOV-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
                tx.execute(
                    "INSERT INTO stock_movements (
                        movement_code, product_id, movement_type, to_location_id,
                        delta_base_units, quantity_base_units, reference_type,
                        reference_doc_type, reference_doc_id, notes, created_by
                     ) VALUES (?1, ?2, 'SALE_RETURN', 1, ?3, ?3, 'SALE_RETURN', 'RETURN_NOTE', ?4, ?5, ?6)",
                    params![
                        mov_code,
                        it.product_id,
                        it.base_units,
                        req.invoice_id,
                        format!("Salable return from customer: {}", req.reason),
                        user_id
                    ],
                )?;
            } else {
                damaged_units += it.base_units;

                // Do NOT restock sellable inventory! Route to Breakage Logs
                let unit_cost_paisa = if units_per_pack > 0 {
                    purchase_price_pack_paisa / units_per_pack
                } else {
                    0
                };
                let loss_paisa = it.base_units * unit_cost_paisa;

                tx.execute(
                    "INSERT INTO breakage_logs (
                        log_date, product_id, broken_base_units, unit_cost, unit_cost_paisa,
                        total_loss_amount, total_loss_paisa, cause, incident_location,
                        responsible_person, action_taken, notes, created_by
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'Customer Return Damaged', 'Customer Return', 'Retailer', 'EXPENSE', ?8, ?9)",
                    params![
                        return_date,
                        it.product_id,
                        it.base_units,
                        (unit_cost_paisa as f64) / 100.0,
                        unit_cost_paisa,
                        (loss_paisa as f64) / 100.0,
                        loss_paisa,
                        req.reason,
                        user_id
                    ],
                )?;
                breakage_id = Some(tx.last_insert_rowid());
            }

            processed_lines.push((
                it.product_id,
                it.base_units,
                it.refund_rate_paisa,
                line_total_paisa,
                if is_salable { "SALABLE" } else { "DAMAGED" },
                breakage_id,
            ));
        }

        // 2. Refund Mode Financial Posting
        let mut new_bal_paisa = current_balance_paisa;

        if req.refund_mode == "CREDIT_NOTE" {
            new_bal_paisa -= total_return_paisa;
            let new_bal = current_balance - (total_return_paisa / 100);

            tx.execute(
                "UPDATE customers SET 
                    current_balance_paisa = ?1,
                    current_balance = ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?3",
                params![new_bal_paisa, new_bal, req.customer_id],
            )?;

            tx.execute(
                "INSERT INTO customer_ledger (
                    customer_id, entry_date, voucher_type, voucher_ref_id,
                    description, debit, credit, running_balance
                 ) VALUES (?1, ?2, 'SALE_RETURN', ?3, ?4, 0, ?5, ?6)",
                params![
                    req.customer_id,
                    return_date,
                    req.invoice_id.unwrap_or(0),
                    format!("Sales Return: {}", req.reason),
                    total_return_paisa / 100,
                    new_bal
                ],
            )?;
        } else if req.refund_mode == "CASH" {
            let prev_cash: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let new_cash = prev_cash - total_return_paisa;

            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'CASH_RETURN_REFUND', 'RETURN', ?2, 2, '1010',
                          'Cash Refund on Customer Return', ?3, 0, 0, ?4, ?5, ?6, ?7, ?8)",
                params![
                    return_date,
                    return_num,
                    format!("Cash refund on customer return: {}", req.reason),
                    total_return_paisa / 100,
                    total_return_paisa,
                    new_cash,
                    new_cash / 100,
                    user_id
                ],
            )?;
        } else if req.refund_mode == "BANK" {
            let prev_bank: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM bank_transactions ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let new_bank = prev_bank - total_return_paisa;

            tx.execute(
                "INSERT INTO bank_transactions (
                    bank_name, account_number, transaction_date, transaction_type,
                    instrument_type, instrument_number, particulars,
                    deposit_paisa, withdrawal_paisa, running_balance_paisa,
                    is_cleared, clearance_date, journal_entry_id, created_by
                 ) VALUES (
                    'Main Operating Bank', 'PKR-OPERATING-01', ?1, 'RETURN_REFUND',
                    'ONLINE_RAAST', ?2, ?3,
                    0, ?4, ?5,
                    1, ?1, NULL, ?6
                 )",
                params![
                    return_date,
                    return_num,
                    format!("Bank refund on customer return: {}", req.reason),
                    total_return_paisa,
                    new_bank,
                    user_id
                ],
            )?;
        }

        // 3. Crates returned with return
        let crates_ret = req.crates_returned_by_customer.unwrap_or(0);
        if crates_ret > 0 {
            let new_crate_bal = current_crate_balance - crates_ret;
            tx.execute(
                "UPDATE customers SET 
                    current_crate_balance = ?1,
                    current_crates_balance = ?1,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?2",
                params![new_crate_bal, req.customer_id],
            )?;

            tx.execute(
                "UPDATE products SET empty_crates_stock = empty_crates_stock + ?1 WHERE packaging_type = 'RGB_GLASS'",
                params![crates_ret],
            )?;

            let _ = tx.execute(
                "INSERT INTO customer_crate_ledger (
                    customer_id, entry_date, voucher_ref, crates_out, crates_in, running_crate_balance
                 ) VALUES (?1, ?2, ?3, 0, ?4, ?5)",
                params![
                    req.customer_id,
                    return_date,
                    format!("RET-{}", return_num),
                    crates_ret,
                    new_crate_bal
                ],
            );
        }

        // 4. Persist Return Records
        tx.execute(
            "INSERT INTO sales_returns (
                return_number, invoice_id, customer_id, return_date,
                total_return_paisa, refund_mode, reason, created_by
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                return_num,
                req.invoice_id,
                req.customer_id,
                return_date,
                total_return_paisa,
                req.refund_mode,
                req.reason,
                user_id
            ],
        )?;
        let return_id = tx.last_insert_rowid();

        for (prod_id, base_units, refund_rate, line_tot, cond, breakage_id) in processed_lines {
            tx.execute(
                "INSERT INTO sales_return_items (
                    return_id, product_id, base_units, refund_rate_paisa, line_total_paisa,
                    condition, breakage_log_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    return_id,
                    prod_id,
                    base_units,
                    refund_rate,
                    line_tot,
                    cond,
                    breakage_id
                ],
            )?;
        }

        tx.commit()?;

        Ok(SalesReturnResult {
            return_id,
            return_number: return_num,
            total_return_paisa,
            refund_mode: req.refund_mode,
            salable_units_restocked: salable_units,
            damaged_units_logged: damaged_units,
            new_customer_balance_paisa: new_bal_paisa,
        })
    }

    pub fn list_returns(
        conn: &Connection,
        limit: Option<usize>,
    ) -> Result<Vec<SalesReturnListItemDto>, AppError> {
        let max_rows = limit.unwrap_or(50);
        let mut stmt = conn.prepare(
            "SELECT sr.id, sr.return_number, sr.invoice_id, sr.customer_id, c.name,
                    sr.return_date, sr.total_return_paisa, sr.refund_mode, sr.reason, sr.created_at
             FROM sales_returns sr
             JOIN customers c ON sr.customer_id = c.id
             ORDER BY sr.id DESC LIMIT ?1",
        )?;

        let list = stmt
            .query_map(params![max_rows as i64], |r| {
                Ok(SalesReturnListItemDto {
                    id: r.get(0)?,
                    return_number: r.get(1)?,
                    invoice_id: r.get(2)?,
                    customer_id: r.get(3)?,
                    customer_name: r.get(4)?,
                    return_date: r.get(5)?,
                    total_return_paisa: r.get(6)?,
                    refund_mode: r.get(7)?,
                    reason: r.get(8)?,
                    created_at: r.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(list)
    }
}
