use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::errors::AppError;
use crate::domain::models::{InvoiceStatus, PaymentType};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSalesInvoiceItemDto {
    pub product_id: i64,
    pub pack_qty: i64,
    pub loose_qty: i64,
    pub unit_price_paisa: Option<i64>, // If None, resolved from catalog & customer tier
    pub line_discount_paisa: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSalesInvoiceDto {
    pub customer_id: i64,
    pub invoice_number: Option<String>,
    pub invoice_date: Option<String>,
    pub due_date: Option<String>,
    pub delivery_sheet_id: Option<i64>,
    pub trip_id: Option<i64>,
    pub items: Vec<CreateSalesInvoiceItemDto>,
    pub invoice_discount_paisa: Option<i64>,
    pub crate_deposit_charged_paisa: Option<i64>,
    pub payment_type: PaymentType,
    pub paid_amount_paisa: Option<i64>,
    pub crates_issued: Option<i32>,
    pub crates_returned: Option<i32>,
    pub admin_override_pin: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalesInvoiceItemReceiptDto {
    pub product_id: i64,
    pub product_name: String,
    pub sku_code: String,
    pub packaging_name: String,
    pub units_per_pack: i64,
    pub pack_qty: i64,
    pub loose_qty: i64,
    pub total_base_units: i64,
    pub unit_price_paisa: i64,
    pub line_discount_paisa: i64,
    pub line_total_paisa: i64,
    pub cogs_total_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalesInvoiceReceiptDto {
    pub invoice_id: i64,
    pub invoice_number: String,
    pub invoice_date: String,
    pub due_date: String,
    pub customer_id: i64,
    pub customer_name: String,
    pub shop_name: String,
    pub customer_phone: String,
    pub items: Vec<SalesInvoiceItemReceiptDto>,
    pub subtotal_paisa: i64,
    pub discount_paisa: i64,
    pub crate_deposit_charged_paisa: i64,
    pub net_total_paisa: i64,
    pub paid_amount_paisa: i64,
    pub due_amount_paisa: i64,
    pub payment_type: PaymentType,
    pub status: InvoiceStatus,
    pub previous_customer_balance_paisa: i64,
    pub new_customer_balance_paisa: i64,
    pub crates_issued: i32,
    pub crates_returned: i32,
    pub previous_crate_balance: i32,
    pub new_crate_balance: i32,
    pub sales_journal_entry_id: i64,
    pub cogs_journal_entry_id: i64,
    pub cash_book_entry_id: Option<i64>,
    pub formatted_thermal_receipt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalesInvoiceListItemDto {
    pub id: i64,
    pub invoice_number: String,
    pub customer_id: i64,
    pub customer_name: String,
    pub invoice_date: String,
    pub net_total_paisa: i64,
    pub paid_amount_paisa: i64,
    pub due_amount_paisa: i64,
    pub payment_type: String,
    pub status: String,
    pub crates_issued: i32,
    pub crates_returned: i32,
    pub is_cancelled: bool,
    pub is_locked: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditStatusCheckResult {
    pub customer_id: i64,
    pub customer_name: String,
    pub credit_limit_paisa: i64,
    pub current_balance_paisa: i64,
    pub attempted_credit_paisa: i64,
    pub total_exposure_paisa: i64,
    pub utilization_percentage: i64,
    pub is_warning: bool,
    pub is_breached: bool,
    pub status: String, // "ACTIVE", "WARNING", "BLOCKED"
}

pub fn generate_next_invoice_number(conn: &Connection, date_str: &str) -> Result<String, AppError> {
    let prefix: String = conn
        .query_row(
            "SELECT invoice_prefix FROM app_settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "INV-".to_string());

    let clean_date = date_str.replace('-', "");
    let pattern = format!("{}{}-%", prefix, clean_date);

    let max_inv: Option<String> = conn
        .query_row(
            "SELECT invoice_number FROM sales_invoices 
             WHERE invoice_number LIKE ?1 
             ORDER BY invoice_number DESC LIMIT 1",
            params![pattern],
            |row| row.get(0),
        )
        .optional()?;

    let next_seq = match max_inv {
        Some(last) => {
            let parts: Vec<&str> = last.split('-').collect();
            if let Some(seq_str) = parts.last() {
                seq_str.parse::<u32>().unwrap_or(0) + 1
            } else {
                1
            }
        }
        None => 1,
    };

    Ok(format!("{}{}-{:04}", prefix, clean_date, next_seq))
}

pub fn format_pos_receipt(
    invoice_number: &str,
    invoice_date: &str,
    shop_name: &str,
    customer_name: &str,
    phone: &str,
    items: &[SalesInvoiceItemReceiptDto],
    subtotal_paisa: i64,
    discount_paisa: i64,
    crate_deposit_paisa: i64,
    net_total_paisa: i64,
    paid_paisa: i64,
    due_paisa: i64,
    crates_issued: i32,
    crates_returned: i32,
    new_customer_balance_paisa: i64,
    new_crate_balance: i32,
) -> String {
    let mut out = String::new();
    out.push_str("================================================\n");
    out.push_str("           LOGAR TRADERS - NEXTCO DEPOT         \n");
    out.push_str("    Official Nextco Beverage Distribution Depot \n");
    out.push_str("   Nextco Depot, Main Bypass, Rahim Yar Khan    \n");
    out.push_str("     Phone: +92 300 1234567 | NTN: 7483921-5    \n");
    out.push_str("================================================\n");
    out.push_str(&format!("Invoice No: {}\n", invoice_number));
    out.push_str(&format!("Date:       {}\n", invoice_date));
    out.push_str(&format!("Customer:   {} ({})\n", shop_name, customer_name));
    out.push_str(&format!("Contact:    {}\n", phone));
    out.push_str("------------------------------------------------\n");
    out.push_str("Item Description       Qty    Rate      Total(Rs)\n");
    out.push_str("------------------------------------------------\n");

    for it in items {
        let qty_str = if it.pack_qty > 0 && it.loose_qty > 0 {
            format!("{}P+{}B", it.pack_qty, it.loose_qty)
        } else if it.pack_qty > 0 {
            format!("{} Ctn", it.pack_qty)
        } else {
            format!("{} Btl", it.loose_qty)
        };
        let rate_pkr = (it.unit_price_paisa as f64) / 100.0;
        let total_pkr = (it.line_total_paisa as f64) / 100.0;
        let name_trimmed = if it.product_name.len() > 18 {
            &it.product_name[..18]
        } else {
            &it.product_name
        };
        out.push_str(&format!(
            "{:<18} {:>6} {:>8.2} {:>10.2}\n",
            name_trimmed, qty_str, rate_pkr, total_pkr
        ));
    }

    out.push_str("------------------------------------------------\n");
    out.push_str(&format!("Subtotal:                              {:>10.2}\n", (subtotal_paisa as f64) / 100.0));
    if discount_paisa > 0 {
        out.push_str(&format!("Discount:                             -{:>10.2}\n", (discount_paisa as f64) / 100.0));
    }
    if crate_deposit_paisa > 0 {
        out.push_str(&format!("Crate Security Deposit:               +{:>10.2}\n", (crate_deposit_paisa as f64) / 100.0));
    }
    out.push_str("================================================\n");
    out.push_str(&format!("NET TOTAL PAYABLE:                  Rs {:>10.2}\n", (net_total_paisa as f64) / 100.0));
    out.push_str("------------------------------------------------\n");
    out.push_str(&format!("Cash Received:                      Rs {:>10.2}\n", (paid_paisa as f64) / 100.0));
    out.push_str(&format!("Credit (Udhaar):                    Rs {:>10.2}\n", (due_paisa as f64) / 100.0));
    out.push_str("================================================\n");
    out.push_str("CUSTOMER KHATA SUMMARY:\n");
    out.push_str(&format!("Total Outstanding Balance:          Rs {:>10.2}\n", (new_customer_balance_paisa as f64) / 100.0));
    out.push_str("------------------------------------------------\n");
    out.push_str("EMPTY CRATE ACCOUNT:\n");
    out.push_str(&format!(
        "Crates Issued: {} | Returned: {} | Net: {}\n",
        crates_issued,
        crates_returned,
        crates_issued - crates_returned
    ));
    out.push_str(&format!("Current Crate Balance: {} Crates\n", new_crate_balance));
    out.push_str("================================================\n");
    out.push_str("  Mal bika hua wapas nahi hoga. Baghair raseed dawah qabil-e-qabool nahi.\n");
    out.push_str("        Thank you for choosing Logar Traders!   \n");
    out.push_str("================================================\n");
    out
}

pub struct SalesService;

impl SalesService {
    pub fn create_invoice(
        conn: &mut Connection,
        req: CreateSalesInvoiceDto,
    ) -> Result<SalesInvoiceReceiptDto, AppError> {
        if req.items.is_empty() {
            return Err(AppError::Validation("Invoice must contain at least one item".into()));
        }

        let user_id = req.user_id.unwrap_or(1);
        let invoice_date = req.invoice_date.clone().unwrap_or_else(|| {
            Utc::now().format("%Y-%m-%d").to_string()
        });

        // 1. Begin atomic transaction
        let tx = conn.transaction()?;

        // Day-locking guard: Check if daily closing is already locked for invoice_date
        let is_date_locked: bool = tx
            .query_row(
                "SELECT COUNT(*) FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                params![invoice_date],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);

        if is_date_locked {
            return Err(AppError::DayLocked(format!(
                "Accounting date {} is locked by finalized daily closing",
                invoice_date
            )));
        }

        // 2. Fetch Customer info & current credit limits
        let (
            customer_name,
            shop_name,
            phone,
            price_tier,
            credit_limit_paisa,
            credit_days,
            current_balance_paisa,
            current_crate_balance,
        ): (String, String, String, String, i64, i32, i64, i32) = tx
            .query_row(
                "SELECT name, shop_name, phone, price_tier, credit_limit_paisa, credit_limit_days,
                        current_balance_paisa, current_crate_balance 
                 FROM customers WHERE id = ?1 AND is_active = 1",
                params![req.customer_id],
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
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Customer".into(),
                id: req.customer_id.to_string(),
            })?;

        let due_date = req.due_date.clone().unwrap_or_else(|| {
            let parsed = chrono::NaiveDate::parse_from_str(&invoice_date, "%Y-%m-%d")
                .unwrap_or_else(|_| Utc::now().date_naive());
            (parsed + chrono::Duration::days(credit_days as i64))
                .format("%Y-%m-%d")
                .to_string()
        });

        // 3. Process line items, calculate totals & check stock availability
        let mut prepared_items = Vec::new();
        let mut subtotal_paisa: i64 = 0;
        let mut total_cogs_paisa: i64 = 0;

        for item in &req.items {
            if item.pack_qty < 0 || item.loose_qty < 0 {
                return Err(AppError::Validation("Quantities cannot be negative".into()));
            }

            let (
                name,
                sku,
                pack_name,
                units_per_pack,
                purchase_price_pack_paisa,
                wholesale_price_pack_paisa,
                retail_price_pack_paisa,
                current_stock_base,
            ): (String, String, String, i64, i64, i64, i64, i64) = tx
                .query_row(
                    "SELECT name, sku_code, default_pack_name, units_per_pack, purchase_price_pack_paisa,
                            wholesale_price_pack_paisa, retail_price_pack_paisa, current_stock_base_units 
                     FROM products WHERE id = ?1 AND is_active = 1",
                    params![item.product_id],
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
                        ))
                    },
                )
                .optional()?
                .ok_or_else(|| AppError::NotFound {
                    entity: "Product".into(),
                    id: item.product_id.to_string(),
                })?;

            let total_base_units = (item.pack_qty * units_per_pack) + item.loose_qty;
            if total_base_units <= 0 {
                return Err(AppError::Validation(format!(
                    "Quantity for {} must be greater than zero",
                    name
                )));
            }

            if current_stock_base < total_base_units {
                return Err(AppError::InsufficientStock {
                    product_id: item.product_id,
                    requested_base: total_base_units,
                    available_base: current_stock_base,
                });
            }

            let unit_price_paisa = match item.unit_price_paisa {
                Some(p) => p,
                None => {
                    if price_tier.to_uppercase() == "WHOLESALE" {
                        wholesale_price_pack_paisa
                    } else {
                        retail_price_pack_paisa
                    }
                }
            };

            let base_rate_paisa = if units_per_pack > 0 {
                unit_price_paisa / units_per_pack
            } else {
                0
            };
            let gross_line = (item.pack_qty * unit_price_paisa) + (item.loose_qty * base_rate_paisa);
            let line_discount = item.line_discount_paisa.unwrap_or(0);
            let line_total = if gross_line > line_discount {
                gross_line - line_discount
            } else {
                0
            };

            let cogs_unit_cost = if units_per_pack > 0 {
                purchase_price_pack_paisa / units_per_pack
            } else {
                0
            };
            let cogs_line = total_base_units * cogs_unit_cost;

            subtotal_paisa += line_total;
            total_cogs_paisa += cogs_line;

            prepared_items.push((
                item.product_id,
                name,
                sku,
                pack_name,
                units_per_pack,
                item.pack_qty,
                item.loose_qty,
                total_base_units,
                unit_price_paisa,
                line_discount,
                line_total,
                cogs_unit_cost,
                cogs_line,
            ));
        }

        let inv_discount = req.invoice_discount_paisa.unwrap_or(0);
        let crate_deposit = req.crate_deposit_charged_paisa.unwrap_or(0);
        let discounted_subtotal = if subtotal_paisa > inv_discount {
            subtotal_paisa - inv_discount
        } else {
            0
        };
        let net_total_paisa = discounted_subtotal + crate_deposit;

        // 4. Payment allocation
        let (paid_paisa, due_paisa) = match req.payment_type {
            PaymentType::Cash => (net_total_paisa, 0),
            PaymentType::Credit => (0, net_total_paisa),
            PaymentType::Split => {
                let paid = req.paid_amount_paisa.unwrap_or(0);
                let due = if net_total_paisa > paid {
                    net_total_paisa - paid
                } else {
                    0
                };
                (paid, due)
            }
            PaymentType::Bank => (net_total_paisa, 0),
        };

        let status = if due_paisa == 0 {
            InvoiceStatus::Paid
        } else if paid_paisa > 0 {
            InvoiceStatus::Partial
        } else {
            InvoiceStatus::Unpaid
        };

        // 5. Credit limit verification
        if due_paisa > 0 && credit_limit_paisa > 0 {
            let total_exposure = current_balance_paisa + due_paisa;
            if total_exposure > credit_limit_paisa {
                let is_authorized = match &req.admin_override_pin {
                    Some(pin) => {
                        let valid: bool = tx
                            .query_row(
                                "SELECT COUNT(*) FROM users 
                                 WHERE (role = 'ADMIN' OR role = 'admin') 
                                   AND pin_code = ?1 AND is_active = 1",
                                params![pin],
                                |r| Ok(r.get::<_, i64>(0)? > 0),
                            )
                            .unwrap_or(false);
                        valid
                    }
                    None => false,
                };

                if !is_authorized {
                    return Err(AppError::CreditLimitExceeded {
                        customer_id: req.customer_id,
                        limit_paisa: credit_limit_paisa,
                        current_paisa: current_balance_paisa,
                        attempted_paisa: due_paisa,
                    });
                } else {
                    // Record credit limit override in audit log
                    let _ = tx.execute(
                        "INSERT INTO audit_logs (
                            user_id, username, action, entity_type, entity_id,
                            reason, ip_address
                         ) VALUES (?1, 'admin', 'CREDIT_LIMIT_OVERRIDE', 'customers', ?2, 'Supervisor PIN credit override', '127.0.0.1')",
                        params![user_id, req.customer_id.to_string()],
                    );
                }
            }
        }

        // 6. Invoice number generation
        let invoice_number = match req.invoice_number {
            Some(ref num) if !num.trim().is_empty() => num.clone(),
            _ => generate_next_invoice_number(&tx, &invoice_date)?,
        };

        let crates_issued = req.crates_issued.unwrap_or(0);
        let crates_returned = req.crates_returned.unwrap_or(0);

        // 7. Insert sales_invoices header
        tx.execute(
            "INSERT INTO sales_invoices (
                invoice_number, customer_id, delivery_sheet_id, trip_id, invoice_date, due_date,
                subtotal_amount, subtotal_paisa, discount_amount, discount_paisa,
                tax_amount, tax_paisa, crate_deposit_charged, crate_deposit_charged_paisa,
                net_total_amount, net_total_paisa, paid_amount, paid_amount_paisa,
                due_amount, due_amount_paisa, payment_type, status,
                crates_issued, crates_returned, created_by
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, 0, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)",
            params![
                invoice_number,
                req.customer_id,
                req.delivery_sheet_id,
                req.trip_id,
                invoice_date,
                due_date,
                subtotal_paisa / 100,
                subtotal_paisa,
                inv_discount / 100,
                inv_discount,
                crate_deposit / 100,
                crate_deposit,
                net_total_paisa / 100,
                net_total_paisa,
                paid_paisa / 100,
                paid_paisa,
                due_paisa / 100,
                due_paisa,
                match req.payment_type {
                    PaymentType::Cash => "CASH",
                    PaymentType::Credit => "CREDIT",
                    PaymentType::Split => "SPLIT",
                    PaymentType::Bank => "BANK",
                },
                match status {
                    InvoiceStatus::Paid => "PAID",
                    InvoiceStatus::Partial => "PARTIAL",
                    InvoiceStatus::Unpaid => "UNPAID",
                    InvoiceStatus::Cancelled => "CANCELLED",
                },
                crates_issued,
                crates_returned,
                user_id
            ],
        )?;
        let invoice_id = tx.last_insert_rowid();

        // 8. Insert sales_invoice_items, decrement inventory & record movements
        let mut receipt_items = Vec::new();
        for (
            prod_id,
            p_name,
            sku,
            pack_name,
            units_per_pack,
            pack_qty,
            loose_qty,
            total_base,
            unit_price,
            line_disc,
            line_total,
            cogs_unit,
            cogs_line,
        ) in prepared_items
        {
            tx.execute(
                "INSERT INTO sales_invoice_items (
                    invoice_id, product_id, unit_chosen, pack_qty, loose_qty,
                    total_base_units, unit_price, unit_price_paisa, line_discount,
                    line_discount_paisa, line_total, line_total_paisa,
                    cogs_unit_cost, cogs_unit_cost_paisa, cogs_total, cogs_total_paisa
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                params![
                    invoice_id,
                    prod_id,
                    if pack_qty > 0 && loose_qty > 0 {
                        "MIXED"
                    } else if pack_qty > 0 {
                        "PACK"
                    } else {
                        "BASE"
                    },
                    pack_qty,
                    loose_qty,
                    total_base,
                    unit_price / 100,
                    unit_price,
                    line_disc / 100,
                    line_disc,
                    line_total / 100,
                    line_total,
                    cogs_unit / 100,
                    cogs_unit,
                    cogs_line / 100,
                    cogs_line
                ],
            )?;

            // Decrement product inventory
            tx.execute(
                "UPDATE products SET 
                    current_stock_base_units = current_stock_base_units - ?1,
                    stock_base_units = stock_base_units - ?1,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?2",
                params![total_base, prod_id],
            )?;

            // Decrement location balance (Location 1 = Main Depot Warehouse)
            tx.execute(
                "INSERT INTO product_location_balances (product_id, location_id, balance_base_units, updated_at)
                 VALUES (?1, 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 ON CONFLICT(product_id, location_id) DO UPDATE SET
                    balance_base_units = balance_base_units - ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                params![prod_id, total_base],
            )?;

            // Record stock movement
            let mov_code = format!("MOV-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
            tx.execute(
                "INSERT INTO stock_movements (
                    movement_code, product_id, movement_type, from_location_id,
                    delta_base_units, quantity_base_units, pack_qty, loose_qty,
                    unit_cost_paisa, total_cost_paisa, reference_doc_type,
                    reference_doc_id, reference_doc_number, notes, created_by
                 ) VALUES (?1, ?2, 'POS_SALE', 1, ?3, ?4, ?5, ?6, ?7, ?8, 'SALES_INVOICE', ?9, ?10, ?11, ?12)",
                params![
                    mov_code,
                    prod_id,
                    -total_base,
                    total_base,
                    pack_qty,
                    loose_qty,
                    cogs_unit,
                    cogs_line,
                    invoice_id,
                    invoice_number,
                    format!("POS Sale {}", invoice_number),
                    user_id
                ],
            )?;

            receipt_items.push(SalesInvoiceItemReceiptDto {
                product_id: prod_id,
                product_name: p_name,
                sku_code: sku,
                packaging_name: pack_name,
                units_per_pack,
                pack_qty,
                loose_qty,
                total_base_units: total_base,
                unit_price_paisa: unit_price,
                line_discount_paisa: line_disc,
                line_total_paisa: line_total,
                cogs_total_paisa: cogs_line,
            });
        }

        // 9. Crate circulation updates
        let net_crates_delta = crates_issued - crates_returned;
        let new_crate_balance = current_crate_balance + net_crates_delta;
        if net_crates_delta != 0 || crates_issued > 0 || crates_returned > 0 {
            tx.execute(
                "UPDATE customers SET 
                    current_crate_balance = ?1,
                    current_crates_balance = ?1,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?2",
                params![new_crate_balance, req.customer_id],
            )?;

            tx.execute(
                "INSERT INTO customer_crate_ledger (
                    customer_id, entry_date, voucher_ref, crates_out, crates_in, running_crate_balance
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    req.customer_id,
                    invoice_date,
                    invoice_number,
                    crates_issued,
                    crates_returned,
                    new_crate_balance
                ],
            )?;

            tx.execute(
                "INSERT INTO empties_ledger (
                    entity_type, entity_id, entry_date, voucher_type, voucher_number,
                    crates_out, crates_in, running_crates_balance, notes, created_by
                 ) VALUES ('CUSTOMER', ?1, ?2, 'POS_SALE', ?3, ?4, ?5, ?6, 'POS crate movement', ?7)",
                params![
                    req.customer_id,
                    invoice_date,
                    invoice_number,
                    crates_issued,
                    crates_returned,
                    new_crate_balance,
                    user_id
                ],
            )?;

            let wh_crate_delta = (crates_returned - crates_issued) as i64;
            tx.execute(
                "UPDATE products SET empty_crates_stock = empty_crates_stock + ?1 WHERE packaging_type = 'RGB_GLASS'",
                params![wh_crate_delta],
            )?;
        }

        // 10. Security deposit liability
        if crate_deposit > 0 {
            tx.execute(
                "UPDATE customers SET 
                    security_deposit_balance_paisa = security_deposit_balance_paisa + ?1,
                    deposit_balance = deposit_balance + ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?3",
                params![crate_deposit, crate_deposit / 100, req.customer_id],
            )?;

            let dep_voucher = format!("DEP-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
            tx.execute(
                "INSERT INTO security_deposits (
                    customer_id, deposit_date, voucher_type, voucher_id, voucher_number,
                    crates_count, deposit_rate_per_crate_paisa, deposit_in_paisa, deposit_out_paisa,
                    running_deposit_liability_paisa, account_id, payment_mode, notes, created_by
                 ) VALUES (?1, ?2, 'POS_SALE', ?3, ?4, ?5, ?6, ?7, 0, 
                          (SELECT security_deposit_balance_paisa FROM customers WHERE id = ?1), 16, 'CASH', 'POS Crate Security Deposit', ?8)",
                params![
                    req.customer_id,
                    invoice_date,
                    invoice_id,
                    dep_voucher,
                    crates_issued,
                    if crates_issued > 0 {
                        crate_deposit / (crates_issued as i64)
                    } else {
                        crate_deposit
                    },
                    crate_deposit,
                    user_id
                ],
            )?;
        }

        // 11. Strict Liquid Cash Book / Bank Book update (ONLY if paid > 0)
        // GOLDEN CASH INVARIANT: Zero cash book records on 100% credit sales!
        let mut cash_book_entry_id = None;
        if paid_paisa > 0 {
            if req.payment_type == PaymentType::Bank {
                // Bank payments: Record in bank_transactions (Account 1020), do NOT touch cash_book
                let prev_bank: i64 = tx
                    .query_row(
                        "SELECT running_balance_paisa FROM bank_transactions ORDER BY id DESC LIMIT 1",
                        [],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                let new_bank = prev_bank + paid_paisa;

                tx.execute(
                    "INSERT INTO bank_transactions (
                        bank_name, account_number, transaction_date, transaction_type,
                        instrument_type, instrument_number, particulars,
                        deposit_paisa, withdrawal_paisa, running_balance_paisa,
                        is_cleared, clearance_date, journal_entry_id, created_by
                     ) VALUES (
                        'Main Operating Bank', 'PKR-OPERATING-01', ?1, 'POS_SALE',
                        'ONLINE_RAAST', ?2, ?3,
                        ?4, 0, ?5,
                        1, ?1, NULL, ?6
                     )",
                    params![
                        invoice_date,
                        invoice_number,
                        format!("POS Bank Sale (Raast / IBFT) - {}", invoice_number),
                        paid_paisa,
                        new_bank,
                        user_id
                    ],
                )?;
                cash_book_entry_id = None;
            } else {
                let prev_cash: i64 = tx
                    .query_row(
                        "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                        [],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                let new_cash = prev_cash + paid_paisa;

                tx.execute(
                    "INSERT INTO cash_book (
                        entry_date, transaction_type, voucher_ref_type, voucher_ref_id,
                        voucher_ref_number, account_id, account_code, particulars, description,
                        cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                        running_balance_paisa, running_cash_balance, created_by
                     ) VALUES (?1, 'CASH_SALE', 'INVOICE', ?2, ?3, 2, '1010', ?4, ?5, ?6, ?7, 0, 0, ?8, ?9, ?10)",
                    params![
                        invoice_date,
                        invoice_id,
                        invoice_number,
                        format!("POS Cash Sale - {}", invoice_number),
                        format!("Cash collected from {} for {}", shop_name, invoice_number),
                        paid_paisa / 100,
                        paid_paisa,
                        new_cash,
                        new_cash / 100,
                        user_id
                    ],
                )?;
                cash_book_entry_id = Some(tx.last_insert_rowid());
            }
        }

        // 12. Customer Khata update (if credit due > 0)
        let new_customer_balance_paisa = current_balance_paisa + due_paisa;
        if due_paisa > 0 {
            tx.execute(
                "UPDATE customers SET 
                    current_balance_paisa = ?1,
                    current_balance = ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?3",
                params![
                    new_customer_balance_paisa,
                    new_customer_balance_paisa / 100,
                    req.customer_id
                ],
            )?;

            tx.execute(
                "INSERT INTO customer_ledger (
                    customer_id, entry_date, voucher_type, voucher_ref_id,
                    description, debit, credit, running_balance
                 ) VALUES (?1, ?2, 'SALE_INVOICE', ?3, ?4, ?5, 0, ?6)",
                params![
                    req.customer_id,
                    invoice_date,
                    invoice_id,
                    format!("Invoice {} (Credit)", invoice_number),
                    due_paisa / 100,
                    new_customer_balance_paisa / 100
                ],
            )?;
        }

        // 13. General Ledger Journal Entries
        // Entry 1: Sales Journal
        let jv_num = format!("JV-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
        tx.execute(
            "INSERT INTO journal_entries (
                entry_number, entry_date, voucher_type, reference_doc_type,
                reference_doc_id, narration, is_balanced, created_by
             ) VALUES (?1, ?2, 'SALE', 'SALES_INVOICE', ?3, ?4, 1, ?5)",
            params![
                jv_num,
                invoice_date,
                invoice_id,
                format!("Sales Invoice {}", invoice_number),
                user_id
            ],
        )?;
        let sales_jv_id = tx.last_insert_rowid();

        if paid_paisa > 0 {
            let (acc_id, narration) = if req.payment_type == PaymentType::Bank {
                (3, "Bank deposit received on sale (Raast / IBFT)")
            } else {
                (2, "Cash received on sale")
            };
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, ?2, ?3, 0, ?4)",
                params![sales_jv_id, acc_id, paid_paisa, narration],
            )?;
        }
        if due_paisa > 0 {
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration, customer_id)
                 VALUES (?1, 8, ?2, 0, 'Accounts Receivable on trade credit', ?3)",
                params![sales_jv_id, due_paisa, req.customer_id],
            )?;
        }
        let beverage_revenue_paisa = discounted_subtotal;
        if beverage_revenue_paisa > 0 {
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 23, 0, ?2, 'Beverage Sales Revenue')",
                params![sales_jv_id, beverage_revenue_paisa],
            )?;
        }
        if crate_deposit > 0 {
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration, customer_id)
                 VALUES (?1, 16, 0, ?2, 'Customer Crate Security Deposit Liability', ?3)",
                params![sales_jv_id, crate_deposit, req.customer_id],
            )?;
        }

        // Entry 2: COGS Journal
        let cogs_jv_num = format!("JV-COGS-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
        tx.execute(
            "INSERT INTO journal_entries (
                entry_number, entry_date, voucher_type, reference_doc_type,
                reference_doc_id, narration, is_balanced, created_by
             ) VALUES (?1, ?2, 'SALE', 'SALES_INVOICE_COGS', ?3, ?4, 1, ?5)",
            params![
                cogs_jv_num,
                invoice_date,
                invoice_id,
                format!("COGS for Invoice {}", invoice_number),
                user_id
            ],
        )?;
        let cogs_jv_id = tx.last_insert_rowid();

        if total_cogs_paisa > 0 {
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 26, ?2, 0, 'Cost of Goods Sold - Beverages')",
                params![cogs_jv_id, total_cogs_paisa],
            )?;
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 5, 0, ?2, 'Inventory - Liquid Beverages')",
                params![cogs_jv_id, total_cogs_paisa],
            )?;
        }

        // 14. Commit atomic transaction
        tx.commit()?;

        // 15. Format thermal receipt
        let thermal_receipt = format_pos_receipt(
            &invoice_number,
            &invoice_date,
            &shop_name,
            &customer_name,
            &phone,
            &receipt_items,
            subtotal_paisa,
            inv_discount,
            crate_deposit,
            net_total_paisa,
            paid_paisa,
            due_paisa,
            crates_issued,
            crates_returned,
            new_customer_balance_paisa,
            new_crate_balance,
        );

        Ok(SalesInvoiceReceiptDto {
            invoice_id,
            invoice_number,
            invoice_date,
            due_date,
            customer_id: req.customer_id,
            customer_name,
            shop_name,
            customer_phone: phone,
            items: receipt_items,
            subtotal_paisa,
            discount_paisa: inv_discount,
            crate_deposit_charged_paisa: crate_deposit,
            net_total_paisa,
            paid_amount_paisa: paid_paisa,
            due_amount_paisa: due_paisa,
            payment_type: req.payment_type,
            status,
            previous_customer_balance_paisa: current_balance_paisa,
            new_customer_balance_paisa,
            crates_issued,
            crates_returned,
            previous_crate_balance: current_crate_balance,
            new_crate_balance,
            sales_journal_entry_id: sales_jv_id,
            cogs_journal_entry_id: cogs_jv_id,
            cash_book_entry_id,
            formatted_thermal_receipt: thermal_receipt,
        })
    }

    pub fn get_invoice_by_id(
        conn: &Connection,
        invoice_id: i64,
    ) -> Result<SalesInvoiceReceiptDto, AppError> {
        let (
            invoice_number,
            customer_id,
            invoice_date,
            due_date,
            subtotal_paisa,
            discount_paisa,
            crate_deposit_paisa,
            net_total_paisa,
            paid_paisa,
            due_paisa,
            payment_type_str,
            status_str,
            crates_issued,
            crates_returned,
        ): (
            String,
            i64,
            String,
            String,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            String,
            String,
            i32,
            i32,
        ) = conn
            .query_row(
                "SELECT invoice_number, customer_id, invoice_date, due_date,
                        subtotal_paisa, discount_paisa, crate_deposit_charged_paisa,
                        net_total_paisa, paid_amount_paisa, due_amount_paisa,
                        payment_type, status, crates_issued, crates_returned
                 FROM sales_invoices WHERE id = ?1",
                params![invoice_id],
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
                        r.get(10)?,
                        r.get(11)?,
                        r.get(12)?,
                        r.get(13)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "SalesInvoice".into(),
                id: invoice_id.to_string(),
            })?;

        let (customer_name, shop_name, phone, current_balance_paisa, current_crate_balance): (
            String,
            String,
            String,
            i64,
            i32,
        ) = conn
            .query_row(
                "SELECT name, shop_name, phone, current_balance_paisa, current_crate_balance FROM customers WHERE id = ?1",
                params![customer_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap_or_else(|_| ("Unknown".into(), "Unknown".into(), "".into(), 0, 0));

        let mut stmt = conn.prepare(
            "SELECT sii.product_id, p.name, p.sku_code, p.default_pack_name, p.units_per_pack,
                    sii.pack_qty, sii.loose_qty, sii.total_base_units, sii.unit_price_paisa,
                    sii.line_discount_paisa, sii.line_total_paisa, sii.cogs_total_paisa
             FROM sales_invoice_items sii
             JOIN products p ON sii.product_id = p.id
             WHERE sii.invoice_id = ?1",
        )?;

        let items: Vec<SalesInvoiceItemReceiptDto> = stmt
            .query_map(params![invoice_id], |r| {
                Ok(SalesInvoiceItemReceiptDto {
                    product_id: r.get(0)?,
                    product_name: r.get(1)?,
                    sku_code: r.get(2)?,
                    packaging_name: r.get(3)?,
                    units_per_pack: r.get(4)?,
                    pack_qty: r.get(5)?,
                    loose_qty: r.get(6)?,
                    total_base_units: r.get(7)?,
                    unit_price_paisa: r.get(8)?,
                    line_discount_paisa: r.get(9)?,
                    line_total_paisa: r.get(10)?,
                    cogs_total_paisa: r.get(11)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let payment_type = match payment_type_str.as_str() {
            "CASH" => PaymentType::Cash,
            "CREDIT" => PaymentType::Credit,
            "SPLIT" => PaymentType::Split,
            _ => PaymentType::Bank,
        };

        let status = match status_str.as_str() {
            "PAID" => InvoiceStatus::Paid,
            "PARTIAL" => InvoiceStatus::Partial,
            "CANCELLED" => InvoiceStatus::Cancelled,
            _ => InvoiceStatus::Unpaid,
        };

        let receipt_text = format_pos_receipt(
            &invoice_number,
            &invoice_date,
            &shop_name,
            &customer_name,
            &phone,
            &items,
            subtotal_paisa,
            discount_paisa,
            crate_deposit_paisa,
            net_total_paisa,
            paid_paisa,
            due_paisa,
            crates_issued,
            crates_returned,
            current_balance_paisa,
            current_crate_balance,
        );

        Ok(SalesInvoiceReceiptDto {
            invoice_id,
            invoice_number,
            invoice_date,
            due_date,
            customer_id,
            customer_name,
            shop_name,
            customer_phone: phone,
            items,
            subtotal_paisa,
            discount_paisa,
            crate_deposit_charged_paisa: crate_deposit_paisa,
            net_total_paisa,
            paid_amount_paisa: paid_paisa,
            due_amount_paisa: due_paisa,
            payment_type,
            status,
            previous_customer_balance_paisa: current_balance_paisa - due_paisa,
            new_customer_balance_paisa: current_balance_paisa,
            crates_issued,
            crates_returned,
            previous_crate_balance: current_crate_balance - (crates_issued - crates_returned),
            new_crate_balance: current_crate_balance,
            sales_journal_entry_id: 0,
            cogs_journal_entry_id: 0,
            cash_book_entry_id: None,
            formatted_thermal_receipt: receipt_text,
        })
    }

    pub fn list_invoices(
        conn: &Connection,
        limit: Option<usize>,
    ) -> Result<Vec<SalesInvoiceListItemDto>, AppError> {
        let max_rows = limit.unwrap_or(50);
        let mut stmt = conn.prepare(
            "SELECT si.id, si.invoice_number, si.customer_id, c.name, si.invoice_date,
                    si.net_total_paisa, si.paid_amount_paisa, si.due_amount_paisa,
                    si.payment_type, si.status, si.crates_issued, si.crates_returned,
                    si.is_cancelled, si.is_locked, si.created_at
             FROM sales_invoices si
             JOIN customers c ON si.customer_id = c.id
             ORDER BY si.id DESC LIMIT ?1",
        )?;

        let list = stmt
            .query_map(params![max_rows as i64], |r| {
                Ok(SalesInvoiceListItemDto {
                    id: r.get(0)?,
                    invoice_number: r.get(1)?,
                    customer_id: r.get(2)?,
                    customer_name: r.get(3)?,
                    invoice_date: r.get(4)?,
                    net_total_paisa: r.get(5)?,
                    paid_amount_paisa: r.get(6)?,
                    due_amount_paisa: r.get(7)?,
                    payment_type: r.get(8)?,
                    status: r.get(9)?,
                    crates_issued: r.get(10)?,
                    crates_returned: r.get(11)?,
                    is_cancelled: r.get::<_, i32>(12)? == 1,
                    is_locked: r.get::<_, i32>(13)? == 1,
                    created_at: r.get(14)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(list)
    }

    pub fn check_credit_status(
        conn: &Connection,
        customer_id: i64,
        attempted_credit_paisa: i64,
    ) -> Result<CreditStatusCheckResult, AppError> {
        let (customer_name, credit_limit_paisa, current_balance_paisa): (String, i64, i64) = conn
            .query_row(
                "SELECT name, credit_limit_paisa, current_balance_paisa FROM customers WHERE id = ?1",
                params![customer_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Customer".into(),
                id: customer_id.to_string(),
            })?;

        let total_exposure_paisa = current_balance_paisa + attempted_credit_paisa;
        let utilization_percentage = if credit_limit_paisa > 0 {
            (total_exposure_paisa * 100) / credit_limit_paisa
        } else {
            0
        };

        let is_breached = credit_limit_paisa > 0 && total_exposure_paisa > credit_limit_paisa;
        let is_warning = !is_breached && utilization_percentage >= 80;

        let status = if is_breached {
            "BLOCKED"
        } else if is_warning {
            "WARNING"
        } else {
            "ACTIVE"
        };

        Ok(CreditStatusCheckResult {
            customer_id,
            customer_name,
            credit_limit_paisa,
            current_balance_paisa,
            attempted_credit_paisa,
            total_exposure_paisa,
            utilization_percentage,
            is_warning,
            is_breached,
            status: status.to_string(),
        })
    }
}
