use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordCrateTransactionDto {
    pub customer_id: i64,
    pub crates_out: i64,
    pub crates_in: i64,
    pub voucher_ref: String,
    pub date: Option<String>,
    pub deposit_paid_paisa: Option<i64>,
    pub deposit_refunded_paisa: Option<i64>,
    pub notes: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrateTransactionResult {
    pub customer_id: i64,
    pub crates_out: i64,
    pub crates_in: i64,
    pub net_crate_change: i64,
    pub previous_customer_crate_balance: i64,
    pub new_customer_crate_balance: i64,
    pub warehouse_empty_crates_stock: i64,
    pub deposit_balance_paisa: i64,
    pub ledger_entry_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerCrateLedgerDto {
    pub id: i64,
    pub customer_id: i64,
    pub entry_date: String,
    pub voucher_ref: String,
    pub crates_out: i64,
    pub crates_in: i64,
    pub running_crate_balance: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmptiesOverviewDto {
    pub warehouse_empty_crates: i64,
    pub warehouse_empty_bottles: i64,
    pub total_customer_crates_outstanding: i64,
    pub total_deposit_liability_paisa: i64,
    pub supplier_crates_owed_to_factory: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordSecurityDepositDto {
    pub customer_id: i64,
    pub crates_count: i64,
    pub deposit_rate_per_crate_paisa: i64,
    pub payment_mode: String,
    pub notes: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefundSecurityDepositDto {
    pub customer_id: i64,
    pub crates_count: i64,
    pub deposit_rate_per_crate_paisa: i64,
    pub payment_mode: String,
    pub notes: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityDepositResult {
    pub customer_id: i64,
    pub voucher_number: String,
    pub crates_count: i64,
    pub amount_paisa: i64,
    pub running_deposit_liability_paisa: i64,
    pub cash_book_entry_id: Option<i64>,
}

pub struct CrateService;

impl CrateService {
    pub fn record_crate_transaction(
        conn: &mut Connection,
        req: RecordCrateTransactionDto,
    ) -> Result<CrateTransactionResult, AppError> {
        if req.crates_out < 0 || req.crates_in < 0 {
            return Err(AppError::Validation(
                "Crate quantities cannot be negative".to_string(),
            ));
        }

        if let Some(paid) = req.deposit_paid_paisa {
            if paid < 0 {
                return Err(AppError::Validation(
                    "Deposit paid cannot be negative".to_string(),
                ));
            }
        }

        if let Some(refunded) = req.deposit_refunded_paisa {
            if refunded < 0 {
                return Err(AppError::Validation(
                    "Deposit refunded cannot be negative".to_string(),
                ));
            }
        }

        let entry_date = req
            .date
            .clone()
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());

        let tx = conn.transaction()?;

        // 1. Fetch current customer balances
        let (current_crates, current_deposit_paisa): (i64, i64) = tx
            .query_row(
                "SELECT current_crate_balance, security_deposit_balance_paisa FROM customers WHERE id = ?1",
                params![req.customer_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Customer".to_string(),
                id: req.customer_id.to_string(),
            })?;

        let net_change = req.crates_out - req.crates_in;
        let new_crates_balance = current_crates + net_change;

        let deposit_paid = req.deposit_paid_paisa.unwrap_or(0);
        let deposit_refunded = req.deposit_refunded_paisa.unwrap_or(0);
        let new_deposit_paisa = current_deposit_paisa + deposit_paid - deposit_refunded;

        // 2. Update customer balances
        tx.execute(
            "UPDATE customers SET 
                current_crate_balance = ?1,
                current_crates_balance = ?1,
                security_deposit_balance_paisa = ?2,
                deposit_balance = ?3,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?4",
            params![
                new_crates_balance,
                new_deposit_paisa,
                new_deposit_paisa / 100,
                req.customer_id
            ],
        )?;

        // 3. Insert customer crate ledger record
        tx.execute(
            "INSERT INTO customer_crate_ledger (
                customer_id, entry_date, voucher_ref, crates_out, crates_in, running_crate_balance
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                req.customer_id,
                entry_date,
                req.voucher_ref,
                req.crates_out,
                req.crates_in,
                new_crates_balance
            ],
        )?;
        let ledger_id = tx.last_insert_rowid();

        // 4. Insert empties ledger record
        tx.execute(
            "INSERT INTO empties_ledger (
                entity_type, entity_id, entry_date, voucher_type, voucher_number,
                crates_out, crates_in, running_crates_balance, notes, created_by
             ) VALUES ('CUSTOMER', ?1, ?2, 'CRATE_TX', ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                req.customer_id,
                entry_date,
                req.voucher_ref,
                req.crates_out,
                req.crates_in,
                new_crates_balance,
                req.notes,
                req.user_id
            ],
        )?;

        // 5. Update warehouse empty crate stock in products table
        // When retailer returns crates (crates_in), warehouse empties increase.
        // When crates are issued (crates_out), warehouse empties decrease.
        let warehouse_delta = req.crates_in - req.crates_out;
        tx.execute(
            "UPDATE products SET empty_crates_stock = empty_crates_stock + ?1 WHERE packaging_type = 'RGB_GLASS'",
            params![warehouse_delta],
        )?;

        // Query product 1 warehouse empty crate stock
        let wh_crates: i64 = tx
            .query_row(
                "SELECT empty_crates_stock FROM products WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Optional cash deposit entries if deposit was paid or refunded in the transaction
        if deposit_paid > 0 {
            let voucher_num = format!("DEP-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
            tx.execute(
                "INSERT INTO security_deposits (
                    customer_id, deposit_date, voucher_type, voucher_number, crates_count,
                    deposit_rate_per_crate_paisa, deposit_in_paisa, deposit_out_paisa,
                    running_deposit_liability_paisa, account_id, payment_mode, notes, created_by
                 ) VALUES (?1, ?2, 'SECURITY_DEPOSIT', ?3, ?4, ?5, ?6, 0, ?7, 16, 'CASH', ?8, ?9)",
                params![
                    req.customer_id,
                    entry_date,
                    voucher_num,
                    req.crates_out,
                    if req.crates_out > 0 { deposit_paid / req.crates_out } else { deposit_paid },
                    deposit_paid,
                    new_deposit_paisa,
                    req.notes,
                    req.user_id
                ],
            )?;

            let prev_cash: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let new_cash = prev_cash + deposit_paid;

            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'CRATE_DEPOSIT_IN', 'SECURITY_DEPOSIT', ?2, 16, '2100',
                          'Customer Crate Security Deposit Received', ?3, ?4, ?5, 0, 0, ?6, ?7, ?8)",
                params![
                    entry_date,
                    voucher_num,
                    req.notes.clone().unwrap_or_default(),
                    deposit_paid / 100,
                    deposit_paid,
                    new_cash,
                    new_cash / 100,
                    req.user_id
                ],
            )?;

            let je_num = format!("JE-{}", voucher_num);
            tx.execute(
                "INSERT INTO journal_entries (entry_number, entry_date, voucher_type, narration, is_balanced, created_by)
                 VALUES (?1, ?2, 'RECEIPT', 'Refundable crate security deposit received', 1, ?3)",
                params![je_num, entry_date, req.user_id],
            )?;
            let je_id = tx.last_insert_rowid();

            // Dr 1010 Cash on Hand
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 2, ?2, 0, 'Cash received for crate security deposit')",
                params![je_id, deposit_paid],
            )?;
            // Cr 2100 Customer Crate Security Deposits Payable
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration, customer_id)
                 VALUES (?1, 16, 0, ?2, 'Security deposit liability held for customer', ?3)",
                params![je_id, deposit_paid, req.customer_id],
            )?;
        }

        if deposit_refunded > 0 {
            let voucher_num = format!("REF-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
            tx.execute(
                "INSERT INTO security_deposits (
                    customer_id, deposit_date, voucher_type, voucher_number, crates_count,
                    deposit_rate_per_crate_paisa, deposit_in_paisa, deposit_out_paisa,
                    running_deposit_liability_paisa, account_id, payment_mode, notes, created_by
                 ) VALUES (?1, ?2, 'DEPOSIT_REFUND', ?3, ?4, ?5, 0, ?6, ?7, 16, 'CASH', ?8, ?9)",
                params![
                    req.customer_id,
                    entry_date,
                    voucher_num,
                    req.crates_in,
                    if req.crates_in > 0 { deposit_refunded / req.crates_in } else { deposit_refunded },
                    deposit_refunded,
                    new_deposit_paisa,
                    req.notes,
                    req.user_id
                ],
            )?;

            let prev_cash: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let new_cash = prev_cash - deposit_refunded;

            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'CRATE_DEPOSIT_REFUND', 'DEPOSIT_REFUND', ?2, 16, '2100',
                          'Customer Crate Security Deposit Refunded', ?3, 0, 0, ?4, ?5, ?6, ?7, ?8)",
                params![
                    entry_date,
                    voucher_num,
                    req.notes.clone().unwrap_or_default(),
                    deposit_refunded / 100,
                    deposit_refunded,
                    new_cash,
                    new_cash / 100,
                    req.user_id
                ],
            )?;

            let je_num = format!("JE-{}", voucher_num);
            tx.execute(
                "INSERT INTO journal_entries (entry_number, entry_date, voucher_type, narration, is_balanced, created_by)
                 VALUES (?1, ?2, 'PAYMENT', 'Refund of crate security deposit liability', 1, ?3)",
                params![je_num, entry_date, req.user_id],
            )?;
            let je_id = tx.last_insert_rowid();

            // Dr 2100 Customer Crate Security Deposits Payable
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration, customer_id)
                 VALUES (?1, 16, ?2, 0, 'Refund of customer crate security deposit liability', ?3)",
                params![je_id, deposit_refunded, req.customer_id],
            )?;
            // Cr 1010 Cash on Hand
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 2, 0, ?2, 'Cash paid out on crate return refund')",
                params![je_id, deposit_refunded],
            )?;
        }

        tx.commit()?;

        Ok(CrateTransactionResult {
            customer_id: req.customer_id,
            crates_out: req.crates_out,
            crates_in: req.crates_in,
            net_crate_change: net_change,
            previous_customer_crate_balance: current_crates,
            new_customer_crate_balance: new_crates_balance,
            warehouse_empty_crates_stock: wh_crates,
            deposit_balance_paisa: new_deposit_paisa,
            ledger_entry_id: ledger_id,
        })
    }

    pub fn get_empties_overview(conn: &Connection) -> Result<EmptiesOverviewDto, AppError> {
        let wh_crates: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(empty_crates_stock), 0) FROM products WHERE packaging_type = 'RGB_GLASS'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let wh_bottles: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(empty_bottles_stock), 0) FROM products WHERE is_glass = 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let cust_crates: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(current_crate_balance), 0) FROM customers",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let cust_deposits: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(security_deposit_balance_paisa), 0) FROM customers",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let supp_crates: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(crates_owed_to_company), 0) FROM suppliers",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        Ok(EmptiesOverviewDto {
            warehouse_empty_crates: wh_crates,
            warehouse_empty_bottles: wh_bottles,
            total_customer_crates_outstanding: cust_crates,
            total_deposit_liability_paisa: cust_deposits,
            supplier_crates_owed_to_factory: supp_crates,
        })
    }

    pub fn get_customer_crate_ledger(
        conn: &Connection,
        customer_id: i64,
        limit: usize,
    ) -> Result<Vec<CustomerCrateLedgerDto>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, customer_id, entry_date, voucher_ref, crates_out, crates_in, running_crate_balance, created_at
             FROM customer_crate_ledger
             WHERE customer_id = ?1
             ORDER BY id DESC
             LIMIT ?2",
        )?;

        let rows = stmt.query_map(params![customer_id, limit as i64], |row| {
            Ok(CustomerCrateLedgerDto {
                id: row.get(0)?,
                customer_id: row.get(1)?,
                entry_date: row.get(2)?,
                voucher_ref: row.get(3)?,
                crates_out: row.get(4)?,
                crates_in: row.get(5)?,
                running_crate_balance: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    pub fn record_security_deposit(
        conn: &mut Connection,
        req: RecordSecurityDepositDto,
    ) -> Result<SecurityDepositResult, AppError> {
        if req.crates_count <= 0 || req.deposit_rate_per_crate_paisa <= 0 {
            return Err(AppError::Validation(
                "Crates count and deposit rate must be strictly positive".to_string(),
            ));
        }

        let amount_paisa = req
            .crates_count
            .checked_mul(req.deposit_rate_per_crate_paisa)
            .ok_or_else(|| {
                AppError::Validation("Arithmetic overflow in security deposit calculation".into())
            })?;

        let entry_date = Utc::now().format("%Y-%m-%d").to_string();
        let voucher_num = format!("DEP-{}", Uuid::new_v4().to_string()[..8].to_uppercase());

        let tx = conn.transaction()?;

        // 1. Fetch and update customer deposit liability balance
        let current_deposit_paisa: i64 = tx
            .query_row(
                "SELECT security_deposit_balance_paisa FROM customers WHERE id = ?1",
                params![req.customer_id],
                |r| r.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Customer".to_string(),
                id: req.customer_id.to_string(),
            })?;

        let new_deposit_paisa = current_deposit_paisa + amount_paisa;

        tx.execute(
            "UPDATE customers SET 
                security_deposit_balance_paisa = ?1,
                deposit_balance = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?3",
            params![new_deposit_paisa, new_deposit_paisa / 100, req.customer_id],
        )?;

        // 2. Insert into security_deposits
        tx.execute(
            "INSERT INTO security_deposits (
                customer_id, deposit_date, voucher_type, voucher_number, crates_count,
                deposit_rate_per_crate_paisa, deposit_in_paisa, deposit_out_paisa,
                running_deposit_liability_paisa, account_id, payment_mode, notes, created_by
             ) VALUES (?1, ?2, 'SECURITY_DEPOSIT', ?3, ?4, ?5, ?6, 0, ?7, 16, ?8, ?9, ?10)",
            params![
                req.customer_id,
                entry_date,
                voucher_num,
                req.crates_count,
                req.deposit_rate_per_crate_paisa,
                amount_paisa,
                new_deposit_paisa,
                req.payment_mode,
                req.notes,
                req.user_id
            ],
        )?;

        // 3. Insert into cash_book
        let prev_cash: i64 = tx
            .query_row(
                "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let new_cash = prev_cash + amount_paisa;

        tx.execute(
            "INSERT INTO cash_book (
                entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                account_id, account_code, particulars, description,
                cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                running_balance_paisa, running_cash_balance, created_by
             ) VALUES (?1, 'CRATE_DEPOSIT_IN', 'SECURITY_DEPOSIT', ?2, 16, '2100',
                      'Customer Crate Security Deposit Received', ?3, ?4, ?5, 0, 0, ?6, ?7, ?8)",
            params![
                entry_date,
                voucher_num,
                req.notes.clone().unwrap_or_default(),
                amount_paisa / 100,
                amount_paisa,
                new_cash,
                new_cash / 100,
                req.user_id
            ],
        )?;
        let cash_entry_id = tx.last_insert_rowid();

        // 4. Double entry journal: Dr 1010 Cash on Hand (Acct 2), Cr 2100 Crate Security Deposits Payable (Acct 16)
        let je_num = format!("JE-{}", voucher_num);
        tx.execute(
            "INSERT INTO journal_entries (entry_number, entry_date, voucher_type, narration, is_balanced, created_by)
             VALUES (?1, ?2, 'RECEIPT', 'Customer crate security deposit received', 1, ?3)",
            params![je_num, entry_date, req.user_id],
        )?;
        let je_id = tx.last_insert_rowid();

        tx.execute(
            "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
             VALUES (?1, 2, ?2, 0, 'Cash received for crate security deposit')",
            params![je_id, amount_paisa],
        )?;

        tx.execute(
            "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration, customer_id)
             VALUES (?1, 16, 0, ?2, 'Customer crate security deposit liability', ?3)",
            params![je_id, amount_paisa, req.customer_id],
        )?;

        tx.commit()?;

        Ok(SecurityDepositResult {
            customer_id: req.customer_id,
            voucher_number: voucher_num,
            crates_count: req.crates_count,
            amount_paisa,
            running_deposit_liability_paisa: new_deposit_paisa,
            cash_book_entry_id: Some(cash_entry_id),
        })
    }

    pub fn refund_security_deposit(
        conn: &mut Connection,
        req: RefundSecurityDepositDto,
    ) -> Result<SecurityDepositResult, AppError> {
        if req.crates_count <= 0 || req.deposit_rate_per_crate_paisa <= 0 {
            return Err(AppError::Validation(
                "Crates count and deposit rate must be strictly positive".to_string(),
            ));
        }

        let amount_paisa = req
            .crates_count
            .checked_mul(req.deposit_rate_per_crate_paisa)
            .ok_or_else(|| {
                AppError::Validation("Arithmetic overflow in security deposit refund calculation".into())
            })?;

        let entry_date = Utc::now().format("%Y-%m-%d").to_string();
        let voucher_num = format!("REF-{}", Uuid::new_v4().to_string()[..8].to_uppercase());

        let tx = conn.transaction()?;

        // 1. Fetch current deposit liability
        let current_deposit_paisa: i64 = tx
            .query_row(
                "SELECT security_deposit_balance_paisa FROM customers WHERE id = ?1",
                params![req.customer_id],
                |r| r.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Customer".to_string(),
                id: req.customer_id.to_string(),
            })?;

        let new_deposit_paisa = current_deposit_paisa - amount_paisa;

        tx.execute(
            "UPDATE customers SET 
                security_deposit_balance_paisa = ?1,
                deposit_balance = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?3",
            params![new_deposit_paisa, new_deposit_paisa / 100, req.customer_id],
        )?;

        // 2. Insert into security_deposits
        tx.execute(
            "INSERT INTO security_deposits (
                customer_id, deposit_date, voucher_type, voucher_number, crates_count,
                deposit_rate_per_crate_paisa, deposit_in_paisa, deposit_out_paisa,
                running_deposit_liability_paisa, account_id, payment_mode, notes, created_by
             ) VALUES (?1, ?2, 'DEPOSIT_REFUND', ?3, ?4, ?5, 0, ?6, ?7, 16, ?8, ?9, ?10)",
            params![
                req.customer_id,
                entry_date,
                voucher_num,
                req.crates_count,
                req.deposit_rate_per_crate_paisa,
                amount_paisa,
                new_deposit_paisa,
                req.payment_mode,
                req.notes,
                req.user_id
            ],
        )?;

        // 3. Insert into cash_book
        let prev_cash: i64 = tx
            .query_row(
                "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let new_cash = prev_cash - amount_paisa;

        tx.execute(
            "INSERT INTO cash_book (
                entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                account_id, account_code, particulars, description,
                cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                running_balance_paisa, running_cash_balance, created_by
             ) VALUES (?1, 'CRATE_DEPOSIT_REFUND', 'DEPOSIT_REFUND', ?2, 16, '2100',
                      'Customer Crate Security Deposit Refunded', ?3, 0, 0, ?4, ?5, ?6, ?7, ?8)",
            params![
                entry_date,
                voucher_num,
                req.notes.clone().unwrap_or_default(),
                amount_paisa / 100,
                amount_paisa,
                new_cash,
                new_cash / 100,
                req.user_id
            ],
        )?;
        let cash_entry_id = tx.last_insert_rowid();

        // 4. Double entry journal: Dr 2100 Customer Crate Security Deposits Payable (Acct 16), Cr 1010 Cash on Hand (Acct 2)
        let je_num = format!("JE-{}", voucher_num);
        tx.execute(
            "INSERT INTO journal_entries (entry_number, entry_date, voucher_type, narration, is_balanced, created_by)
             VALUES (?1, ?2, 'PAYMENT', 'Customer crate security deposit refunded', 1, ?3)",
            params![je_num, entry_date, req.user_id],
        )?;
        let je_id = tx.last_insert_rowid();

        tx.execute(
            "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration, customer_id)
             VALUES (?1, 16, ?2, 0, 'Refund of customer crate security deposit liability', ?3)",
            params![je_id, amount_paisa, req.customer_id],
        )?;

        tx.execute(
            "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
             VALUES (?1, 2, 0, ?2, 'Cash paid on crate security deposit refund')",
            params![je_id, amount_paisa],
        )?;

        tx.commit()?;

        Ok(SecurityDepositResult {
            customer_id: req.customer_id,
            voucher_number: voucher_num,
            crates_count: req.crates_count,
            amount_paisa,
            running_deposit_liability_paisa: new_deposit_paisa,
            cash_book_entry_id: Some(cash_entry_id),
        })
    }
}
