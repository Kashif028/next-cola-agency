use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DenominationCountsDto {
    pub note_5000: u32,
    pub note_1000: u32,
    pub note_500: u32,
    pub note_100: u32,
    pub note_50: u32,
    pub note_20: u32,
    pub note_10: u32,
    pub coin_10: u32,
    pub coin_5: u32,
    pub coin_2: u32,
    pub coin_1: u32,
}

impl DenominationCountsDto {
    pub fn calculate_total_paisa(&self) -> i64 {
        (self.note_5000 as i64 * 500_000)
            + (self.note_1000 as i64 * 100_000)
            + (self.note_500 as i64 * 50_000)
            + (self.note_100 as i64 * 10_000)
            + (self.note_50 as i64 * 5_000)
            + (self.note_20 as i64 * 2_000)
            + (self.note_10 as i64 * 1_000)
            + (self.coin_10 as i64 * 1_000)
            + (self.coin_5 as i64 * 500)
            + (self.coin_2 as i64 * 200)
            + (self.coin_1 as i64 * 100)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashInBreakdownDto {
    pub pos_cash_sales_paisa: i64,
    pub route_cash_collections_paisa: i64,
    pub customer_recoveries_paisa: i64,
    pub crate_deposits_paisa: i64,
    pub other_cash_in_paisa: i64,
    pub total_cash_in_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashOutBreakdownDto {
    pub supplier_payments_paisa: i64,
    pub cash_purchases_paisa: i64,
    pub expenses_paid_paisa: i64,
    pub deposit_refunds_paisa: i64,
    pub bank_deposits_paisa: i64,
    pub owner_drawings_paisa: i64,
    pub total_cash_out_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalesDayStatisticsDto {
    pub total_invoices_count: usize,
    pub total_sales_invoiced_paisa: i64,
    pub total_cash_sales_paisa: i64,
    pub total_credit_sales_paisa: i64,
    pub total_crates_issued: i32,
    pub total_crates_collected: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyClosingSummaryDto {
    pub closing_date: String,
    pub opening_cash_paisa: i64,
    pub is_already_closed: bool,
    pub existing_closing_id: Option<i64>,
    pub cash_in: CashInBreakdownDto,
    pub cash_out: CashOutBreakdownDto,
    pub expected_closing_cash_paisa: i64,
    pub sales_stats: SalesDayStatisticsDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitClosingDto {
    pub closing_date: String,
    pub physical_denominations: DenominationCountsDto,
    pub variance_reason: Option<String>,
    pub admin_pin: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitClosingResult {
    pub closing_id: i64,
    pub closing_date: String,
    pub opening_cash_paisa: i64,
    pub expected_closing_cash_paisa: i64,
    pub physical_closing_cash_paisa: i64,
    pub variance_paisa: i64,
    pub variance_type: String, // 'BALANCED', 'SHORTAGE', 'EXCESS'
    pub variance_journal_entry_id: Option<i64>,
    pub locked_invoices_count: usize,
    pub status: String,
    pub closed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyClosingHistoryItemDto {
    pub id: i64,
    pub closing_date: String,
    pub opening_cash_paisa: i64,
    pub total_cash_in_paisa: i64,
    pub total_cash_out_paisa: i64,
    pub expected_closing_cash_paisa: i64,
    pub physical_closing_cash_paisa: i64,
    pub variance_paisa: i64,
    pub status: String,
    pub is_locked: bool,
    pub closed_by_name: Option<String>,
    pub closed_at: String,
}

pub struct ClosingService;

impl ClosingService {
    pub fn get_daily_summary(
        conn: &Connection,
        closing_date: Option<&str>,
    ) -> Result<DailyClosingSummaryDto, AppError> {
        let date_str = closing_date
            .map(|s| s.to_string())
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());

        // 1. Check if already closed
        let existing_closing: Option<i64> = conn
            .query_row(
                "SELECT id FROM daily_closings WHERE closing_date = ?1",
                params![date_str],
                |r| r.get(0),
            )
            .optional()?;
        let is_already_closed = existing_closing.is_some();

        // 2. Opening Cash
        // Look for the last physical closing cash before this date
        let prev_closing_cash: Option<i64> = conn
            .query_row(
                "SELECT physical_closing_cash_paisa FROM daily_closings 
                 WHERE closing_date < ?1 ORDER BY closing_date DESC LIMIT 1",
                params![date_str],
                |r| r.get(0),
            )
            .optional()?;

        let opening_cash_paisa = match prev_closing_cash {
            Some(cash) => cash,
            None => {
                // If no previous closing, query the cash_book running balance before today's date
                let prev_cash_book: Option<i64> = conn
                    .query_row(
                        "SELECT running_balance_paisa FROM cash_book 
                         WHERE entry_date < ?1 ORDER BY id DESC LIMIT 1",
                        params![date_str],
                        |r| r.get(0),
                    )
                    .optional()?;
                prev_cash_book.unwrap_or(0)
            }
        };

        // 3. Inflow breakdown
        // A. POS cash sales
        let pos_cash_sales_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(paid_amount_paisa), 0) FROM sales_invoices 
                 WHERE invoice_date = ?1 AND is_cancelled = 0 AND delivery_sheet_id IS NULL AND payment_type IN ('CASH', 'SPLIT')",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // B. Route van cash collections
        let route_cash_collections_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(actual_cash_paisa), 0) FROM delivery_sheets 
                 WHERE sheet_date = ?1 AND status IN ('SETTLED', 'AUDITED')",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // C. Customer recoveries
        let customer_recoveries_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cash_in_paisa), 0) FROM cash_book 
                 WHERE entry_date = ?1 AND transaction_type IN ('CUSTOMER_RECOVERY', 'CUSTOMER_PAYMENT', 'RECOVERY')",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // D. Crate deposits
        let crate_deposits_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(deposit_in_paisa), 0) FROM security_deposits 
                 WHERE deposit_date = ?1 AND payment_mode = 'CASH'",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // E. Other cash in from cash book
        let other_cash_in_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cash_in_paisa), 0) FROM cash_book 
                 WHERE entry_date = ?1 AND transaction_type NOT IN (
                     'CASH_SALE', 'CUSTOMER_RECOVERY', 'CUSTOMER_PAYMENT', 'RECOVERY',
                     'CRATE_DEPOSIT', 'CASH_EXCESS', 'ROUTE_CASH_HANDOVER', 'VAN_SETTLEMENT_DROP'
                 )",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // Total cash in directly from cash_book for robustness
        let total_cash_in_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cash_in_paisa), 0) FROM cash_book 
                 WHERE entry_date = ?1 AND transaction_type != 'CASH_EXCESS'",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // 4. Outflow breakdown
        let supplier_payments_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cash_out_paisa), 0) FROM cash_book 
                 WHERE entry_date = ?1 AND transaction_type = 'SUPPLIER_PAYMENT'",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let cash_purchases_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(paid_amount_paisa), 0) FROM purchase_invoices 
                 WHERE purchase_date = ?1 AND payment_mode IN ('CASH', 'SPLIT')",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let expenses_paid_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cash_out_paisa), 0) FROM cash_book 
                 WHERE entry_date = ?1 AND transaction_type = 'EXPENSE'",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let deposit_refunds_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(deposit_out_paisa), 0) FROM security_deposits 
                 WHERE deposit_date = ?1 AND payment_mode = 'CASH'",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let bank_deposits_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cash_out_paisa), 0) FROM cash_book 
                 WHERE entry_date = ?1 AND transaction_type = 'BANK_DEPOSIT'",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let owner_drawings_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cash_out_paisa), 0) FROM cash_book 
                 WHERE entry_date = ?1 AND transaction_type = 'OWNER_DRAWING'",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // Total cash out from cash_book
        let total_cash_out_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cash_out_paisa), 0) FROM cash_book 
                 WHERE entry_date = ?1 AND transaction_type != 'CASH_SHORTAGE'",
                params![date_str],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // Expected Cash = Opening + Cash In - Cash Out
        let expected_closing_cash_paisa = opening_cash_paisa + total_cash_in_paisa - total_cash_out_paisa;

        // 5. Sales Statistics
        let (
            invoices_count,
            total_sales_invoiced,
            total_cash_sales,
            total_credit_sales,
            crates_issued,
            crates_returned,
        ): (i64, i64, i64, i64, i64, i64) = conn
            .query_row(
                "SELECT COUNT(*),
                        COALESCE(SUM(net_total_paisa), 0),
                        COALESCE(SUM(paid_amount_paisa), 0),
                        COALESCE(SUM(due_amount_paisa), 0),
                        COALESCE(SUM(crates_issued), 0),
                        COALESCE(SUM(crates_returned), 0)
                 FROM sales_invoices 
                 WHERE invoice_date = ?1 AND is_cancelled = 0",
                params![date_str],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                    ))
                },
            )
            .unwrap_or((0, 0, 0, 0, 0, 0));

        Ok(DailyClosingSummaryDto {
            closing_date: date_str,
            opening_cash_paisa,
            is_already_closed,
            existing_closing_id: existing_closing,
            cash_in: CashInBreakdownDto {
                pos_cash_sales_paisa,
                route_cash_collections_paisa,
                customer_recoveries_paisa,
                crate_deposits_paisa,
                other_cash_in_paisa,
                total_cash_in_paisa,
            },
            cash_out: CashOutBreakdownDto {
                supplier_payments_paisa,
                cash_purchases_paisa,
                expenses_paid_paisa,
                deposit_refunds_paisa,
                bank_deposits_paisa,
                owner_drawings_paisa,
                total_cash_out_paisa,
            },
            expected_closing_cash_paisa,
            sales_stats: SalesDayStatisticsDto {
                total_invoices_count: invoices_count as usize,
                total_sales_invoiced_paisa: total_sales_invoiced,
                total_cash_sales_paisa: total_cash_sales,
                total_credit_sales_paisa: total_credit_sales,
                total_crates_issued: crates_issued as i32,
                total_crates_collected: crates_returned as i32,
            },
        })
    }

    pub fn submit_closing(
        conn: &mut Connection,
        req: SubmitClosingDto,
    ) -> Result<SubmitClosingResult, AppError> {
        let summary = Self::get_daily_summary(conn, Some(&req.closing_date))?;
        if summary.is_already_closed {
            return Err(AppError::Validation(format!(
                "Daily closing already finalized for {}",
                req.closing_date
            )));
        }

        let user_id = req.user_id.unwrap_or(1);
        let physical_closing_cash_paisa = req.physical_denominations.calculate_total_paisa();
        let expected_closing_cash_paisa = summary.expected_closing_cash_paisa;
        let variance_paisa = physical_closing_cash_paisa - expected_closing_cash_paisa;

        let variance_type = if variance_paisa == 0 {
            "BALANCED"
        } else if variance_paisa < 0 {
            "SHORTAGE"
        } else {
            "EXCESS"
        };

        let tx = conn.transaction()?;

        let mut variance_journal_entry_id = None;

        // Double-entry posting for variance
        if variance_paisa < 0 {
            // Cash Shortage: Dr 1250 (Driver/Cashier Shortage Receivables) / Cr 1010 (Cash on Hand)
            let abs_shortage = -variance_paisa;
            let jv_num = format!("JV-CLS-{}", Uuid::new_v4().to_string()[..8].to_uppercase());

            tx.execute(
                "INSERT INTO journal_entries (
                    entry_number, entry_date, voucher_type, reference_doc_type,
                    narration, is_balanced, created_by
                 ) VALUES (?1, ?2, 'CLOSING', 'DAILY_CLOSING', ?3, 1, ?4)",
                params![
                    jv_num,
                    req.closing_date,
                    format!("Daily Closing Cash Shortage: {}", req.variance_reason.as_deref().unwrap_or("Shortage")),
                    user_id
                ],
            )?;
            let jv_id = tx.last_insert_rowid();

            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 9, ?2, 0, 'Cashier Shortage Receivables')",
                params![jv_id, abs_shortage],
            )?;

            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 2, 0, ?2, 'Cash on Hand reduction')",
                params![jv_id, abs_shortage],
            )?;

            variance_journal_entry_id = Some(jv_id);

            // Record cash book outflow
            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'CASH_SHORTAGE', 'DAILY_CLOSING', ?2, 9, '1250',
                          'Cash Shortage on Daily Closing', ?3, 0, 0, ?4, ?5, ?6, ?7, ?8)",
                params![
                    req.closing_date,
                    jv_num,
                    req.variance_reason.as_deref().unwrap_or("Shortage at daily closing"),
                    abs_shortage / 100,
                    abs_shortage,
                    physical_closing_cash_paisa,
                    physical_closing_cash_paisa / 100,
                    user_id
                ],
            )?;
        } else if variance_paisa > 0 {
            // Cash Excess: Dr 1010 (Cash on Hand) / Cr 4090 (Miscellaneous Income / Cash Excess)
            let jv_num = format!("JV-CLS-{}", Uuid::new_v4().to_string()[..8].to_uppercase());

            tx.execute(
                "INSERT INTO journal_entries (
                    entry_number, entry_date, voucher_type, reference_doc_type,
                    narration, is_balanced, created_by
                 ) VALUES (?1, ?2, 'CLOSING', 'DAILY_CLOSING', ?3, 1, ?4)",
                params![
                    jv_num,
                    req.closing_date,
                    format!("Daily Closing Cash Excess: {}", req.variance_reason.as_deref().unwrap_or("Excess")),
                    user_id
                ],
            )?;
            let jv_id = tx.last_insert_rowid();

            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 2, ?2, 0, 'Cash on Hand increment')",
                params![jv_id, variance_paisa],
            )?;

            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 39, 0, ?2, 'Miscellaneous Income / Cash Excess')",
                params![jv_id, variance_paisa],
            )?;

            variance_journal_entry_id = Some(jv_id);

            // Record cash book inflow
            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'CASH_EXCESS', 'DAILY_CLOSING', ?2, 39, '4090',
                          'Cash Excess on Daily Closing', ?3, ?4, ?5, 0, 0, ?6, ?7, ?8)",
                params![
                    req.closing_date,
                    jv_num,
                    req.variance_reason.as_deref().unwrap_or("Excess at daily closing"),
                    variance_paisa / 100,
                    variance_paisa,
                    physical_closing_cash_paisa,
                    physical_closing_cash_paisa / 100,
                    user_id
                ],
            )?;
        }

        // Lock all transactions on this date BEFORE inserting the daily_closings master record
        let locked_invoices: usize = tx.execute(
            "UPDATE sales_invoices SET is_locked = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE invoice_date = ?1 AND is_locked = 0",
            params![req.closing_date],
        )?;

        let _ = tx.execute(
            "UPDATE purchase_invoices SET is_locked = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE purchase_date = ?1 AND is_locked = 0",
            params![req.closing_date],
        );

        let _ = tx.execute(
            "UPDATE cash_book SET is_locked = 1
             WHERE entry_date = ?1 AND is_locked = 0",
            params![req.closing_date],
        );

        let _ = tx.execute(
            "UPDATE journal_entries SET is_locked = 1
             WHERE entry_date = ?1 AND is_locked = 0",
            params![req.closing_date],
        );

        let _ = tx.execute(
            "UPDATE sales_returns SET is_locked = 1
             WHERE return_date = ?1 AND is_locked = 0",
            params![req.closing_date],
        );

        let _ = tx.execute(
            "UPDATE operating_expenses SET is_locked = 1
             WHERE expense_date = ?1 AND is_locked = 0",
            params![req.closing_date],
        );

        let _ = tx.execute(
            "UPDATE customer_recoveries SET is_locked = 1
             WHERE recovery_date = ?1 AND is_locked = 0",
            params![req.closing_date],
        );

        let _ = tx.execute(
            "UPDATE delivery_sheets SET is_locked = 1
             WHERE sheet_date = ?1 AND is_locked = 0",
            params![req.closing_date],
        );

        // Insert into daily_closings
        let denominations_json = serde_json::to_string(&req.physical_denominations).unwrap_or_default();
        let closed_at = Utc::now().format("%Y-%m-%dT%H:%M:%fZ").to_string();

        tx.execute(
            "INSERT INTO daily_closings (
                closing_date, opening_cash, opening_cash_paisa,
                cash_sales_paisa, udhaar_recoveries_paisa, crate_deposits_paisa, other_cash_in_paisa,
                total_cash_in, total_cash_in_paisa,
                supplier_payments_paisa, cash_purchases_paisa, expenses_paid_paisa,
                deposit_refunds_paisa, bank_deposits_paisa, owner_drawings_paisa,
                total_cash_out, total_cash_out_paisa,
                expected_closing_cash, expected_closing_cash_paisa,
                physical_closing_cash, physical_closing_cash_paisa,
                cash_variance, variance_paisa,
                denominations_json,
                total_sales_invoiced, total_sales_invoiced_paisa,
                total_credit_sales, total_credit_sales_paisa,
                variance_reason, status, is_locked, closed_by, closed_at
             ) VALUES (
                ?1, ?2, ?3,
                ?4, ?5, ?6, ?7,
                ?8, ?9,
                ?10, ?11, ?12,
                ?13, ?14, ?15,
                ?16, ?17,
                ?18, ?19,
                ?20, ?21,
                ?22, ?23,
                ?24,
                ?25, ?26,
                ?27, ?28,
                ?29, 'LOCKED', 1, ?30, ?31
             )",
            params![
                req.closing_date,
                summary.opening_cash_paisa / 100,
                summary.opening_cash_paisa,
                summary.cash_in.pos_cash_sales_paisa,
                summary.cash_in.customer_recoveries_paisa,
                summary.cash_in.crate_deposits_paisa,
                summary.cash_in.other_cash_in_paisa,
                summary.cash_in.total_cash_in_paisa / 100,
                summary.cash_in.total_cash_in_paisa,
                summary.cash_out.supplier_payments_paisa,
                summary.cash_out.cash_purchases_paisa,
                summary.cash_out.expenses_paid_paisa,
                summary.cash_out.deposit_refunds_paisa,
                summary.cash_out.bank_deposits_paisa,
                summary.cash_out.owner_drawings_paisa,
                summary.cash_out.total_cash_out_paisa / 100,
                summary.cash_out.total_cash_out_paisa,
                expected_closing_cash_paisa / 100,
                expected_closing_cash_paisa,
                physical_closing_cash_paisa / 100,
                physical_closing_cash_paisa,
                variance_paisa / 100,
                variance_paisa,
                denominations_json,
                summary.sales_stats.total_sales_invoiced_paisa / 100,
                summary.sales_stats.total_sales_invoiced_paisa,
                summary.sales_stats.total_credit_sales_paisa / 100,
                summary.sales_stats.total_credit_sales_paisa,
                req.variance_reason,
                user_id,
                closed_at
            ],
        )?;
        let closing_id = tx.last_insert_rowid();

        // Audit log
        let _ = tx.execute(
            "INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, reason, ip_address)
             VALUES (?1, 'system', 'DAILY_CLOSING_LOCK', 'daily_closings', ?2, ?3, '127.0.0.1')",
            params![
                user_id,
                closing_id.to_string(),
                format!("Daily closing locked for date {}", req.closing_date)
            ],
        );

        tx.commit()?;

        Ok(SubmitClosingResult {
            closing_id,
            closing_date: req.closing_date,
            opening_cash_paisa: summary.opening_cash_paisa,
            expected_closing_cash_paisa,
            physical_closing_cash_paisa,
            variance_paisa,
            variance_type: variance_type.to_string(),
            variance_journal_entry_id,
            locked_invoices_count: locked_invoices,
            status: "LOCKED".to_string(),
            closed_at,
        })
    }

    pub fn get_history(
        conn: &Connection,
        limit: Option<usize>,
    ) -> Result<Vec<DailyClosingHistoryItemDto>, AppError> {
        let max_rows = limit.unwrap_or(30);
        let mut stmt = conn.prepare(
            "SELECT dc.id, dc.closing_date, dc.opening_cash_paisa, dc.total_cash_in_paisa,
                    dc.total_cash_out_paisa, dc.expected_closing_cash_paisa,
                    dc.physical_closing_cash_paisa, dc.variance_paisa, dc.status,
                    dc.is_locked, u.full_name, dc.closed_at
             FROM daily_closings dc
             LEFT JOIN users u ON dc.closed_by = u.id
             ORDER BY dc.closing_date DESC LIMIT ?1",
        )?;

        let history = stmt
            .query_map(params![max_rows as i64], |r| {
                Ok(DailyClosingHistoryItemDto {
                    id: r.get(0)?,
                    closing_date: r.get(1)?,
                    opening_cash_paisa: r.get(2)?,
                    total_cash_in_paisa: r.get(3)?,
                    total_cash_out_paisa: r.get(4)?,
                    expected_closing_cash_paisa: r.get(5)?,
                    physical_closing_cash_paisa: r.get(6)?,
                    variance_paisa: r.get(7)?,
                    status: r.get(8)?,
                    is_locked: r.get::<_, i32>(9)? == 1,
                    closed_by_name: r.get(10)?,
                    closed_at: r.get(11)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(history)
    }
}
