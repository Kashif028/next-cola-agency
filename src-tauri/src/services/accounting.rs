use chrono::{Local, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

use crate::domain::dtos::*;
use crate::domain::errors::AppError;

pub struct AccountingService;

impl AccountingService {
    // ========================================================================
    // 1. INVARIANT-ENFORCING GENERAL JOURNAL POSTING
    // ========================================================================
    pub fn post_journal_entry(
        tx: &Transaction,
        input: CreateJournalEntryInput,
    ) -> Result<i64, AppError> {
        if input.lines.is_empty() {
            return Err(AppError::Validation("Cannot post empty journal entry with 0 lines".into()));
        }

        let total_debit: i64 = input.lines.iter().map(|l| l.debit_paisa).sum();
        let total_credit: i64 = input.lines.iter().map(|l| l.credit_paisa).sum();

        if total_debit <= 0 {
            return Err(AppError::Validation("Journal entry total debit must be positive".into()));
        }

        // STRICT FUNDAMENTAL ACCOUNTING INVARIANT ENFORCEMENT
        if total_debit != total_credit {
            return Err(AppError::Validation(format!(
                "Unbalanced journal entry rejected! Total debits ({} Paisas) != Total credits ({} Paisas)",
                total_debit, total_credit
            )));
        }

        // Validate each line follows standard debit OR credit invariant
        for (idx, line) in input.lines.iter().enumerate() {
            let valid = (line.debit_paisa > 0 && line.credit_paisa == 0)
                || (line.credit_paisa > 0 && line.debit_paisa == 0);
            if !valid {
                return Err(AppError::Validation(format!(
                    "Line {} violated invariant: exactly one of debit_paisa ({}) or credit_paisa ({}) must be > 0",
                    idx + 1, line.debit_paisa, line.credit_paisa
                )));
            }

            // Verify account_id exists in chart_of_accounts
            let exists: bool = tx
                .query_row(
                    "SELECT COUNT(*) FROM chart_of_accounts WHERE id = ?1 AND is_active = 1",
                    params![line.account_id],
                    |r| Ok(r.get::<_, i64>(0)? > 0),
                )
                .unwrap_or(false);

            if !exists {
                return Err(AppError::Validation(format!(
                    "Account #{} not found in Chart of Accounts",
                    line.account_id
                )));
            }
        }

        let entry_num = format!("JE-{}", Uuid::new_v4().to_string()[..8].to_uppercase());

        tx.execute(
            "INSERT INTO journal_entries (
                entry_number, entry_date, voucher_type, reference_doc_type,
                reference_doc_id, narration, is_balanced, created_by
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
            params![
                entry_num,
                input.entry_date,
                input.voucher_type,
                input.reference_doc_type,
                input.reference_doc_id,
                input.narration,
                input.created_by
            ],
        )?;

        let entry_id = tx.last_insert_rowid();

        for line in input.lines {
            tx.execute(
                "INSERT INTO journal_lines (
                    entry_id, account_id, debit_paisa, credit_paisa,
                    line_narration, customer_id, supplier_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    entry_id,
                    line.account_id,
                    line.debit_paisa,
                    line.credit_paisa,
                    line.line_narration,
                    line.customer_id,
                    line.supplier_id
                ],
            )?;
        }

        Ok(entry_id)
    }

    // ========================================================================
    // 2. CUSTOMER LEDGER STATEMENT WITH DATE FILTERS & OPENING BALANCE
    // ========================================================================
    pub fn get_customer_ledger(
        conn: &Connection,
        customer_id: i64,
        from_date: Option<&str>,
        to_date: Option<&str>,
    ) -> Result<CustomerLedgerStatementDto, AppError> {
        let (code, name, shop_name, phone, address, price_tier, credit_limit_paisa, current_balance_paisa): (
            String, String, String, String, String, String, i64, i64,
        ) = conn
            .query_row(
                "SELECT code, name, shop_name, phone, address, price_tier, credit_limit_paisa, current_balance_paisa
                 FROM customers WHERE id = ?1",
                params![customer_id],
                |r| {
                    Ok((
                        r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?,
                        r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?,
                    ))
                },
            )
            .map_err(|_| AppError::NotFound { entity: "Customer".into(), id: customer_id.to_string() })?;

        // 1. Calculate opening balance prior to from_date
        let opening_balance_paisa: i64 = if let Some(from) = from_date {
            conn.query_row(
                "SELECT COALESCE(SUM(
                    CASE 
                        WHEN debit_paisa > 0 OR credit_paisa > 0 THEN (debit_paisa - credit_paisa)
                        ELSE (debit - credit) * 100 
                    END
                 ), 0)
                 FROM customer_ledger
                 WHERE customer_id = ?1 AND entry_date < ?2",
                params![customer_id, from],
                |r| r.get(0),
            )?
        } else {
            0
        };

        // 2. Fetch period transactions
        let mut query = String::from(
            "SELECT id, customer_id, entry_date, voucher_type, voucher_ref_id, voucher_number,
                    description, debit, credit, debit_paisa, credit_paisa, running_balance_paisa, created_at
             FROM customer_ledger
             WHERE customer_id = ?1",
        );
        let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(customer_id)];

        if let Some(from) = from_date {
            query.push_str(" AND entry_date >= ?");
            query_params.push(Box::new(from.to_string()));
        }
        if let Some(to) = to_date {
            query.push_str(" AND entry_date <= ?");
            query_params.push(Box::new(to.to_string()));
        }
        query.push_str(" ORDER BY entry_date ASC, id ASC");

        let mut stmt = conn.prepare(&query)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = query_params.iter().map(|b| b.as_ref()).collect();

        let mut entries = Vec::new();
        let mut running_accum = opening_balance_paisa;
        let mut total_debit = 0i64;
        let mut total_credit = 0i64;

        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            let id: i64 = row.get(0)?;
            let cust_id: i64 = row.get(1)?;
            let entry_date: String = row.get(2)?;
            let voucher_type: String = row.get(3)?;
            let voucher_ref_id: Option<i64> = row.get(4)?;
            let voucher_number: Option<String> = row.get(5)?;
            let description: String = row.get(6)?;
            let debit_raw: i64 = row.get(7)?;
            let credit_raw: i64 = row.get(8)?;
            let mut dp: i64 = row.get(9).unwrap_or(0);
            let mut cp: i64 = row.get(10).unwrap_or(0);

            if dp == 0 && cp == 0 {
                dp = debit_raw * 100;
                cp = credit_raw * 100;
            }

            let created_at: String = row.get(12)?;

            Ok((
                id, cust_id, entry_date, voucher_type, voucher_ref_id, voucher_number,
                description, dp, cp, created_at,
            ))
        })?;

        for r in rows {
            let (id, cust_id, entry_date, voucher_type, voucher_ref_id, voucher_number, description, dp, cp, created_at) = r?;
            running_accum = running_accum + dp - cp;
            total_debit += dp;
            total_credit += cp;

            entries.push(CustomerLedgerEntryDto {
                id,
                customer_id: cust_id,
                entry_date,
                voucher_type,
                voucher_ref_id,
                voucher_number,
                description,
                debit_paisa: dp,
                credit_paisa: cp,
                debit: dp as f64 / 100.0,
                credit: cp as f64 / 100.0,
                running_balance_paisa: running_accum,
                running_balance: running_accum as f64 / 100.0,
                created_at,
            });
        }

        let closing_balance_paisa = opening_balance_paisa + total_debit - total_credit;

        Ok(CustomerLedgerStatementDto {
            customer_id,
            customer_code: code,
            customer_name: name,
            shop_name,
            phone,
            address,
            price_tier,
            credit_limit_paisa,
            from_date: from_date.map(String::from),
            to_date: to_date.map(String::from),
            opening_balance_paisa,
            opening_balance: opening_balance_paisa as f64 / 100.0,
            entries,
            total_debit_paisa: total_debit,
            total_credit_paisa: total_credit,
            total_debit: total_debit as f64 / 100.0,
            total_credit: total_credit as f64 / 100.0,
            closing_balance_paisa,
            closing_balance: closing_balance_paisa as f64 / 100.0,
            current_outstanding_paisa: current_balance_paisa,
        })
    }

    // ========================================================================
    // 3. SUPPLIER LEDGER STATEMENT WITH DATE FILTERS & OPENING PAYABLE
    // ========================================================================
    pub fn get_supplier_ledger(
        conn: &Connection,
        supplier_id: i64,
        from_date: Option<&str>,
        to_date: Option<&str>,
    ) -> Result<SupplierLedgerStatementDto, AppError> {
        let (code, name, company_name, phone, supplier_type, current_payable_paisa): (
            Option<String>, String, String, String, String, i64,
        ) = conn
            .query_row(
                "SELECT code, name, company_name, phone, supplier_type, current_payable_paisa
                 FROM suppliers WHERE id = ?1",
                params![supplier_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .map_err(|_| AppError::NotFound { entity: "Supplier".into(), id: supplier_id.to_string() })?;

        // 1. Calculate opening payable prior to from_date
        let opening_payable_paisa: i64 = if let Some(from) = from_date {
            conn.query_row(
                "SELECT COALESCE(SUM(
                    CASE 
                        WHEN credit_paisa > 0 OR debit_paisa > 0 THEN (credit_paisa - debit_paisa)
                        ELSE (credit - debit) * 100 
                    END
                 ), 0)
                 FROM supplier_ledger
                 WHERE supplier_id = ?1 AND entry_date < ?2",
                params![supplier_id, from],
                |r| r.get(0),
            )?
        } else {
            0
        };

        // 2. Fetch period transactions
        let mut query = String::from(
            "SELECT id, supplier_id, entry_date, voucher_type, voucher_ref_id, voucher_number,
                    description, debit, credit, debit_paisa, credit_paisa, running_balance_paisa, created_at
             FROM supplier_ledger
             WHERE supplier_id = ?1",
        );
        let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(supplier_id)];

        if let Some(from) = from_date {
            query.push_str(" AND entry_date >= ?");
            query_params.push(Box::new(from.to_string()));
        }
        if let Some(to) = to_date {
            query.push_str(" AND entry_date <= ?");
            query_params.push(Box::new(to.to_string()));
        }
        query.push_str(" ORDER BY entry_date ASC, id ASC");

        let mut stmt = conn.prepare(&query)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = query_params.iter().map(|b| b.as_ref()).collect();

        let mut entries = Vec::new();
        let mut running_accum = opening_payable_paisa;
        let mut total_credit = 0i64;
        let mut total_debit = 0i64;

        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            let id: i64 = row.get(0)?;
            let supp_id: i64 = row.get(1)?;
            let entry_date: String = row.get(2)?;
            let voucher_type: String = row.get(3)?;
            let voucher_ref_id: Option<i64> = row.get(4)?;
            let voucher_number: Option<String> = row.get(5)?;
            let description: String = row.get(6)?;
            let debit_raw: i64 = row.get(7)?;
            let credit_raw: i64 = row.get(8)?;
            let mut dp: i64 = row.get(9).unwrap_or(0);
            let mut cp: i64 = row.get(10).unwrap_or(0);

            if dp == 0 && cp == 0 {
                dp = debit_raw * 100;
                cp = credit_raw * 100;
            }

            let created_at: String = row.get(12)?;

            Ok((
                id, supp_id, entry_date, voucher_type, voucher_ref_id, voucher_number,
                description, dp, cp, created_at,
            ))
        })?;

        for r in rows {
            let (id, supp_id, entry_date, voucher_type, voucher_ref_id, voucher_number, description, dp, cp, created_at) = r?;
            running_accum = running_accum + cp - dp;
            total_credit += cp;
            total_debit += dp;

            entries.push(SupplierLedgerEntryDto {
                id,
                supplier_id: supp_id,
                entry_date,
                voucher_type,
                voucher_ref_id,
                voucher_number,
                description,
                debit_paisa: dp,
                credit_paisa: cp,
                debit: dp as f64 / 100.0,
                credit: cp as f64 / 100.0,
                running_balance_paisa: running_accum,
                running_balance: running_accum as f64 / 100.0,
                created_at,
            });
        }

        let closing_payable_paisa = opening_payable_paisa + total_credit - total_debit;

        Ok(SupplierLedgerStatementDto {
            supplier_id,
            supplier_code: code,
            supplier_name: name,
            company_name,
            phone,
            supplier_type,
            from_date: from_date.map(String::from),
            to_date: to_date.map(String::from),
            opening_payable_paisa,
            opening_payable: opening_payable_paisa as f64 / 100.0,
            entries,
            total_credit_paisa: total_credit,
            total_debit_paisa: total_debit,
            total_credit: total_credit as f64 / 100.0,
            total_debit: total_debit as f64 / 100.0,
            closing_payable_paisa,
            closing_payable: closing_payable_paisa as f64 / 100.0,
            current_payable_paisa,
        })
    }

    // ========================================================================
    // 4. 5-BUCKET UDHAAR AGING CALCULATOR
    // ========================================================================
    pub fn calculate_customer_aging(
        conn: &Connection,
        customer_id: i64,
        as_of_date_opt: Option<&str>,
    ) -> Result<CustomerUdhaarAgingDto, AppError> {
        let as_of_date_str = as_of_date_opt.unwrap_or("");
        let as_of_date = if as_of_date_str.is_empty() {
            Utc::now().date_naive()
        } else {
            NaiveDate::parse_from_str(as_of_date_str, "%Y-%m-%d")
                .map_err(|e| AppError::Validation(format!("Invalid as_of_date format: {}", e)))?
        };
        let effective_as_of = as_of_date.format("%Y-%m-%d").to_string();

        let (code, name, shop_name, phone, route_id, route_name, credit_limit_paisa, current_balance_paisa, credit_status): (
            String, String, String, String, Option<i64>, Option<String>, i64, i64, String
        ) = conn
            .query_row(
                "SELECT c.code, c.name, c.shop_name, c.phone, c.route_id, r.route_name,
                        c.credit_limit_paisa, c.current_balance_paisa, c.credit_status
                 FROM customers c
                 LEFT JOIN delivery_routes r ON c.route_id = r.id
                 WHERE c.id = ?1",
                params![customer_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound { entity: "Customer".into(), id: customer_id.to_string() })?;

        let mut stmt = conn.prepare(
            "SELECT id, invoice_number, invoice_date, due_date, net_total_paisa, paid_amount_paisa, due_amount_paisa 
             FROM sales_invoices 
             WHERE customer_id = ?1 AND status IN ('UNPAID', 'PARTIAL') 
               AND is_cancelled = 0 AND due_amount_paisa > 0 
               AND invoice_date <= ?2
             ORDER BY invoice_date ASC, id ASC",
        )?;

        let rows = stmt.query_map(params![customer_id, &effective_as_of], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
            ))
        })?;

        let mut b_0_7: i64 = 0;
        let mut b_8_15: i64 = 0;
        let mut b_16_30: i64 = 0;
        let mut b_31_60: i64 = 0;
        let mut b_60_plus: i64 = 0;
        let mut total_due: i64 = 0;
        let mut invoices = Vec::new();

        for row in rows {
            let (inv_id, inv_num, inv_date_str, due_date_str, net_paisa, paid_paisa, due_paisa) = row?;
            let inv_date = match NaiveDate::parse_from_str(&inv_date_str, "%Y-%m-%d") {
                Ok(d) => d,
                Err(_) => as_of_date,
            };
            let raw_diff = (as_of_date - inv_date).num_days();
            if raw_diff < 0 {
                // Defensive guard: ignore future invoices relative to as_of_date
                continue;
            }
            let diff_days = raw_diff;

            total_due += due_paisa;

            let bucket_str = if diff_days <= 7 {
                b_0_7 += due_paisa;
                "0_7"
            } else if diff_days <= 15 {
                b_8_15 += due_paisa;
                "8_15"
            } else if diff_days <= 30 {
                b_16_30 += due_paisa;
                "16_30"
            } else if diff_days <= 60 {
                b_31_60 += due_paisa;
                "31_60"
            } else {
                b_60_plus += due_paisa;
                "60_PLUS"
            };

            invoices.push(InvoiceAgingItemDto {
                invoice_id: inv_id,
                invoice_number: inv_num,
                invoice_date: inv_date_str,
                due_date: due_date_str,
                age_days: diff_days,
                bucket: bucket_str.to_string(),
                net_total_paisa: net_paisa,
                paid_amount_paisa: paid_paisa,
                due_amount_paisa: due_paisa,
            });
        }

        Ok(CustomerUdhaarAgingDto {
            customer_id,
            customer_code: code,
            customer_name: name,
            shop_name,
            phone,
            route_id,
            route_name,
            credit_limit_paisa,
            current_balance_paisa,
            credit_status,
            as_of_date: effective_as_of,
            bucket_0_7_paisa: b_0_7,
            bucket_8_15_paisa: b_8_15,
            bucket_16_30_paisa: b_16_30,
            bucket_31_60_paisa: b_31_60,
            bucket_60_plus_paisa: b_60_plus,
            total_outstanding_paisa: total_due,
            invoices,
        })
    }

    pub fn calculate_agency_aging(
        conn: &Connection,
        as_of_date_opt: Option<&str>,
        route_id_filter: Option<i64>,
    ) -> Result<AgencyUdhaarAgingReportDto, AppError> {
        let as_of_date_str = as_of_date_opt.unwrap_or("");
        let as_of_date = if as_of_date_str.is_empty() {
            Utc::now().date_naive()
        } else {
            NaiveDate::parse_from_str(as_of_date_str, "%Y-%m-%d")
                .map_err(|e| AppError::Validation(format!("Invalid as_of_date format: {}", e)))?
        };
        let effective_as_of = as_of_date.format("%Y-%m-%d").to_string();

        let mut sql = "SELECT id FROM customers WHERE is_active = 1".to_string();
        if let Some(r_id) = route_id_filter {
            sql.push_str(&format!(" AND route_id = {}", r_id));
        }
        sql.push_str(" ORDER BY name ASC");

        let mut stmt = conn.prepare(&sql)?;
        let cust_ids: Vec<i64> = stmt
            .query_map([], |r| r.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        let total_customers = cust_ids.len();
        let mut customers_with_debt = 0;
        let mut total_0_7 = 0;
        let mut total_8_15 = 0;
        let mut total_16_30 = 0;
        let mut total_31_60 = 0;
        let mut total_60_plus = 0;
        let mut grand_total = 0;
        let mut customer_agings = Vec::new();

        for cid in cust_ids {
            let aging = Self::calculate_customer_aging(conn, cid, Some(&effective_as_of))?;
            if aging.total_outstanding_paisa > 0 {
                customers_with_debt += 1;
                total_0_7 += aging.bucket_0_7_paisa;
                total_8_15 += aging.bucket_8_15_paisa;
                total_16_30 += aging.bucket_16_30_paisa;
                total_31_60 += aging.bucket_31_60_paisa;
                total_60_plus += aging.bucket_60_plus_paisa;
                grand_total += aging.total_outstanding_paisa;
                customer_agings.push(aging);
            }
        }

        Ok(AgencyUdhaarAgingReportDto {
            as_of_date: effective_as_of,
            total_customers,
            customers_with_debt,
            total_bucket_0_7_paisa: total_0_7,
            total_bucket_8_15_paisa: total_8_15,
            total_bucket_16_30_paisa: total_16_30,
            total_bucket_31_60_paisa: total_31_60,
            total_bucket_60_plus_paisa: total_60_plus,
            grand_total_outstanding_paisa: grand_total,
            customer_agings,
        })
    }

    // ========================================================================
    // 5. FLEXIBLE CUSTOMER RECOVERY ALLOCATION (MODES A, B, C)
    // ========================================================================
    pub fn record_customer_recovery(
        conn: &mut Connection,
        req: RecordCustomerRecoveryDto,
    ) -> Result<RecoveryReceiptDto, AppError> {
        if req.amount_paisa <= 0 {
            return Err(AppError::Validation("Recovery amount must be greater than zero".into()));
        }

        let user_id = req.user_id.unwrap_or(1);
        let recovery_date = req.payment_date.clone().unwrap_or_else(|| {
            Local::now().format("%Y-%m-%d").to_string()
        });

        let tx = conn.transaction()?;

        // Day-locking guard
        let is_locked: bool = tx
            .query_row(
                "SELECT COUNT(*) FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                params![recovery_date],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);

        if is_locked {
            return Err(AppError::DayLocked(format!(
                "Accounting date {} is locked by finalized daily closing",
                recovery_date
            )));
        }

        let (customer_name, shop_name, phone, current_balance_paisa, credit_limit_paisa): (
            String, String, String, i64, i64,
        ) = tx
            .query_row(
                "SELECT name, shop_name, phone, current_balance_paisa, credit_limit_paisa 
                 FROM customers WHERE id = ?1",
                params![req.customer_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .map_err(|_| AppError::NotFound { entity: "Customer".into(), id: req.customer_id.to_string() })?;

        let recovery_number = format!("REC-{}", Uuid::new_v4().to_string()[..8].to_uppercase());

        let alloc_mode_str = req.allocation_mode.as_deref().unwrap_or("FIFO").to_uppercase();

        let mut remaining_recovery = req.amount_paisa;
        let mut allocations = Vec::new();

        if alloc_mode_str == "SPECIFIC" {
            if let Some(ref target_ids) = req.target_invoice_ids {
                for &inv_id in target_ids {
                    if remaining_recovery <= 0 {
                        break;
                    }
                    let inv_opt: Option<(String, String, i64, i64)> = tx
                        .query_row(
                            "SELECT invoice_number, invoice_date, paid_amount_paisa, due_amount_paisa 
                             FROM sales_invoices 
                             WHERE id = ?1 AND customer_id = ?2 AND is_cancelled = 0 AND due_amount_paisa > 0",
                            params![inv_id, req.customer_id],
                            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                        )
                        .optional()?;

                    if let Some((inv_num, inv_date, paid_paisa, due_paisa)) = inv_opt {
                        let alloc = due_paisa.min(remaining_recovery);
                        let new_paid = paid_paisa + alloc;
                        let new_due = due_paisa - alloc;
                        let new_status = if new_due == 0 { "PAID" } else { "PARTIAL" };

                        tx.execute(
                            "UPDATE sales_invoices SET 
                                paid_amount = ?1, paid_amount_paisa = ?2,
                                due_amount = ?3, due_amount_paisa = ?4,
                                status = ?5, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                             WHERE id = ?6",
                            params![new_paid / 100, new_paid, new_due / 100, new_due, new_status, inv_id],
                        )?;

                        remaining_recovery -= alloc;
                        allocations.push(InvoiceAllocationDetailDto {
                            invoice_id: inv_id,
                            invoice_number: inv_num,
                            invoice_date: inv_date,
                            previous_due_paisa: due_paisa,
                            allocated_paisa: alloc,
                            remaining_due_paisa: new_due,
                            new_status: new_status.to_string(),
                        });
                    }
                }
            }
        } else if alloc_mode_str == "FIFO" {
            let mut stmt = tx.prepare(
                "SELECT id, invoice_number, invoice_date, paid_amount_paisa, due_amount_paisa 
                 FROM sales_invoices 
                 WHERE customer_id = ?1 AND status IN ('UNPAID', 'PARTIAL') 
                   AND is_cancelled = 0 AND due_amount_paisa > 0 
                 ORDER BY invoice_date ASC, id ASC",
            )?;

            let rows = stmt.query_map(params![req.customer_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?, r.get::<_, i64>(4)?))
            })?;

            for row in rows {
                if remaining_recovery <= 0 {
                    break;
                }
                let (inv_id, inv_num, inv_date, paid_paisa, due_paisa) = row?;
                let alloc = due_paisa.min(remaining_recovery);
                let new_paid = paid_paisa + alloc;
                let new_due = due_paisa - alloc;
                let new_status = if new_due == 0 { "PAID" } else { "PARTIAL" };

                tx.execute(
                    "UPDATE sales_invoices SET 
                        paid_amount = ?1, paid_amount_paisa = ?2,
                        due_amount = ?3, due_amount_paisa = ?4,
                        status = ?5, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                     WHERE id = ?6",
                    params![new_paid / 100, new_paid, new_due / 100, new_due, new_status, inv_id],
                )?;

                remaining_recovery -= alloc;
                allocations.push(InvoiceAllocationDetailDto {
                    invoice_id: inv_id,
                    invoice_number: inv_num,
                    invoice_date: inv_date,
                    previous_due_paisa: due_paisa,
                    allocated_paisa: alloc,
                    remaining_due_paisa: new_due,
                    new_status: new_status.to_string(),
                });
            }
        }
        // Mode C (ON_ACCOUNT): does not touch individual bills

        let unallocated_remainder_paisa = remaining_recovery;
        let new_balance_paisa = current_balance_paisa - req.amount_paisa;

        let new_status = if credit_limit_paisa > 0 && new_balance_paisa > credit_limit_paisa {
            "BLOCKED"
        } else if credit_limit_paisa > 0 && (new_balance_paisa * 100) / credit_limit_paisa >= 80 {
            "WARNING"
        } else {
            "ACTIVE"
        };

        // Update customer balance & credit status
        tx.execute(
            "UPDATE customers SET 
                current_balance_paisa = ?1,
                current_balance = ?2,
                credit_status = ?3,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?4",
            params![new_balance_paisa, new_balance_paisa / 100, new_status, req.customer_id],
        )?;

        // Customer Ledger Entry
        tx.execute(
            "INSERT INTO customer_ledger (
                customer_id, entry_date, voucher_type, voucher_ref_id, voucher_number,
                description, debit, credit, debit_paisa, credit_paisa,
                running_balance, running_balance_paisa
             ) VALUES (?1, ?2, 'PAYMENT', NULL, ?3, ?4, 0, ?5, 0, ?6, ?7, ?8)",
            params![
                req.customer_id,
                recovery_date,
                recovery_number,
                format!("Udhaar recovery payment ({}) - {}", req.payment_mode, req.notes.as_deref().unwrap_or("")),
                req.amount_paisa / 100,
                req.amount_paisa,
                new_balance_paisa / 100,
                new_balance_paisa,
            ],
        )?;

        // Liquid Cash Book or Bank Transactions
        let mut cash_book_id = None;
        let mut bank_transaction_id = None;

        let is_cash = req.payment_mode.to_uppercase() == "CASH";
        let is_route_recovery = req.delivery_sheet_id.is_some();

        if is_cash && !is_route_recovery {
            let prev_cash: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let new_cash = prev_cash + req.amount_paisa;

            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'CUSTOMER_RECOVERY', 'RECOVERY', ?2, 2, '1010',
                          'Customer Udhaar Recovery', ?3, ?4, ?5, 0, 0, ?6, ?7, ?8)",
                params![
                    recovery_date,
                    recovery_number,
                    format!("Udhaar recovery from {}", customer_name),
                    req.amount_paisa / 100,
                    req.amount_paisa,
                    new_cash,
                    new_cash / 100,
                    user_id,
                ],
            )?;
            cash_book_id = Some(tx.last_insert_rowid());
        } else if !is_cash {
            let prev_bank: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM bank_transactions ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let new_bank = prev_bank + req.amount_paisa;
            let b_name = req.bank_name.as_deref().unwrap_or("Main Operating Bank");

            tx.execute(
                "INSERT INTO bank_transactions (
                    bank_name, account_number, transaction_date, transaction_type,
                    instrument_type, instrument_number, particulars,
                    deposit_paisa, withdrawal_paisa, running_balance_paisa,
                    is_cleared, clearance_date, created_by
                 ) VALUES (
                    ?1, 'PKR-OPERATING-01', ?2, 'CUSTOMER_RECOVERY',
                    'ONLINE_RAAST', ?3, ?4, ?5, 0, ?6, 1, ?2, ?7
                 )",
                params![
                    b_name,
                    recovery_date,
                    req.instrument_number.as_deref().unwrap_or(&recovery_number),
                    format!("Bank recovery from {}", customer_name),
                    req.amount_paisa,
                    new_bank,
                    user_id,
                ],
            )?;
            bank_transaction_id = Some(tx.last_insert_rowid());

            // Also update bank_accounts
            let bank_acct_id = req.bank_account_id.unwrap_or(1);
            tx.execute(
                "UPDATE bank_accounts SET 
                    current_balance_paisa = current_balance_paisa + ?1,
                    current_balance = (current_balance_paisa + ?1) / 100.0,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?2",
                params![req.amount_paisa, bank_acct_id],
            )?;
        }

        // Post Balanced Double-Entry Journal Entry
        let debit_acct_id = if !is_cash {
            3i64 // 1020 Bank Operating Account
        } else if is_route_recovery {
            4i64 // 1030 Petty Cash / Driver Floating Cash
        } else {
            2i64 // 1010 Cash on Hand
        };
        let debit_acct_desc = if !is_cash {
            "Bank Operating Account"
        } else if is_route_recovery {
            "Driver Floating Cash"
        } else {
            "Cash on Hand"
        };

        let jv_input = CreateJournalEntryInput {
            entry_date: recovery_date.clone(),
            voucher_type: "RECEIPT".into(),
            reference_doc_type: Some("CUSTOMER_RECOVERY".into()),
            reference_doc_id: None,
            narration: format!("Customer recovery receipt {}: {}", recovery_number, customer_name),
            lines: vec![
                JournalLineInput {
                    account_id: debit_acct_id,
                    debit_paisa: req.amount_paisa,
                    credit_paisa: 0,
                    line_narration: Some(format!("Deposit into {}", debit_acct_desc)),
                    customer_id: None,
                    supplier_id: None,
                },
                JournalLineInput {
                    account_id: 8, // 1200 Accounts Receivable - Trade Customers
                    debit_paisa: 0,
                    credit_paisa: req.amount_paisa,
                    line_narration: Some(format!("Receivable credit for {}", customer_name)),
                    customer_id: Some(req.customer_id),
                    supplier_id: None,
                },
            ],
            created_by: Some(user_id),
        };

        let jv_id = Self::post_journal_entry(&tx, jv_input)?;

        // Insert customer_recoveries record
        tx.execute(
            "INSERT INTO customer_recoveries (
                recovery_number, customer_id, recovery_date, amount_paisa, amount,
                payment_mode, allocation_mode, bank_name, instrument_number,
                instrument_date, notes, previous_balance_paisa, new_balance_paisa,
                unallocated_remainder_paisa, journal_entry_id, cash_book_id,
                bank_transaction_id, delivery_sheet_id, created_by
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            params![
                recovery_number,
                req.customer_id,
                recovery_date,
                req.amount_paisa,
                req.amount_paisa as f64 / 100.0,
                req.payment_mode.to_uppercase(),
                alloc_mode_str,
                req.bank_name,
                req.instrument_number,
                req.instrument_date,
                req.notes,
                current_balance_paisa,
                new_balance_paisa,
                unallocated_remainder_paisa,
                jv_id,
                cash_book_id,
                bank_transaction_id,
                req.delivery_sheet_id,
                user_id
            ],
        )?;
        let recovery_id = tx.last_insert_rowid();

        // Insert recovery_allocations records
        for alloc in &allocations {
            tx.execute(
                "INSERT INTO recovery_allocations (
                    recovery_id, invoice_id, allocated_paisa, previous_invoice_due_paisa, new_invoice_due_paisa
                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    recovery_id,
                    alloc.invoice_id,
                    alloc.allocated_paisa,
                    alloc.previous_due_paisa,
                    alloc.remaining_due_paisa
                ],
            )?;
        }

        tx.commit()?;

        let thermal_receipt = format_recovery_receipt(
            &recovery_number,
            &recovery_date,
            &shop_name,
            &customer_name,
            &phone,
            &req.payment_mode,
            &alloc_mode_str,
            req.amount_paisa,
            current_balance_paisa,
            new_balance_paisa,
            unallocated_remainder_paisa,
            &allocations,
        );

        Ok(RecoveryReceiptDto {
            recovery_id,
            recovery_number,
            customer_id: req.customer_id,
            customer_name,
            shop_name,
            customer_phone: phone,
            recovery_date,
            amount_paisa: req.amount_paisa,
            payment_mode: req.payment_mode,
            allocation_mode: alloc_mode_str,
            previous_balance_paisa: current_balance_paisa,
            new_balance_paisa,
            unallocated_remainder_paisa,
            allocations,
            journal_entry_id: jv_id,
            cash_book_id,
            bank_transaction_id,
            delivery_sheet_id: req.delivery_sheet_id,
            formatted_thermal_receipt: thermal_receipt,
        })
    }

    // ========================================================================
    // 6. RECORD SUPPLIER PAYMENT (CASH & BANK)
    // ========================================================================
    pub fn record_supplier_payment(
        conn: &mut Connection,
        req: RecordSupplierPaymentDto,
    ) -> Result<RecordSupplierPaymentResult, AppError> {
        if req.amount_paisa <= 0 {
            return Err(AppError::Validation("Supplier payment amount must be greater than zero".into()));
        }

        let user_id = req.user_id.unwrap_or(1);
        let payment_date = req.payment_date.clone().unwrap_or_else(|| {
            Local::now().format("%Y-%m-%d").to_string()
        });

        let tx = conn.transaction()?;

        // Day-locking guard
        let is_locked: bool = tx
            .query_row(
                "SELECT COUNT(*) FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                params![payment_date],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);

        if is_locked {
            return Err(AppError::DayLocked(format!(
                "Accounting date {} is locked by finalized daily closing",
                payment_date
            )));
        }

        let (supplier_name, prev_payable_paisa): (String, i64) = tx
            .query_row(
                "SELECT name, current_payable_paisa FROM suppliers WHERE id = ?1",
                params![req.supplier_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| AppError::NotFound { entity: "Supplier".into(), id: req.supplier_id.to_string() })?;

        let voucher_number = format!("PV-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
        let new_payable_paisa = prev_payable_paisa - req.amount_paisa;

        // 1. Update supplier master payable
        tx.execute(
            "UPDATE suppliers SET
                current_payable_paisa = ?1,
                current_payable = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?3",
            params![new_payable_paisa, new_payable_paisa / 100, req.supplier_id],
        )?;

        // 2. Insert into supplier ledger
        let is_cash = req.payment_mode.to_uppercase() == "CASH";
        let v_type = if is_cash { "CASH_PAYMENT" } else { "BANK_PAYMENT" };

        tx.execute(
            "INSERT INTO supplier_ledger (
                supplier_id, entry_date, voucher_type, voucher_ref_id, voucher_number,
                description, debit, credit, debit_paisa, credit_paisa,
                running_balance, running_balance_paisa
             ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, 0, ?7, 0, ?8, ?9)",
            params![
                req.supplier_id,
                payment_date,
                v_type,
                voucher_number,
                format!("Payment to supplier ({}) - {}", req.payment_mode, req.description.as_deref().unwrap_or("")),
                req.amount_paisa / 100,
                req.amount_paisa,
                new_payable_paisa / 100,
                new_payable_paisa,
            ],
        )?;
        let payment_id = tx.last_insert_rowid();

        // 3. Update Liquid Cash Book or Bank Transactions
        if is_cash {
            let prev_cash: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let new_cash = prev_cash - req.amount_paisa;

            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'SUPPLIER_PAYMENT', 'PAYMENT', ?2, 13, '2010',
                          'Supplier Consignment Payment', ?3, 0, 0, ?4, ?5, ?6, ?7, ?8)",
                params![
                    payment_date,
                    voucher_number,
                    format!("Payment to {}", supplier_name),
                    req.amount_paisa / 100,
                    req.amount_paisa,
                    new_cash,
                    new_cash / 100,
                    user_id,
                ],
            )?;
        } else {
            let prev_bank: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM bank_transactions ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let new_bank = prev_bank - req.amount_paisa;

            tx.execute(
                "INSERT INTO bank_transactions (
                    bank_name, account_number, transaction_date, transaction_type,
                    instrument_type, instrument_number, particulars,
                    deposit_paisa, withdrawal_paisa, running_balance_paisa,
                    is_cleared, clearance_date, created_by
                 ) VALUES (
                    'Main Operating Bank', 'PKR-OPERATING-01', ?1, 'SUPPLIER_PAYMENT',
                    'ONLINE_RAAST', ?2, ?3, 0, ?4, ?5, 1, ?1, ?6
                 )",
                params![
                    payment_date,
                    req.reference_number.as_deref().unwrap_or(&voucher_number),
                    format!("Bank payment to {}", supplier_name),
                    req.amount_paisa,
                    new_bank,
                    user_id,
                ],
            )?;

            let bank_acct_id = req.bank_account_id.unwrap_or(1);
            tx.execute(
                "UPDATE bank_accounts SET 
                    current_balance_paisa = current_balance_paisa - ?1,
                    current_balance = (current_balance_paisa - ?1) / 100.0,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?2",
                params![req.amount_paisa, bank_acct_id],
            )?;
        }

        // 4. Post Balanced Double-Entry Journal Entry
        let credit_acct_id = if is_cash { 2i64 } else { 3i64 };
        let credit_acct_desc = if is_cash { "Cash on Hand" } else { "Bank Operating Account" };

        let jv_input = CreateJournalEntryInput {
            entry_date: payment_date,
            voucher_type: "PAYMENT".into(),
            reference_doc_type: Some("SUPPLIER_PAYMENT".into()),
            reference_doc_id: Some(payment_id),
            narration: format!("Supplier payment voucher {}: {}", voucher_number, supplier_name),
            lines: vec![
                JournalLineInput {
                    account_id: 13, // 2010 Accounts Payable - Nextco Principal / Suppliers
                    debit_paisa: req.amount_paisa,
                    credit_paisa: 0,
                    line_narration: Some(format!("Payable debit for {}", supplier_name)),
                    customer_id: None,
                    supplier_id: Some(req.supplier_id),
                },
                JournalLineInput {
                    account_id: credit_acct_id,
                    debit_paisa: 0,
                    credit_paisa: req.amount_paisa,
                    line_narration: Some(format!("Payment via {}", credit_acct_desc)),
                    customer_id: None,
                    supplier_id: None,
                },
            ],
            created_by: Some(user_id),
        };

        let jv_id = Self::post_journal_entry(&tx, jv_input)?;

        tx.commit()?;

        Ok(RecordSupplierPaymentResult {
            payment_id,
            voucher_number,
            supplier_id: req.supplier_id,
            amount_paisa: req.amount_paisa,
            previous_payable_paisa: prev_payable_paisa,
            new_payable_paisa,
            journal_entry_id: jv_id,
        })
    }

    // ========================================================================
    // 7. RECORD CATEGORIZED OPERATING EXPENSE
    // ========================================================================
    pub fn record_expense(
        conn: &mut Connection,
        req: RecordExpenseDto,
    ) -> Result<RecordExpenseResult, AppError> {
        if req.amount_paisa <= 0 {
            return Err(AppError::Validation("Expense amount must be positive".into()));
        }

        let user_id = req.user_id.unwrap_or(1);
        let expense_date = req.expense_date.clone().unwrap_or_else(|| {
            Local::now().format("%Y-%m-%d").to_string()
        });

        let tx = conn.transaction()?;

        // Day-locking guard
        let is_locked: bool = tx
            .query_row(
                "SELECT COUNT(*) FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                params![expense_date],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);

        if is_locked {
            return Err(AppError::DayLocked(format!(
                "Accounting date {} is locked by finalized daily closing",
                expense_date
            )));
        }

        // Resolve account in chart_of_accounts (can be ID or account_code)
        let (resolved_acct_id, acct_code, acct_name, acct_type): (i64, i64, String, String) = tx
            .query_row(
                "SELECT id, account_code, account_name, account_type FROM chart_of_accounts WHERE id = ?1 OR account_code = ?1",
                params![req.account_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .map_err(|_| AppError::NotFound { entity: "Account".into(), id: req.account_id.to_string() })?;

        if acct_type != "EXPENSE" && acct_code < 6000 {
            return Err(AppError::Validation(format!(
                "Account #{} ({}) is of type '{}', but must be 'EXPENSE'",
                req.account_id, acct_name, acct_type
            )));
        }

        let expense_number = format!("EXP-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
        let is_cash = req.payment_mode.to_uppercase() == "CASH";

        let mut cash_book_id = None;
        let mut bank_transaction_id = None;
        let new_liquid_bal: i64;

        // Deduct from Cash Book or Bank Transactions
        if is_cash {
            let prev_cash: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            if prev_cash < req.amount_paisa {
                return Err(AppError::Validation(format!(
                    "Insufficient cash in drawer: available {} paisa, required {}",
                    prev_cash, req.amount_paisa
                )));
            }

            let new_cash = prev_cash - req.amount_paisa;

            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'EXPENSE', 'EXPENSE', ?2, ?3, ?4,
                          ?5, ?6, 0, 0, ?7, ?8, ?9, ?10, ?11)",
                params![
                    expense_date,
                    expense_number,
                    resolved_acct_id,
                    acct_code.to_string(),
                    format!("{} - {}", acct_name, req.recipient_name.as_deref().unwrap_or("")),
                    req.description,
                    req.amount_paisa / 100,
                    req.amount_paisa,
                    new_cash,
                    new_cash / 100,
                    user_id,
                ],
            )?;
            cash_book_id = Some(tx.last_insert_rowid());
            new_liquid_bal = new_cash;
        } else {
            let bank_acct_id = req.bank_account_id.unwrap_or(1);
            let (bank_name, acct_num, prev_bank): (String, String, i64) = tx
                .query_row(
                    "SELECT bank_name, account_number, current_balance_paisa FROM bank_accounts WHERE id = ?1",
                    params![bank_acct_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .map_err(|_| AppError::NotFound { entity: "BankAccount".into(), id: bank_acct_id.to_string() })?;

            if prev_bank < req.amount_paisa {
                return Err(AppError::Validation("Insufficient bank account balance".into()));
            }

            let new_bank = prev_bank - req.amount_paisa;

            tx.execute(
                "INSERT INTO bank_transactions (
                    bank_name, account_number, transaction_date, transaction_type,
                    instrument_type, instrument_number, particulars,
                    deposit_paisa, withdrawal_paisa, running_balance_paisa,
                    is_cleared, clearance_date, created_by
                 ) VALUES (
                    ?1, ?2, ?3, 'EXPENSE_PAYMENT',
                    'ONLINE_RAAST', ?4, ?5, 0, ?6, ?7, 1, ?3, ?8
                 )",
                params![
                    bank_name,
                    acct_num,
                    expense_date,
                    req.reference_number.as_deref().unwrap_or(&expense_number),
                    format!("{} - {}", acct_name, req.description),
                    req.amount_paisa,
                    new_bank,
                    user_id,
                ],
            )?;
            bank_transaction_id = Some(tx.last_insert_rowid());

            tx.execute(
                "UPDATE bank_accounts SET 
                    current_balance_paisa = ?1,
                    current_balance = ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?3",
                params![new_bank, new_bank as f64 / 100.0, bank_acct_id],
            )?;
            new_liquid_bal = new_bank;
        }

        // Post Balanced Double-Entry Journal Entry
        let credit_acct_id = if is_cash { 2i64 } else { 3i64 };
        let jv_input = CreateJournalEntryInput {
            entry_date: expense_date.clone(),
            voucher_type: "EXPENSE".into(),
            reference_doc_type: Some("OPERATING_EXPENSE".into()),
            reference_doc_id: None,
            narration: format!("Operating expense {}: {} ({})", expense_number, acct_name, req.description),
            lines: vec![
                JournalLineInput {
                    account_id: resolved_acct_id,
                    debit_paisa: req.amount_paisa,
                    credit_paisa: 0,
                    line_narration: Some(format!("Expense: {}", req.description)),
                    customer_id: None,
                    supplier_id: None,
                },
                JournalLineInput {
                    account_id: credit_acct_id,
                    debit_paisa: 0,
                    credit_paisa: req.amount_paisa,
                    line_narration: Some(format!("Paid via {} for {}", req.payment_mode, expense_number)),
                    customer_id: None,
                    supplier_id: None,
                },
            ],
            created_by: Some(user_id),
        };

        let jv_id = Self::post_journal_entry(&tx, jv_input)?;

        // Insert into operating_expenses
        tx.execute(
            "INSERT INTO operating_expenses (
                expense_number, expense_date, account_id, account_code, amount, amount_paisa,
                payment_mode, bank_account_id, recipient_name, description, receipt_ref_no,
                trip_id, journal_entry_id, cash_book_id, bank_transaction_id, created_by
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                expense_number,
                expense_date,
                resolved_acct_id,
                acct_code,
                req.amount_paisa as f64 / 100.0,
                req.amount_paisa,
                req.payment_mode.to_uppercase(),
                req.bank_account_id,
                req.recipient_name.as_deref().unwrap_or(""),
                req.description,
                req.receipt_ref_no.as_deref().or(req.reference_number.as_deref()),
                req.trip_id,
                jv_id,
                cash_book_id,
                bank_transaction_id,
                user_id,
            ],
        )?;
        let expense_id = tx.last_insert_rowid();

        tx.commit()?;

        Ok(RecordExpenseResult {
            expense_id,
            expense_number,
            account_id: resolved_acct_id,
            amount_paisa: req.amount_paisa,
            journal_entry_id: jv_id,
            cash_book_id,
            bank_transaction_id,
            new_balance_paisa: new_liquid_bal,
        })
    }

    pub fn get_operating_expenses(
        conn: &Connection,
        start_date: Option<&str>,
        end_date: Option<&str>,
        account_id_opt: Option<i64>,
    ) -> Result<Vec<ExpenseListItemDto>, AppError> {
        let mut sql = String::from(
            "SELECT oe.id, oe.expense_number, oe.expense_date, oe.account_id, oe.account_code,
                    coa.account_name, oe.amount_paisa, oe.amount, oe.payment_mode, oe.recipient_name,
                    oe.description, oe.receipt_ref_no, oe.is_locked, oe.created_at
             FROM operating_expenses oe
             JOIN chart_of_accounts coa ON oe.account_id = coa.id
             WHERE 1=1",
        );
        let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(s) = start_date {
            sql.push_str(" AND oe.expense_date >= ?");
            query_params.push(Box::new(s.to_string()));
        }
        if let Some(e) = end_date {
            sql.push_str(" AND oe.expense_date <= ?");
            query_params.push(Box::new(e.to_string()));
        }
        if let Some(aid) = account_id_opt {
            sql.push_str(" AND (oe.account_id = ? OR oe.account_code = ?)");
            query_params.push(Box::new(aid));
            query_params.push(Box::new(aid));
        }
        sql.push_str(" ORDER BY oe.expense_date DESC, oe.id DESC");

        let mut stmt = conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = query_params.iter().map(|b| b.as_ref()).collect();

        let rows = stmt.query_map(param_refs.as_slice(), |r| {
            Ok(ExpenseListItemDto {
                id: r.get(0)?,
                expense_number: r.get(1)?,
                expense_date: r.get(2)?,
                account_id: r.get(3)?,
                account_code: r.get(4)?,
                account_name: r.get(5)?,
                amount_paisa: r.get(6)?,
                amount: r.get(7)?,
                payment_mode: r.get(8)?,
                recipient_name: r.get(9)?,
                description: r.get(10)?,
                receipt_ref_no: r.get(11)?,
                is_locked: r.get(12)?,
                created_at: r.get(13)?,
            })
        })?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r?);
        }
        Ok(items)
    }

    // ========================================================================
    // 8. STRICT CASH BOOK STATEMENT
    // ========================================================================
    pub fn get_cash_book_statement(
        conn: &Connection,
        start_date: &str,
        end_date: &str,
    ) -> Result<CashBookStatementDto, AppError> {
        let opening_balance_paisa: i64 = conn
            .query_row(
                "SELECT running_balance_paisa FROM cash_book 
                 WHERE entry_date < ?1 
                 ORDER BY entry_date DESC, id DESC LIMIT 1",
                params![start_date],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let mut stmt = conn.prepare(
            "SELECT id, entry_date, entry_time, transaction_type, voucher_ref_type,
                    voucher_ref_id, voucher_ref_number, account_code, particulars,
                    description, cash_in_paisa, cash_out_paisa, running_balance_paisa, is_locked
             FROM cash_book
             WHERE entry_date BETWEEN ?1 AND ?2
             ORDER BY entry_date ASC, id ASC",
        )?;

        let mut entries = Vec::new();
        let mut total_in = 0i64;
        let mut total_out = 0i64;

        let rows = stmt.query_map(params![start_date, end_date], |r| {
            Ok(CashBookEntryDto {
                id: r.get(0)?,
                entry_date: r.get(1)?,
                entry_time: r.get(2)?,
                transaction_type: r.get(3)?,
                voucher_ref_type: r.get(4)?,
                voucher_ref_id: r.get(5)?,
                voucher_ref_number: r.get(6)?,
                account_code: r.get(7)?,
                particulars: r.get(8)?,
                description: r.get(9)?,
                cash_in_paisa: r.get(10)?,
                cash_out_paisa: r.get(11)?,
                running_balance_paisa: r.get(12)?,
                is_locked: r.get(13)?,
                created_by_name: None,
            })
        })?;

        for row in rows {
            let e = row?;
            total_in += e.cash_in_paisa;
            total_out += e.cash_out_paisa;
            entries.push(e);
        }

        let closing_balance_paisa = opening_balance_paisa + total_in - total_out;

        Ok(CashBookStatementDto {
            start_date: start_date.to_string(),
            end_date: end_date.to_string(),
            opening_balance_paisa,
            total_cash_in_paisa: total_in,
            total_cash_out_paisa: total_out,
            net_cash_flow_paisa: total_in - total_out,
            closing_balance_paisa,
            entries,
        })
    }

    // ========================================================================
    // 9. BANK ACCOUNTS & TRANSFERS
    // ========================================================================
    pub fn get_bank_accounts(conn: &Connection) -> Result<Vec<BankAccountDto>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, bank_name, account_number, account_title, branch, iban, current_balance_paisa, is_active
             FROM bank_accounts
             WHERE is_active = 1
             ORDER BY id ASC",
        )?;

        let rows = stmt.query_map([], |r| {
            Ok(BankAccountDto {
                id: r.get(0)?,
                bank_name: r.get(1)?,
                account_number: r.get(2)?,
                account_title: r.get(3)?,
                branch: r.get(4)?,
                iban: r.get(5)?,
                current_balance_paisa: r.get(6)?,
                is_active: r.get(7)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn record_bank_transfer(
        conn: &mut Connection,
        req: BankTransferRequestDto,
    ) -> Result<BankTransactionDto, AppError> {
        if req.amount_paisa <= 0 {
            return Err(AppError::Validation("Transfer amount must be positive".into()));
        }

        let user_id = req.user_id.unwrap_or(1);
        let tx = conn.transaction()?;

        // Day-locking guard
        let is_locked: bool = tx
            .query_row(
                "SELECT COUNT(*) FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                params![req.transfer_date],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);

        if is_locked {
            return Err(AppError::DayLocked(format!(
                "Accounting date {} is locked by finalized daily closing",
                req.transfer_date
            )));
        }

        let (bank_name, account_number, prev_bank): (String, String, i64) = tx
            .query_row(
                "SELECT bank_name, account_number, current_balance_paisa FROM bank_accounts WHERE id = ?1",
                params![req.bank_account_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|_| AppError::NotFound { entity: "BankAccount".into(), id: req.bank_account_id.to_string() })?;

        let dir = req.direction.to_uppercase();

        let (tx_id, new_bank) = if dir == "CASH_TO_BANK" {
            // Verify till has sufficient cash
            let prev_cash: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            if prev_cash < req.amount_paisa {
                return Err(AppError::Validation(format!(
                    "Insufficient cash in drawer: available {} paisa, attempted deposit {}",
                    prev_cash, req.amount_paisa
                )));
            }

            let new_cash = prev_cash - req.amount_paisa;
            let updated_bank = prev_bank + req.amount_paisa;

            // 1. Deduct Cash from drawer
            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'BANK_DEPOSIT', 'BANK_TX', ?2, 3, '1020', ?3, ?4, 0, 0, ?5, ?6, ?7, ?8, ?9)",
                params![
                    req.transfer_date,
                    req.instrument_number,
                    format!("Cash Deposit to {} ({})", bank_name, account_number),
                    req.particulars,
                    req.amount_paisa / 100,
                    req.amount_paisa,
                    new_cash,
                    new_cash / 100,
                    user_id
                ],
            )?;

            // 2. Increment Bank Account
            tx.execute(
                "UPDATE bank_accounts SET current_balance_paisa = ?1, current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?3",
                params![updated_bank, updated_bank as f64 / 100.0, req.bank_account_id],
            )?;

            // 3. Post Balanced Double-Entry Journal Entry (Dr 1020 Bank, Cr 1010 Cash)
            let jv_input = CreateJournalEntryInput {
                entry_date: req.transfer_date.clone(),
                voucher_type: "TRANSFER".into(),
                reference_doc_type: Some("CASH_BANK_TRANSFER".into()),
                reference_doc_id: None,
                narration: format!("Contra deposit into {}", bank_name),
                lines: vec![
                    JournalLineInput {
                        account_id: 3, // 1020 Bank
                        debit_paisa: req.amount_paisa,
                        credit_paisa: 0,
                        line_narration: Some(format!("Bank deposit: {}", bank_name)),
                        customer_id: None,
                        supplier_id: None,
                    },
                    JournalLineInput {
                        account_id: 2, // 1010 Cash
                        debit_paisa: 0,
                        credit_paisa: req.amount_paisa,
                        line_narration: Some("Drawer cash outflow".into()),
                        customer_id: None,
                        supplier_id: None,
                    },
                ],
                created_by: Some(user_id),
            };
            let jv_id = Self::post_journal_entry(&tx, jv_input)?;

            // 4. Insert into bank_transactions
            tx.execute(
                "INSERT INTO bank_transactions (
                    bank_name, account_number, transaction_date, transaction_type,
                    instrument_type, instrument_number, particulars,
                    deposit_paisa, withdrawal_paisa, running_balance_paisa,
                    is_cleared, clearance_date, journal_entry_id, created_by
                 ) VALUES (?1, ?2, ?3, 'CASH_DEPOSIT', ?4, ?5, ?6, ?7, 0, ?8, 1, ?3, ?9, ?10)",
                params![
                    bank_name,
                    account_number,
                    req.transfer_date,
                    req.instrument_type.as_deref().unwrap_or("CASH_DEPOSIT"),
                    req.instrument_number,
                    req.particulars,
                    req.amount_paisa,
                    updated_bank,
                    jv_id,
                    user_id
                ],
            )?;
            (tx.last_insert_rowid(), updated_bank)
        } else if dir == "BANK_TO_CASH" {
            // Verify bank has sufficient funds
            if prev_bank < req.amount_paisa {
                return Err(AppError::Validation(format!(
                    "Insufficient bank balance: available {} paisa, attempted withdrawal {}",
                    prev_bank, req.amount_paisa
                )));
            }

            let prev_cash: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            let new_cash = prev_cash + req.amount_paisa;
            let updated_bank = prev_bank - req.amount_paisa;

            // 1. Decrement Bank Account
            tx.execute(
                "UPDATE bank_accounts SET current_balance_paisa = ?1, current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?3",
                params![updated_bank, updated_bank as f64 / 100.0, req.bank_account_id],
            )?;

            // 2. Increment Drawer Cash
            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'CASH_WITHDRAWAL_FROM_BANK', 'BANK_TX', ?2, 3, '1020', ?3, ?4, ?5, ?6, 0, 0, ?7, ?8, ?9)",
                params![
                    req.transfer_date,
                    req.instrument_number,
                    format!("Cash Withdrawal from {} ({})", bank_name, account_number),
                    req.particulars,
                    req.amount_paisa / 100,
                    req.amount_paisa,
                    new_cash,
                    new_cash / 100,
                    user_id
                ],
            )?;

            // 3. Post Balanced Double-Entry Journal Entry (Dr 1010 Cash, Cr 1020 Bank)
            let jv_input = CreateJournalEntryInput {
                entry_date: req.transfer_date.clone(),
                voucher_type: "TRANSFER".into(),
                reference_doc_type: Some("BANK_CASH_WITHDRAWAL".into()),
                reference_doc_id: None,
                narration: format!("Cash withdrawal from {}", bank_name),
                lines: vec![
                    JournalLineInput {
                        account_id: 2, // 1010 Cash
                        debit_paisa: req.amount_paisa,
                        credit_paisa: 0,
                        line_narration: Some("Drawer cash inflow".into()),
                        customer_id: None,
                        supplier_id: None,
                    },
                    JournalLineInput {
                        account_id: 3, // 1020 Bank
                        debit_paisa: 0,
                        credit_paisa: req.amount_paisa,
                        line_narration: Some(format!("Bank withdrawal: {}", bank_name)),
                        customer_id: None,
                        supplier_id: None,
                    },
                ],
                created_by: Some(user_id),
            };
            let jv_id = Self::post_journal_entry(&tx, jv_input)?;

            // 4. Insert into bank_transactions
            tx.execute(
                "INSERT INTO bank_transactions (
                    bank_name, account_number, transaction_date, transaction_type,
                    instrument_type, instrument_number, particulars,
                    deposit_paisa, withdrawal_paisa, running_balance_paisa,
                    is_cleared, clearance_date, journal_entry_id, created_by
                 ) VALUES (?1, ?2, ?3, 'CASH_WITHDRAWAL', ?4, ?5, ?6, 0, ?7, ?8, 1, ?3, ?9, ?10)",
                params![
                    bank_name,
                    account_number,
                    req.transfer_date,
                    req.instrument_type.as_deref().unwrap_or("ATM_WITHDRAWAL"),
                    req.instrument_number,
                    req.particulars,
                    req.amount_paisa,
                    updated_bank,
                    jv_id,
                    user_id
                ],
            )?;
            (tx.last_insert_rowid(), updated_bank)
        } else {
            return Err(AppError::Validation(format!("Unsupported transfer direction '{}'", req.direction)));
        };

        tx.commit()?;

        Ok(BankTransactionDto {
            id: tx_id,
            bank_account_id: req.bank_account_id,
            bank_name,
            account_number,
            transaction_date: req.transfer_date.clone(),
            transaction_type: if dir == "CASH_TO_BANK" { "CASH_DEPOSIT".into() } else { "CASH_WITHDRAWAL".into() },
            instrument_type: req.instrument_type.unwrap_or_else(|| "ONLINE_RAAST".into()),
            instrument_number: req.instrument_number,
            particulars: req.particulars,
            deposit_paisa: if dir == "CASH_TO_BANK" { req.amount_paisa } else { 0 },
            withdrawal_paisa: if dir == "BANK_TO_CASH" { req.amount_paisa } else { 0 },
            running_balance_paisa: new_bank,
            is_cleared: true,
            clearance_date: Some(req.transfer_date),
        })
    }

    // ========================================================================
    // 10. BANK RECONCILIATION STATEMENT (BRS)
    // ========================================================================
    pub fn get_bank_reconciliation(
        conn: &Connection,
        bank_account_id: i64,
        as_of_date: &str,
    ) -> Result<BankReconciliationReportDto, AppError> {
        let (bank_name, account_number, book_balance_paisa): (String, String, i64) = conn
            .query_row(
                "SELECT bank_name, account_number, current_balance_paisa FROM bank_accounts WHERE id = ?1",
                params![bank_account_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|_| AppError::NotFound { entity: "BankAccount".into(), id: bank_account_id.to_string() })?;

        let mut stmt = conn.prepare(
            "SELECT id, bank_name, account_number, transaction_date, transaction_type,
                    instrument_type, instrument_number, particulars, deposit_paisa,
                    withdrawal_paisa, running_balance_paisa, is_cleared, clearance_date
             FROM bank_transactions
             WHERE transaction_date <= ?1 AND is_cleared = 0
             ORDER BY transaction_date ASC",
        )?;

        let mut uncleared = Vec::new();
        let mut uncleared_dep_paisa = 0i64;
        let mut uncleared_dep_count = 0usize;
        let mut unpresented_with_paisa = 0i64;
        let mut unpresented_with_count = 0usize;

        let rows = stmt.query_map(params![as_of_date], |r| {
            Ok(BankTransactionDto {
                id: r.get(0)?,
                bank_account_id,
                bank_name: r.get(1)?,
                account_number: r.get(2)?,
                transaction_date: r.get(3)?,
                transaction_type: r.get(4)?,
                instrument_type: r.get(5)?,
                instrument_number: r.get(6)?,
                particulars: r.get(7)?,
                deposit_paisa: r.get(8)?,
                withdrawal_paisa: r.get(9)?,
                running_balance_paisa: r.get(10)?,
                is_cleared: r.get(11)?,
                clearance_date: r.get(12)?,
            })
        })?;

        for r in rows {
            let item = r?;
            if item.deposit_paisa > 0 {
                uncleared_dep_paisa += item.deposit_paisa;
                uncleared_dep_count += 1;
            }
            if item.withdrawal_paisa > 0 {
                unpresented_with_paisa += item.withdrawal_paisa;
                unpresented_with_count += 1;
            }
            uncleared.push(item);
        }

        // Reconciled Statement Balance = Book Balance - Uncleared Deposits + Unpresented Withdrawals
        let reconciled_statement_balance_paisa = book_balance_paisa - uncleared_dep_paisa + unpresented_with_paisa;

        Ok(BankReconciliationReportDto {
            bank_account_id,
            bank_name,
            account_number,
            as_of_date: as_of_date.to_string(),
            book_balance_paisa,
            cleared_balance_paisa: reconciled_statement_balance_paisa,
            uncleared_deposits_count: uncleared_dep_count,
            uncleared_deposits_paisa: uncleared_dep_paisa,
            unpresented_withdrawals_count: unpresented_with_count,
            unpresented_withdrawals_paisa: unpresented_with_paisa,
            reconciled_statement_balance_paisa,
            uncleared_transactions: uncleared,
        })
    }

    // ========================================================================
    // 11. GENUINE COGS PROFIT & LOSS ENGINE
    // ========================================================================
    pub fn calculate_profit_and_loss(
        conn: &Connection,
        start_date: &str,
        end_date: &str,
    ) -> Result<ProfitAndLossStatementDto, AppError> {
        // 1. Operating Revenue (Strictly non-cancelled sales invoices)
        let (gross_sales_paisa, total_discounts_paisa): (i64, i64) = conn
            .query_row(
                "SELECT 
                    COALESCE(SUM(subtotal_paisa), 0),
                    COALESCE(SUM(discount_paisa), 0)
                 FROM sales_invoices
                 WHERE invoice_date BETWEEN ?1 AND ?2
                   AND is_cancelled = 0
                   AND status != 'CANCELLED'",
                params![start_date, end_date],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap_or((0, 0));

        // Deduct approved, non-cancelled sales returns in the period
        let total_sales_returns_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(total_return_paisa), 0)
                 FROM sales_returns
                 WHERE return_date BETWEEN ?1 AND ?2
                   AND is_cancelled = 0
                   AND status != 'CANCELLED'",
                params![start_date, end_date],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let net_sales_revenue_paisa = gross_sales_paisa - total_discounts_paisa - total_sales_returns_paisa;
        let delivery_service_income_paisa: i64 = 0;
        let total_operating_revenue_paisa = net_sales_revenue_paisa + delivery_service_income_paisa;

        // 2. Cost of Goods Sold (COGS)
        let total_cogs_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(sii.cogs_total_paisa), 0)
                 FROM sales_invoice_items sii
                 JOIN sales_invoices si ON sii.invoice_id = si.id
                 WHERE si.invoice_date BETWEEN ?1 AND ?2
                   AND si.is_cancelled = 0
                   AND si.status != 'CANCELLED'",
                params![start_date, end_date],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let gross_profit_paisa = total_operating_revenue_paisa - total_cogs_paisa;
        let gross_margin_percent = if total_operating_revenue_paisa > 0 {
            (gross_profit_paisa as f64 / total_operating_revenue_paisa as f64) * 100.0
        } else {
            0.0
        };

        // 3. Operating Expenses Breakdown
        let mut exp_stmt = conn.prepare(
            "SELECT coa.id, coa.account_code, coa.account_name, COALESCE(SUM(oe.amount_paisa), 0), COUNT(oe.id)
             FROM chart_of_accounts coa
             LEFT JOIN operating_expenses oe ON coa.id = oe.account_id AND oe.expense_date BETWEEN ?1 AND ?2
             WHERE coa.account_type = 'EXPENSE' OR (coa.account_code >= 6000 AND coa.account_code < 7000)
             GROUP BY coa.id, coa.account_code, coa.account_name
             ORDER BY coa.account_code ASC",
        )?;

        let mut expenses = Vec::new();
        let mut total_expenses_paisa: i64 = 0;

        let exp_rows = exp_stmt.query_map(params![start_date, end_date], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, usize>(4)?,
            ))
        })?;

        for r in exp_rows {
            let (id, code, name, sum_paisa, cnt) = r?;
            total_expenses_paisa += sum_paisa;
            expenses.push(ExpenseCategoryBreakdownDto {
                account_id: id,
                account_code: code,
                account_name: name,
                total_amount_paisa: sum_paisa,
                count: cnt,
                percentage_of_total: 0.0,
            });
        }

        if total_expenses_paisa > 0 {
            for it in &mut expenses {
                it.percentage_of_total = (it.total_amount_paisa as f64 / total_expenses_paisa as f64) * 100.0;
            }
        }

        let net_operating_profit_paisa = gross_profit_paisa - total_expenses_paisa;
        let net_margin_percent = if total_operating_revenue_paisa > 0 {
            (net_operating_profit_paisa as f64 / total_operating_revenue_paisa as f64) * 100.0
        } else {
            0.0
        };

        // 4. Non-Operating Exclusions
        let isolated_deposit_liability_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(security_deposit_balance_paisa), 0) FROM customers",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let isolated_owner_capital_injections_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cash_in_paisa), 0) FROM cash_book 
                 WHERE entry_date BETWEEN ?1 AND ?2 AND transaction_type IN ('OWNER_CAPITAL', 'CAPITAL_INJECTION')",
                params![start_date, end_date],
                |r| r.get(0),
            )
            .unwrap_or(0);

        Ok(ProfitAndLossStatementDto {
            period_start: start_date.to_string(),
            period_end: end_date.to_string(),
            revenue: RevenueStatementDto {
                gross_sales_paisa,
                total_discounts_paisa,
                total_sales_returns_paisa,
                net_sales_revenue_paisa,
                delivery_service_income_paisa,
                total_operating_revenue_paisa,
            },
            cogs: CogsStatementDto {
                beverage_material_cost_paisa: total_cogs_paisa,
                inward_freight_cost_paisa: 0,
                unloading_labor_cost_paisa: 0,
                total_cogs_paisa,
            },
            gross_profit_paisa,
            gross_margin_percent,
            operating_expenses: expenses,
            total_operating_expenses_paisa: total_expenses_paisa,
            expense_to_revenue_ratio: if total_operating_revenue_paisa > 0 {
                (total_expenses_paisa as f64 / total_operating_revenue_paisa as f64) * 100.0
            } else {
                0.0
            },
            net_operating_profit_paisa,
            net_margin_percent,
            isolated_deposit_liability_paisa,
            isolated_owner_capital_injections_paisa,
        })
    }

    // ========================================================================
    // 12. TRIAL BALANCE ENGINE
    // ========================================================================
    pub fn calculate_trial_balance(
        conn: &Connection,
        as_of_date_opt: Option<&str>,
    ) -> Result<TrialBalanceReportDto, AppError> {
        let as_of_date_str = as_of_date_opt.unwrap_or("").trim();
        let effective_as_of = if as_of_date_str.is_empty() {
            Local::now().format("%Y-%m-%d").to_string()
        } else {
            NaiveDate::parse_from_str(as_of_date_str, "%Y-%m-%d")
                .map_err(|e| AppError::Validation(format!("Invalid as_of_date format (expected YYYY-MM-DD): {}", e)))?
                .format("%Y-%m-%d")
                .to_string()
        };

        let mut stmt = conn.prepare(
            "SELECT coa.id, coa.account_code, coa.account_name, coa.account_type,
                    COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_paisa ELSE 0 END), 0) AS total_debit,
                    COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_paisa ELSE 0 END), 0) AS total_credit
             FROM chart_of_accounts coa
             LEFT JOIN journal_lines jl ON coa.id = jl.account_id
             LEFT JOIN journal_entries je ON jl.entry_id = je.id AND je.entry_date <= ?1
             WHERE coa.is_active = 1
             GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
             ORDER BY coa.account_code ASC",
        )?;

        let mut accounts = Vec::new();
        let mut grand_total_debits = 0i64;
        let mut grand_total_credits = 0i64;

        let rows = stmt.query_map(params![effective_as_of], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
            ))
        })?;

        for r in rows {
            let (id, code, name, acct_type, deb, cred) = r?;
            grand_total_debits += deb;
            grand_total_credits += cred;

            let (net_bal, bal_type) = if deb >= cred {
                (deb - cred, "DEBIT".to_string())
            } else {
                (cred - deb, "CREDIT".to_string())
            };

            accounts.push(TrialBalanceAccountItemDto {
                account_id: id,
                account_code: code,
                account_name: name,
                account_type: acct_type,
                total_debit_paisa: deb,
                total_credit_paisa: cred,
                net_balance_paisa: net_bal,
                balance_type: bal_type,
            });
        }

        let is_balanced = grand_total_debits == grand_total_credits;

        Ok(TrialBalanceReportDto {
            as_of_date: effective_as_of,
            accounts,
            total_debits_paisa: grand_total_debits,
            total_credits_paisa: grand_total_credits,
            is_balanced,
        })
    }

    // ========================================================================
    // 13. CHART OF ACCOUNTS & GENERAL JOURNAL QUERIES
    // ========================================================================
    pub fn get_chart_of_accounts(conn: &Connection) -> Result<Vec<AccountDto>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, account_code, account_name, account_type, parent_code, is_system, is_active, description
             FROM chart_of_accounts
             WHERE is_active = 1
             ORDER BY account_code ASC",
        )?;

        let accounts = stmt
            .query_map([], |row| {
                Ok(AccountDto {
                    id: row.get(0)?,
                    account_code: row.get(1)?,
                    account_name: row.get(2)?,
                    account_type: row.get(3)?,
                    parent_code: row.get(4)?,
                    is_system: row.get(5)?,
                    is_active: row.get(6)?,
                    description: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(accounts)
    }
}

// ============================================================================
// 14. 80MM ESC/POS THERMAL WASOOLI RASEED FORMATTER
// ============================================================================
pub fn format_recovery_receipt(
    recovery_number: &str,
    recovery_date: &str,
    shop_name: &str,
    customer_name: &str,
    phone: &str,
    payment_mode: &str,
    allocation_mode: &str,
    amount_paisa: i64,
    previous_balance_paisa: i64,
    new_balance_paisa: i64,
    unallocated_remainder_paisa: i64,
    allocations: &[InvoiceAllocationDetailDto],
) -> String {
    let mut out = String::new();
    out.push_str("================================================\n");
    out.push_str("           LOGAR TRADERS - NEXTCO DEPOT         \n");
    out.push_str("    Official Nextco Beverage Distribution Depot \n");
    out.push_str("   Nextco Depot, Main Bypass, Rahim Yar Khan    \n");
    out.push_str("     Phone: +92 300 1234567 | NTN: 7483921-5    \n");
    out.push_str("================================================\n");
    out.push_str("              UDHAAR RECOVERY RECEIPT           \n");
    out.push_str("                 (WASOOLI RASEED)               \n");
    out.push_str("------------------------------------------------\n");
    out.push_str(&format!("Receipt No: {}\n", recovery_number));
    out.push_str(&format!("Date:       {}\n", recovery_date));
    out.push_str(&format!("Customer:   {} ({})\n", shop_name, customer_name));
    out.push_str(&format!("Contact:    {}\n", phone));
    out.push_str(&format!("Payment:    {}\n", payment_mode));
    out.push_str(&format!("Allocation: {}\n", allocation_mode));
    out.push_str("================================================\n");
    out.push_str(&format!(
        "AMOUNT RECEIVED:                    Rs {:>10.2}\n",
        (amount_paisa as f64) / 100.0
    ));
    out.push_str("------------------------------------------------\n");

    if !allocations.is_empty() {
        out.push_str("INVOICE ADJUSTMENT BREAKDOWN:\n");
        out.push_str("Invoice No        Previous   Adjusted    Rem Due\n");
        out.push_str("------------------------------------------------\n");
        for a in allocations {
            let inv_short = if a.invoice_number.len() > 15 {
                &a.invoice_number[..15]
            } else {
                &a.invoice_number
            };
            out.push_str(&format!(
                "{:<15} {:>10.2} {:>10.2} {:>10.2}\n",
                inv_short,
                (a.previous_due_paisa as f64) / 100.0,
                (a.allocated_paisa as f64) / 100.0,
                (a.remaining_due_paisa as f64) / 100.0,
            ));
        }
        out.push_str("------------------------------------------------\n");
    }

    if unallocated_remainder_paisa > 0 {
        out.push_str(&format!(
            "Advance Credit Remainder:           Rs {:>10.2}\n",
            (unallocated_remainder_paisa as f64) / 100.0
        ));
        out.push_str("------------------------------------------------\n");
    }

    out.push_str("CUSTOMER KHATA SUMMARY:\n");
    out.push_str(&format!(
        "Previous Outstanding Balance:       Rs {:>10.2}\n",
        (previous_balance_paisa as f64) / 100.0
    ));
    out.push_str(&format!(
        "Amount Received (Cr Khata):        -Rs {:>10.2}\n",
        (amount_paisa as f64) / 100.0
    ));
    out.push_str("------------------------------------------------\n");
    out.push_str(&format!(
        "NET OUTSTANDING BALANCE:            Rs {:>10.2}\n",
        (new_balance_paisa as f64) / 100.0
    ));
    out.push_str("================================================\n");
    out.push_str("  Bara-e-meherbani baqaya raqam ki tasdeeq farmain.\n");
    out.push_str("  Wasool-kunandah (Signature): _________________\n");
    out.push_str("        Thank you for choosing Logar Traders!   \n");
    out.push_str("================================================\n");
    out
}
