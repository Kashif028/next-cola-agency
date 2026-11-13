use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelInvoiceDto {
    pub invoice_id: i64,
    pub reason: String,
    pub cancelled_by: i64,
    pub admin_pin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelInvoiceResult {
    pub success: bool,
    pub invoice_id: i64,
    pub invoice_number: String,
    pub restored_stock_items: usize,
    pub refunded_cash_paisa: i64,
    pub credited_receivable_paisa: i64,
    pub reversed_crates_count: i32,
    pub audit_log_id: i64,
    pub cancelled_at: String,
}

pub struct CancellationService;

impl CancellationService {
    pub fn cancel_invoice(
        conn: &mut Connection,
        req: CancelInvoiceDto,
    ) -> Result<CancelInvoiceResult, AppError> {
        // 1. Validate reason
        if req.reason.trim().is_empty() {
            return Err(AppError::Validation(
                "Mandatory cancellation reason required".into(),
            ));
        }

        // 2. Fetch User & Verify Admin PIN
        let (user_role, _user_pin): (String, Option<String>) = conn
            .query_row(
                "SELECT role, pin_code FROM users WHERE id = ?1",
                params![req.cancelled_by],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "User".into(),
                id: req.cancelled_by.to_string(),
            })?;

        let is_admin = user_role.to_uppercase() == "ADMIN";
        let is_authorized = if is_admin {
            true
        } else if let Some(ref pin) = req.admin_pin {
            // Exact string equality against any active admin PIN in database
            let matches_admin: bool = conn
                .query_row(
                    "SELECT 1 FROM users WHERE (role = 'ADMIN' OR role = 'admin') AND pin_code = ?1 AND is_active = 1",
                    params![pin],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            matches_admin
        } else {
            false
        };

        if !is_authorized {
            return Err(AppError::Unauthorized(
                "Permission denied: Only Admin can cancel finalized bills".into(),
            ));
        }

        let tx = conn.transaction()?;

        // 3. Fetch invoice
        let (
            invoice_num,
            customer_id,
            invoice_date,
            subtotal_paisa,
            discount_paisa,
            crate_deposit_paisa,
            net_total_paisa,
            paid_amount_paisa,
            due_amount_paisa,
            status,
            is_cancelled,
            is_locked,
            crates_issued,
            crates_returned,
            payment_type,
        ): (
            String,
            i64,
            String,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            String,
            bool,
            bool,
            i32,
            i32,
            String,
        ) = tx
            .query_row(
                "SELECT invoice_number, customer_id, invoice_date, subtotal_paisa,
                        discount_paisa, crate_deposit_charged_paisa, net_total_paisa,
                        paid_amount_paisa, due_amount_paisa, status, is_cancelled,
                        is_locked, crates_issued, crates_returned, payment_type
                 FROM sales_invoices WHERE id = ?1",
                params![req.invoice_id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                        r.get(6)?,
                        r.get(7)?,
                        r.get(8)?,
                        r.get(9)?,
                        r.get::<_, i32>(10)? == 1,
                        r.get::<_, i32>(11)? == 1,
                        r.get(12)?,
                        r.get(13)?,
                        r.get(14)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "SalesInvoice".into(),
                id: req.invoice_id.to_string(),
            })?;

        if status == "CANCELLED" || is_cancelled {
            return Err(AppError::Validation("Invoice is already cancelled".into()));
        }

        if is_locked {
            return Err(AppError::DayLocked(
                "Cannot cancel invoice on locked daily closing".into(),
            ));
        }

        // 4. Fetch invoice line items
        let items: Vec<(i64, i64)> = {
            let mut stmt = tx.prepare(
                "SELECT product_id, total_base_units FROM sales_invoice_items WHERE invoice_id = ?1",
            )?;
            let mapped = stmt
                .query_map(params![req.invoice_id], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<Result<Vec<_>, _>>()?;
            mapped
        };

        // 5. Atomic Stock Restoral
        for (prod_id, base_units) in &items {
            tx.execute(
                "UPDATE products SET 
                    stock_base_units = stock_base_units + ?1,
                    current_stock_base_units = current_stock_base_units + ?1,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?2",
                params![base_units, prod_id],
            )?;

            tx.execute(
                "UPDATE product_location_balances SET 
                    balance_base_units = balance_base_units + ?1,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE product_id = ?2 AND location_id = 1",
                params![base_units, prod_id],
            )?;

            let mov_code = format!("MOV-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
            tx.execute(
                "INSERT INTO stock_movements (
                    movement_code, product_id, movement_type, to_location_id,
                    delta_base_units, quantity_base_units, reference_type,
                    reference_doc_type, reference_doc_id, reference_doc_number,
                    notes, created_by
                 ) VALUES (?1, ?2, 'STOCK_ADJUSTMENT', 1, ?3, ?3, 'BILL_CANCEL', 'SALES_INVOICE', ?4, ?5, ?6, ?7)",
                params![
                    mov_code,
                    prod_id,
                    base_units,
                    req.invoice_id,
                    invoice_num,
                    format!("Restock cancelled bill: {}", req.reason),
                    req.cancelled_by
                ],
            )?;
        }

        // 6. Reverse Customer Debt & Khata Ledger
        if due_amount_paisa > 0 {
            let (cust_balance_paisa, cust_balance): (i64, i64) = tx.query_row(
                "SELECT current_balance_paisa, current_balance FROM customers WHERE id = ?1",
                params![customer_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;

            let new_cust_bal_paisa = cust_balance_paisa - due_amount_paisa;
            let new_cust_bal = cust_balance - (due_amount_paisa / 100);

            tx.execute(
                "UPDATE customers SET 
                    current_balance_paisa = ?1,
                    current_balance = ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?3",
                params![new_cust_bal_paisa, new_cust_bal, customer_id],
            )?;

            tx.execute(
                "INSERT INTO customer_ledger (
                    customer_id, entry_date, voucher_type, voucher_ref_id,
                    description, debit, credit, running_balance
                 ) VALUES (?1, strftime('%Y-%m-%d', 'now'), 'BILL_CANCELLATION', ?2, ?3, 0, ?4, ?5)",
                params![
                    customer_id,
                    req.invoice_id,
                    format!("Cancellation of {}: {}", invoice_num, req.reason),
                    due_amount_paisa / 100,
                    new_cust_bal
                ],
            )?;
        }

        // 7. Reverse Cash Drawer / Bank Account
        if paid_amount_paisa > 0 {
            if payment_type == "BANK" {
                let prev_bank: i64 = tx
                    .query_row(
                        "SELECT running_balance_paisa FROM bank_transactions ORDER BY id DESC LIMIT 1",
                        [],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                let new_bank = prev_bank - paid_amount_paisa;

                tx.execute(
                    "INSERT INTO bank_transactions (
                        bank_name, account_number, transaction_date, transaction_type,
                        instrument_type, instrument_number, particulars,
                        deposit_paisa, withdrawal_paisa, running_balance_paisa,
                        is_cleared, clearance_date, journal_entry_id, created_by
                     ) VALUES (
                        'Main Operating Bank', 'PKR-OPERATING-01', ?1, 'INVOICE_CANCEL_REFUND',
                        'ONLINE_RAAST', ?2, ?3,
                        0, ?4, ?5,
                        1, ?1, NULL, ?6
                     )",
                    params![
                        invoice_date,
                        invoice_num,
                        format!("Bank refund for cancelled invoice {}", invoice_num),
                        paid_amount_paisa,
                        new_bank,
                        req.cancelled_by
                    ],
                )?;
            } else {
                let prev_cash: i64 = tx
                    .query_row(
                        "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                        [],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                let new_cash = prev_cash - paid_amount_paisa;

                tx.execute(
                    "INSERT INTO cash_book (
                        entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                        account_id, account_code, particulars, description,
                        cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                        running_balance_paisa, running_cash_balance, created_by
                     ) VALUES (?1, 'CASH_REFUND', 'INVOICE_CANCEL', ?2, 2, '1010',
                              'Cash Refund on Cancelled Invoice', ?3, 0, 0, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        invoice_date,
                        invoice_num,
                        format!("Refund for cancelled bill {}", invoice_num),
                        paid_amount_paisa / 100,
                        paid_amount_paisa,
                        new_cash,
                        new_cash / 100,
                        req.cancelled_by
                    ],
                )?;
            }
        }

        // 8. Reverse Empty Crates
        let net_crates = crates_issued - crates_returned;
        if net_crates != 0 {
            tx.execute(
                "UPDATE customers SET 
                    current_crate_balance = current_crate_balance - ?1,
                    current_crates_balance = current_crates_balance - ?1,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?2",
                params![net_crates, customer_id],
            )?;

            let (new_crates,): (i32,) = tx.query_row(
                "SELECT current_crate_balance FROM customers WHERE id = ?1",
                params![customer_id],
                |r| Ok((r.get(0)?,)),
            )?;

            tx.execute(
                "INSERT INTO customer_crate_ledger (
                    customer_id, entry_date, voucher_ref, crates_out, crates_in, running_crate_balance
                 ) VALUES (?1, strftime('%Y-%m-%d', 'now'), ?2, 0, ?3, ?4)",
                params![
                    customer_id,
                    format!("CANCEL-{}", invoice_num),
                    net_crates,
                    new_crates
                ],
            )?;

            tx.execute(
                "UPDATE products SET empty_crates_stock = empty_crates_stock + ?1 WHERE packaging_type = 'RGB_GLASS'",
                params![net_crates],
            )?;
        }

        // 9. Reverse Security Deposits
        if crate_deposit_paisa > 0 {
            tx.execute(
                "UPDATE customers SET 
                    security_deposit_balance_paisa = security_deposit_balance_paisa - ?1,
                    deposit_balance = deposit_balance - ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?3",
                params![crate_deposit_paisa, crate_deposit_paisa / 100, customer_id],
            )?;
        }

        // 10. Reversal Journal Entry
        let rev_jv = format!("JV-REV-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
        tx.execute(
            "INSERT INTO journal_entries (entry_number, entry_date, voucher_type, reference_doc_type, reference_doc_id, narration, is_balanced, created_by)
             VALUES (?1, strftime('%Y-%m-%d', 'now'), 'CANCELLATION', 'SALES_INVOICE_CANCEL', ?2, ?3, 1, ?4)",
            params![
                rev_jv,
                req.invoice_id,
                format!("Reversal for cancelled invoice {}: {}", invoice_num, req.reason),
                req.cancelled_by
            ],
        )?;
        let rev_jv_id = tx.last_insert_rowid();

        let revenue_reversed = subtotal_paisa - discount_paisa;
        if revenue_reversed > 0 {
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 23, ?2, 0, 'Reversal of Beverage Sales Revenue')",
                params![rev_jv_id, revenue_reversed],
            )?;
        }
        if crate_deposit_paisa > 0 {
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 16, ?2, 0, 'Reversal of Crate Deposit Liability')",
                params![rev_jv_id, crate_deposit_paisa],
            )?;
        }
        if due_amount_paisa > 0 {
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration, customer_id)
                 VALUES (?1, 8, 0, ?2, 'Reversal of Accounts Receivable', ?3)",
                params![rev_jv_id, due_amount_paisa, customer_id],
            )?;
        }
        if paid_amount_paisa > 0 {
            let (acc_id, line_narration) = if payment_type == "BANK" {
                (3, "Bank refund on bill cancellation")
            } else {
                (2, "Cash refund on bill cancellation")
            };
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, ?2, 0, ?3, ?4)",
                params![rev_jv_id, acc_id, paid_amount_paisa, line_narration],
            )?;
        }

        // 11. Update Invoice Status
        let cancelled_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%fZ").to_string();
        tx.execute(
            "UPDATE sales_invoices SET 
                status = 'CANCELLED',
                is_cancelled = 1,
                cancellation_reason = ?1,
                cancelled_by = ?2,
                cancelled_at = ?3,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?4",
            params![req.reason, req.cancelled_by, cancelled_at, req.invoice_id],
        )?;

        // 12. Immutable Audit Logging
        let old_state_json = serde_json::json!({
            "status": status,
            "net_total_paisa": net_total_paisa,
            "paid_amount_paisa": paid_amount_paisa,
            "due_amount_paisa": due_amount_paisa,
        })
        .to_string();

        let new_state_json = serde_json::json!({
            "status": "CANCELLED",
            "is_cancelled": true,
            "cancellation_reason": req.reason,
        })
        .to_string();

        tx.execute(
            "INSERT INTO audit_logs (
                user_id, username, action, entity_type, entity_id,
                old_values_json, new_values_json, reason, ip_address
             ) VALUES (?1, ?2, 'BILL_CANCEL', 'sales_invoices', ?3, ?4, ?5, ?6, '127.0.0.1')",
            params![
                req.cancelled_by,
                user_role,
                req.invoice_id.to_string(),
                old_state_json,
                new_state_json,
                req.reason
            ],
        )?;
        let audit_log_id = tx.last_insert_rowid();

        tx.commit()?;

        Ok(CancelInvoiceResult {
            success: true,
            invoice_id: req.invoice_id,
            invoice_number: invoice_num,
            restored_stock_items: items.len(),
            refunded_cash_paisa: paid_amount_paisa,
            credited_receivable_paisa: due_amount_paisa,
            reversed_crates_count: net_crates,
            audit_log_id,
            cancelled_at,
        })
    }
}
