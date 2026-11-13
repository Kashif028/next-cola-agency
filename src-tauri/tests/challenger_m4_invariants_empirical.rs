//! Empirical Challenger Test Suite: Milestone 4 Immutability & Accounting Invariants
//! File: src-tauri/tests/challenger_m4_invariants_empirical.rs
//!
//! EMPIRICAL CHALLENGER verification:
//! 1. Database Immutability Triggers: UPDATE/DELETE on `operating_expenses` and `customer_recoveries`
//!    on closed/locked dates is blocked by SQLite triggers across all attack vectors.
//! 2. Daily Closing ceremony atomic locking: lock sequence runs before master record creation,
//!    preventing trigger conflicts, followed by permanent immutability.
//! 3. Trial Balance conditional date filtering: zero-balance accounts preserved, future journal entries
//!    strictly excluded, and sum(Dr) == sum(Cr) invariant preserved algebraically.
//! 4. Profit & Loss Sales Returns deduction: verified against cancelled returns, date boundaries,
//!    and revenue statement calculation.

use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::dtos::*;
use logar_pos_lib::domain::models::PaymentType;
use logar_pos_lib::services::accounting::AccountingService;
use logar_pos_lib::services::closing::{ClosingService, DenominationCountsDto, SubmitClosingDto};
use logar_pos_lib::services::sales::{CreateSalesInvoiceDto, CreateSalesInvoiceItemDto, SalesService};
use rusqlite::{params, Connection};

fn setup_test_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations");
    conn
}

fn empty_denominations() -> DenominationCountsDto {
    DenominationCountsDto {
        note_5000: 0,
        note_1000: 0,
        note_500: 0,
        note_100: 0,
        note_50: 0,
        note_20: 0,
        note_10: 0,
        coin_10: 0,
        coin_5: 0,
        coin_2: 0,
        coin_1: 0,
    }
}

// ============================================================================
// EMPIRICAL CHALLENGE 1: OPERATING EXPENSES IMMUTABILITY TRIGGERS
// ============================================================================
#[test]
fn test_empirical_sqlite_immutability_triggers_operating_expenses() {
    let conn = setup_test_db();

    // 1. Seed operating expense on date "2026-11-05"
    conn.execute(
        "INSERT INTO operating_expenses (
            id, expense_number, expense_date, account_id, account_code,
            amount, amount_paisa, payment_mode, recipient_name, description, is_locked
         ) VALUES (101, 'EXP-TEST-01', '2026-11-05', 30, 6010, 50.0, 5000, 'CASH', 'Fuel Station', 'Diesel fuel', 0)",
        [],
    ).expect("Insert initial expense");

    // Pre-lock: Verify expense is mutable before day lock
    conn.execute(
        "UPDATE operating_expenses SET description = 'Updated diesel fuel' WHERE id = 101",
        [],
    ).expect("Normal update must succeed when date is open");

    // 2. Lock the date via daily_closings
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked) VALUES ('2026-11-05', 1)",
        [],
    ).expect("Lock date 2026-11-05");

    // --- ATTACK VECTOR 1: Direct SQL UPDATE to amount_paisa on closed date ---
    let err_upd_amount = conn.execute(
        "UPDATE operating_expenses SET amount_paisa = 999999 WHERE id = 101",
        [],
    ).unwrap_err();
    assert!(
        err_upd_amount.to_string().contains("Access Denied: Cannot modify an expense on a locked accounting date."),
        "Trigger trg_prevent_update_locked_operating_expense must fire! Got: {}", err_upd_amount
    );

    // --- ATTACK VECTOR 2: Direct SQL UPDATE to non-monetary field (tampering description) ---
    let err_upd_desc = conn.execute(
        "UPDATE operating_expenses SET description = 'Tampered description' WHERE id = 101",
        [],
    ).unwrap_err();
    assert!(
        err_upd_desc.to_string().contains("Access Denied: Cannot modify an expense on a locked accounting date."),
        "Trigger must block non-monetary updates on locked dates! Got: {}", err_upd_desc
    );

    // --- ATTACK VECTOR 3: Exploit attempt - change expense_date to an unlocked date ---
    let err_upd_date = conn.execute(
        "UPDATE operating_expenses SET expense_date = '2026-11-09' WHERE id = 101",
        [],
    ).unwrap_err();
    assert!(
        err_upd_date.to_string().contains("Access Denied: Cannot modify an expense on a locked accounting date."),
        "Trigger must block date shifting attacks! Got: {}", err_upd_date
    );

    // --- ATTACK VECTOR 4: Direct SQL DELETE on locked date ---
    let err_del = conn.execute(
        "DELETE FROM operating_expenses WHERE id = 101",
        [],
    ).unwrap_err();
    assert!(
        err_del.to_string().contains("Access Denied: Operating expenses cannot be deleted on a locked accounting date."),
        "Trigger trg_prevent_delete_operating_expense must fire! Got: {}", err_del
    );

    // --- ATTACK VECTOR 5: Direct SQL INSERT of new expense on closed date ---
    let err_ins = conn.execute(
        "INSERT INTO operating_expenses (
            expense_number, expense_date, account_id, account_code,
            amount, amount_paisa, payment_mode, description
         ) VALUES ('EXP-LATE-01', '2026-11-05', 30, 6010, 20.0, 2000, 'CASH', 'Late expense')",
        [],
    ).unwrap_err();
    assert!(
        err_ins.to_string().contains("Access Denied: Cannot record an operating expense on a locked accounting date."),
        "Trigger trg_prevent_insert_locked_operating_expense must fire! Got: {}", err_ins
    );

    // --- ATTACK VECTOR 6: Row-level is_locked = 1 enforcement independent of daily_closings record ---
    // Insert expense on an unclosed date "2026-11-08" with is_locked = 0
    conn.execute(
        "INSERT INTO operating_expenses (
            id, expense_number, expense_date, account_id, account_code,
            amount, amount_paisa, payment_mode, description, is_locked
         ) VALUES (102, 'EXP-ROW-LOCKED', '2026-11-08', 30, 6010, 30.0, 3000, 'CASH', 'Row locked expense', 0)",
        [],
    ).expect("Insert expense row");

    // Lock the row (as happens during daily closing)
    conn.execute(
        "UPDATE operating_expenses SET is_locked = 1 WHERE id = 102",
        [],
    ).expect("Lock expense row");

    // Daily closing for 2026-11-08 does NOT exist, but OLD.is_locked == 1
    let err_row_upd = conn.execute(
        "UPDATE operating_expenses SET amount_paisa = 4000 WHERE id = 102",
        [],
    ).unwrap_err();
    assert!(
        err_row_upd.to_string().contains("Access Denied: Cannot modify an expense on a locked accounting date."),
        "Trigger must enforce row-level is_locked = 1! Got: {}", err_row_upd
    );

    // Attempt to unlock row: UPDATE is_locked = 0
    let err_unlock = conn.execute(
        "UPDATE operating_expenses SET is_locked = 0 WHERE id = 102",
        [],
    ).unwrap_err();
    assert!(
        err_unlock.to_string().contains("Access Denied: Cannot modify an expense on a locked accounting date."),
        "Trigger must reject unlock attempts! Got: {}", err_unlock
    );

    let err_row_del = conn.execute(
        "DELETE FROM operating_expenses WHERE id = 102",
        [],
    ).unwrap_err();
    assert!(
        err_row_del.to_string().contains("Access Denied: Operating expenses cannot be deleted on a locked accounting date."),
        "Trigger must block delete of row-locked expense! Got: {}", err_row_del
    );
}

// ============================================================================
// EMPIRICAL CHALLENGE 2: CUSTOMER RECOVERIES IMMUTABILITY TRIGGERS
// ============================================================================
#[test]
fn test_empirical_sqlite_immutability_triggers_customer_recoveries() {
    let conn = setup_test_db();

    // 1. Seed customer recovery on date "2026-11-04"
    conn.execute(
        "INSERT INTO customer_recoveries (
            id, recovery_number, customer_id, recovery_date, amount_paisa, amount,
            payment_mode, allocation_mode, previous_balance_paisa, new_balance_paisa,
            unallocated_remainder_paisa, is_locked
         ) VALUES (201, 'REC-EMP-01', 1, '2026-11-04', 1500000, 15000.0,
                   'CASH', 'FIFO', 4500000, 3000000, 0, 0)",
        [],
    ).expect("Insert initial recovery");

    // Pre-lock: Verify recovery is mutable before day lock
    conn.execute(
        "UPDATE customer_recoveries SET notes = 'Verified cash collection' WHERE id = 201",
        [],
    ).expect("Normal update must succeed when date is open");

    // 2. Lock the date via daily_closings
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked) VALUES ('2026-11-04', 1)",
        [],
    ).expect("Lock date 2026-11-04");

    // --- ATTACK VECTOR 1: Direct SQL UPDATE to recovery amount_paisa on closed date ---
    let err_upd_amount = conn.execute(
        "UPDATE customer_recoveries SET amount_paisa = 2000000 WHERE id = 201",
        [],
    ).unwrap_err();
    assert!(
        err_upd_amount.to_string().contains("Access Denied: Cannot modify a recovery on a locked accounting date."),
        "Trigger trg_prevent_update_locked_recovery must fire! Got: {}", err_upd_amount
    );

    // --- ATTACK VECTOR 2: Direct SQL UPDATE to notes or unallocated remainder ---
    let err_upd_notes = conn.execute(
        "UPDATE customer_recoveries SET notes = 'Hacked notes', unallocated_remainder_paisa = 5000 WHERE id = 201",
        [],
    ).unwrap_err();
    assert!(
        err_upd_notes.to_string().contains("Access Denied: Cannot modify a recovery on a locked accounting date."),
        "Trigger must block tampering of recovery attributes! Got: {}", err_upd_notes
    );

    // --- ATTACK VECTOR 3: Exploit attempt - change recovery_date to open date ---
    let err_upd_date = conn.execute(
        "UPDATE customer_recoveries SET recovery_date = '2026-11-09' WHERE id = 201",
        [],
    ).unwrap_err();
    assert!(
        err_upd_date.to_string().contains("Access Denied: Cannot modify a recovery on a locked accounting date."),
        "Trigger must block recovery date modification! Got: {}", err_upd_date
    );

    // --- ATTACK VECTOR 4: Direct SQL DELETE on locked date ---
    let err_del = conn.execute(
        "DELETE FROM customer_recoveries WHERE id = 201",
        [],
    ).unwrap_err();
    assert!(
        err_del.to_string().contains("Access Denied: Cannot delete a recovery on a locked accounting date."),
        "Trigger trg_prevent_delete_locked_recovery must fire! Got: {}", err_del
    );

    // --- ATTACK VECTOR 5: Direct SQL INSERT of recovery on closed date ---
    let err_ins = conn.execute(
        "INSERT INTO customer_recoveries (
            recovery_number, customer_id, recovery_date, amount_paisa, amount,
            payment_mode, allocation_mode, previous_balance_paisa, new_balance_paisa
         ) VALUES ('REC-LATE-02', 1, '2026-11-04', 500000, 5000.0, 'CASH', 'FIFO', 3000000, 2500000)",
        [],
    ).unwrap_err();
    assert!(
        err_ins.to_string().contains("Access Denied: Cannot record recovery on a locked accounting date."),
        "Trigger trg_prevent_insert_locked_recovery must fire! Got: {}", err_ins
    );

    // --- ATTACK VECTOR 6: Row-level is_locked = 1 enforcement independent of daily_closings ---
    conn.execute(
        "INSERT INTO customer_recoveries (
            id, recovery_number, customer_id, recovery_date, amount_paisa, amount,
            payment_mode, allocation_mode, previous_balance_paisa, new_balance_paisa, is_locked
         ) VALUES (202, 'REC-ROW-LOCK', 1, '2026-11-08', 500000, 5000.0, 'CASH', 'FIFO', 2500000, 2000000, 1)",
        [],
    ).expect("Insert row-locked recovery");

    let err_row_upd = conn.execute(
        "UPDATE customer_recoveries SET amount_paisa = 600000 WHERE id = 202",
        [],
    ).unwrap_err();
    assert!(
        err_row_upd.to_string().contains("Access Denied: Cannot modify a recovery on a locked accounting date."),
        "Trigger must block update on row-locked recovery! Got: {}", err_row_upd
    );

    // Unlock attempt
    let err_row_unlock = conn.execute(
        "UPDATE customer_recoveries SET is_locked = 0 WHERE id = 202",
        [],
    ).unwrap_err();
    assert!(
        err_row_unlock.to_string().contains("Access Denied: Cannot modify a recovery on a locked accounting date."),
        "Trigger must reject unlocking row! Got: {}", err_row_unlock
    );

    let err_row_del = conn.execute(
        "DELETE FROM customer_recoveries WHERE id = 202",
        [],
    ).unwrap_err();
    assert!(
        err_row_del.to_string().contains("Access Denied: Cannot delete a recovery on a locked accounting date."),
        "Trigger must block delete of row-locked recovery! Got: {}", err_row_del
    );
}

// ============================================================================
// EMPIRICAL CHALLENGE 3: FULL CLOSING CEREMONY & IMMUTABILITY VERIFICATION
// ============================================================================
#[test]
fn test_empirical_closing_ceremony_locking_and_subsequent_tamper_resistance() {
    let mut conn = setup_test_db();
    let closing_date = "2026-11-06";

    // 1. Initial Float: 50,000 PKR (5,000,000 paisa)
    conn.execute(
        "INSERT INTO cash_book (entry_date, transaction_type, cash_in, cash_in_paisa, running_balance_paisa, running_cash_balance)
         VALUES (?1, 'OPENING_FLOAT', 50000, 5000000, 5000000, 50000)",
        params![closing_date],
    ).expect("Set opening float");

    // 2. POS Cash Sale: 10 crates @ 2,400 PKR = 24,000 PKR (2,400,000 paisa)
    let inv = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: Some("INV-CLS-01".into()),
            invoice_date: Some(closing_date.into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 1,
                pack_qty: 10,
                loose_qty: 0,
                unit_price_paisa: Some(240000),
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: Some(2400000),
            crates_issued: Some(10),
            crates_returned: Some(10),
            admin_override_pin: None,
            user_id: Some(1),
        },
    ).expect("Create cash sale");

    // 3. Operating Expense: ₨ 4,000 Fuel Expense (400,000 paisa)
    let exp = AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            expense_date: Some(closing_date.into()),
            account_id: 30, // 6010 Fuel
            amount_paisa: 400000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: Some("Shell Station".into()),
            description: "Delivery van fuel".into(),
            reference_number: Some("EXP-CLS-01".into()),
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    ).expect("Record expense");

    // 4. Customer Recovery: ₨ 10,000 Cash Recovery (1,000,000 paisa)
    // Setup customer balance first
    conn.execute("UPDATE customers SET current_balance_paisa = 2000000 WHERE id = 2", []).expect("Set balance");
    let rec = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 2,
            amount_paisa: 1000000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some(closing_date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Cash recovery before closing".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record recovery");

    // Expected Cash: Opening (5,000,000) + Cash Sale (2,400,000) + Recovery (1,000,000) - Expense (400,000)
    // Expected = 8,000,000 paisa (₨ 80,000)
    let summary = ClosingService::get_daily_summary(&conn, Some(closing_date)).expect("Get summary");
    assert_eq!(summary.expected_closing_cash_paisa, 8000000);

    // 5. Submit Closing with exact ₨ 80,000 (16 * ₨ 5,000 notes = 8,000,000 paisa)
    let mut denoms = empty_denominations();
    denoms.note_5000 = 16;
    assert_eq!(denoms.calculate_total_paisa(), 8000000);

    let closing_res = ClosingService::submit_closing(
        &mut conn,
        SubmitClosingDto {
            closing_date: closing_date.into(),
            physical_denominations: denoms,
            variance_reason: None,
            admin_pin: None,
            user_id: Some(1),
        },
    ).expect("Closing ceremony must succeed without trigger violation");

    assert_eq!(closing_res.variance_type, "BALANCED");
    assert_eq!(closing_res.variance_paisa, 0);

    // 6. Verify daily_closings is locked
    let is_dc_locked: bool = conn
        .query_row("SELECT is_locked FROM daily_closings WHERE closing_date = ?1", params![closing_date], |r| r.get(0))
        .expect("Query daily closing lock");
    assert!(is_dc_locked, "daily_closings record must be marked locked");

    // 7. Verify operating_expenses row is locked
    let (exp_locked, exp_date): (bool, String) = conn
        .query_row("SELECT is_locked, expense_date FROM operating_expenses WHERE id = ?1", params![exp.expense_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .expect("Query expense lock");
    assert!(exp_locked, "Operating expense row must be locked by closing");
    assert_eq!(exp_date, closing_date);

    // 8. Verify customer_recoveries row is locked
    let (rec_locked, rec_date): (bool, String) = conn
        .query_row("SELECT is_locked, recovery_date FROM customer_recoveries WHERE id = ?1", params![rec.recovery_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .expect("Query recovery lock");
    assert!(rec_locked, "Customer recovery row must be locked by closing");
    assert_eq!(rec_date, closing_date);

    // 9. Verify sales_invoices row is locked
    let inv_locked: bool = conn
        .query_row("SELECT is_locked FROM sales_invoices WHERE id = ?1", params![inv.invoice_id], |r| r.get(0))
        .expect("Query invoice lock");
    assert!(inv_locked, "Sales invoice row must be locked by closing");

    // 10. Direct SQLite tamper challenge on closed entities:
    // A. Modify closed operating expense
    let err_exp_upd = conn.execute(
        "UPDATE operating_expenses SET amount_paisa = 100 WHERE id = ?1",
        params![exp.expense_id],
    ).unwrap_err();
    assert!(
        err_exp_upd.to_string().contains("Access Denied: Cannot modify an expense on a locked accounting date."),
        "Trigger trg_prevent_update_locked_operating_expense must block modification! Got: {}", err_exp_upd
    );

    // B. Delete closed operating expense
    let err_exp_del = conn.execute(
        "DELETE FROM operating_expenses WHERE id = ?1",
        params![exp.expense_id],
    ).unwrap_err();
    assert!(
        err_exp_del.to_string().contains("Access Denied: Operating expenses cannot be deleted on a locked accounting date."),
        "Trigger trg_prevent_delete_operating_expense must block deletion! Got: {}", err_exp_del
    );

    // C. Modify closed customer recovery
    let err_rec_upd = conn.execute(
        "UPDATE customer_recoveries SET amount_paisa = 100 WHERE id = ?1",
        params![rec.recovery_id],
    ).unwrap_err();
    assert!(
        err_rec_upd.to_string().contains("Access Denied: Cannot modify a recovery on a locked accounting date."),
        "Trigger trg_prevent_update_locked_recovery must block modification! Got: {}", err_rec_upd
    );

    // D. Delete closed customer recovery
    let err_rec_del = conn.execute(
        "DELETE FROM customer_recoveries WHERE id = ?1",
        params![rec.recovery_id],
    ).unwrap_err();
    assert!(
        err_rec_del.to_string().contains("Access Denied: Cannot delete a recovery on a locked accounting date."),
        "Trigger trg_prevent_delete_locked_recovery must block deletion! Got: {}", err_rec_del
    );

    // E. Double-closing prevention
    let err_reclose = ClosingService::submit_closing(
        &mut conn,
        SubmitClosingDto {
            closing_date: closing_date.into(),
            physical_denominations: empty_denominations(),
            variance_reason: None,
            admin_pin: None,
            user_id: Some(1),
        },
    ).unwrap_err();
    match err_reclose {
        logar_pos_lib::domain::errors::AppError::Validation(msg) => {
            assert!(msg.contains("already finalized"), "Expected already finalized message, got: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }
}

// ============================================================================
// EMPIRICAL CHALLENGE 4: TRIAL BALANCE CONDITIONAL DATE FILTERING & EQUALITY
// ============================================================================
#[test]
fn test_empirical_trial_balance_conditional_filtering_zero_balances_and_equality() {
    let mut conn = setup_test_db();

    // Query active chart of accounts count
    let active_coa_count: usize = conn
        .query_row("SELECT COUNT(*) FROM chart_of_accounts WHERE is_active = 1", [], |r| r.get(0))
        .expect("Query COA count");
    assert!(active_coa_count >= 38, "Chart of accounts must have >= 38 active accounts (found {})", active_coa_count);

    // ------------------------------------------------------------------------
    // Phase 1: Pristine State - Zero Transactions in Database
    // ------------------------------------------------------------------------
    let tb_empty = AccountingService::calculate_trial_balance(&conn, Some("2026-11-01")).expect("TB empty");
    assert_eq!(tb_empty.accounts.len(), active_coa_count, "All active accounts must be returned even with zero transactions");
    assert_eq!(tb_empty.total_debits_paisa, 0);
    assert_eq!(tb_empty.total_credits_paisa, 0);
    assert!(tb_empty.is_balanced);
    for acct in &tb_empty.accounts {
        assert_eq!(acct.total_debit_paisa, 0);
        assert_eq!(acct.total_credit_paisa, 0);
        assert_eq!(acct.net_balance_paisa, 0);
    }

    // ------------------------------------------------------------------------
    // Phase 2: Multi-Date Journal Entries
    // ------------------------------------------------------------------------
    let tx = conn.transaction().expect("Start transaction");

    // Entry 1 on 2026-11-01: Dr 1010 Cash (2) 1,000,000 PKR, Cr 3010 Capital (19) 1,000,000 PKR
    let jv1 = CreateJournalEntryInput {
        entry_date: "2026-11-01".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Owner capital injection".into(),
        lines: vec![
            JournalLineInput { account_id: 2, debit_paisa: 100000000, credit_paisa: 0, line_narration: None, customer_id: None, supplier_id: None },
            JournalLineInput { account_id: 19, debit_paisa: 0, credit_paisa: 100000000, line_narration: None, customer_id: None, supplier_id: None },
        ],
        created_by: Some(1),
    };
    AccountingService::post_journal_entry(&tx, jv1).expect("Post JV 1");

    // Entry 2 on 2026-11-05: Dr 1020 Bank (3) 400,000 PKR, Cr 1010 Cash (2) 400,000 PKR
    let jv2 = CreateJournalEntryInput {
        entry_date: "2026-11-05".into(),
        voucher_type: "TRANSFER".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Deposit cash to bank".into(),
        lines: vec![
            JournalLineInput { account_id: 3, debit_paisa: 40000000, credit_paisa: 0, line_narration: None, customer_id: None, supplier_id: None },
            JournalLineInput { account_id: 2, debit_paisa: 0, credit_paisa: 40000000, line_narration: None, customer_id: None, supplier_id: None },
        ],
        created_by: Some(1),
    };
    AccountingService::post_journal_entry(&tx, jv2).expect("Post JV 2");

    // Entry 3 on 2026-11-10: Dr 6010 Fuel (30) 15,000 PKR, Dr 6020 Maintenance (31) 5,000 PKR, Cr 1010 Cash (2) 20,000 PKR
    let jv3 = CreateJournalEntryInput {
        entry_date: "2026-11-10".into(),
        voucher_type: "EXPENSE".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Operating expenses".into(),
        lines: vec![
            JournalLineInput { account_id: 30, debit_paisa: 1500000, credit_paisa: 0, line_narration: None, customer_id: None, supplier_id: None },
            JournalLineInput { account_id: 31, debit_paisa: 500000, credit_paisa: 0, line_narration: None, customer_id: None, supplier_id: None },
            JournalLineInput { account_id: 2, debit_paisa: 0, credit_paisa: 2000000, line_narration: None, customer_id: None, supplier_id: None },
        ],
        created_by: Some(1),
    };
    AccountingService::post_journal_entry(&tx, jv3).expect("Post JV 3");

    // Entry 4 on 2026-11-20 (FUTURE ENTRY): Dr 1010 Cash (2) 50,000 PKR, Cr 1200 Receivable (8) 50,000 PKR
    let jv4 = CreateJournalEntryInput {
        entry_date: "2026-11-20".into(),
        voucher_type: "RECEIPT".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Future customer debt collection".into(),
        lines: vec![
            JournalLineInput { account_id: 2, debit_paisa: 5000000, credit_paisa: 0, line_narration: None, customer_id: None, supplier_id: None },
            JournalLineInput { account_id: 8, debit_paisa: 0, credit_paisa: 5000000, line_narration: None, customer_id: Some(1), supplier_id: None },
        ],
        created_by: Some(1),
    };
    AccountingService::post_journal_entry(&tx, jv4).expect("Post JV 4");

    tx.commit().expect("Commit JVs");

    // ------------------------------------------------------------------------
    // Verification Cut A: as_of_date = "2026-10-31" (Prior to all entries)
    // ------------------------------------------------------------------------
    let tb_a = AccountingService::calculate_trial_balance(&conn, Some("2026-10-31")).expect("TB Cut A");
    assert_eq!(tb_a.accounts.len(), active_coa_count);
    assert_eq!(tb_a.total_debits_paisa, 0);
    assert_eq!(tb_a.total_credits_paisa, 0);
    assert!(tb_a.is_balanced);

    // ------------------------------------------------------------------------
    // Verification Cut B: as_of_date = "2026-11-01" (Only JV 1 included)
    // ------------------------------------------------------------------------
    let tb_b = AccountingService::calculate_trial_balance(&conn, Some("2026-11-01")).expect("TB Cut B");
    assert_eq!(tb_b.accounts.len(), active_coa_count);
    assert_eq!(tb_b.total_debits_paisa, 100000000);
    assert_eq!(tb_b.total_credits_paisa, 100000000);
    assert!(tb_b.is_balanced);

    let cash_b = tb_b.accounts.iter().find(|a| a.account_code == 1010).unwrap();
    assert_eq!(cash_b.total_debit_paisa, 100000000);
    assert_eq!(cash_b.total_credit_paisa, 0, "Nov 5 and Nov 10 cash credits must be strictly excluded!");
    assert_eq!(cash_b.net_balance_paisa, 100000000);
    assert_eq!(cash_b.balance_type, "DEBIT");

    let bank_b = tb_b.accounts.iter().find(|a| a.account_code == 1020).unwrap();
    assert_eq!(bank_b.total_debit_paisa, 0, "Nov 5 bank debit must be strictly excluded!");
    assert_eq!(bank_b.net_balance_paisa, 0);

    // ------------------------------------------------------------------------
    // Verification Cut C: as_of_date = "2026-11-05" (JV 1 and JV 2 included)
    // ------------------------------------------------------------------------
    let tb_c = AccountingService::calculate_trial_balance(&conn, Some("2026-11-05")).expect("TB Cut C");
    assert_eq!(tb_c.accounts.len(), active_coa_count);
    // JV 1 (100M) + JV 2 (40M) = 140M
    assert_eq!(tb_c.total_debits_paisa, 140000000);
    assert_eq!(tb_c.total_credits_paisa, 140000000);
    assert!(tb_c.is_balanced);

    let cash_c = tb_c.accounts.iter().find(|a| a.account_code == 1010).unwrap();
    assert_eq!(cash_c.total_debit_paisa, 100000000);
    assert_eq!(cash_c.total_credit_paisa, 40000000);
    assert_eq!(cash_c.net_balance_paisa, 60000000);
    assert_eq!(cash_c.balance_type, "DEBIT");

    let bank_c = tb_c.accounts.iter().find(|a| a.account_code == 1020).unwrap();
    assert_eq!(bank_c.total_debit_paisa, 40000000);
    assert_eq!(bank_c.total_credit_paisa, 0);
    assert_eq!(bank_c.net_balance_paisa, 40000000);
    assert_eq!(bank_c.balance_type, "DEBIT");

    // Accounts with transactions only in future (e.g. 6010 Fuel on Nov 10) must remain 0
    let fuel_c = tb_c.accounts.iter().find(|a| a.account_code == 6010).unwrap();
    assert_eq!(fuel_c.total_debit_paisa, 0);
    assert_eq!(fuel_c.total_credit_paisa, 0);

    // ------------------------------------------------------------------------
    // Verification Cut D: as_of_date = "2026-11-15" (JV 1, 2, 3 included; Future JV 4 excluded)
    // ------------------------------------------------------------------------
    let tb_d = AccountingService::calculate_trial_balance(&conn, Some("2026-11-15")).expect("TB Cut D");
    assert_eq!(tb_d.accounts.len(), active_coa_count);
    // JV 1 (100M) + JV 2 (40M) + JV 3 (2M) = 142M
    assert_eq!(tb_d.total_debits_paisa, 142000000);
    assert_eq!(tb_d.total_credits_paisa, 142000000);
    assert!(tb_d.is_balanced);

    // Future JV 4 (5M on Nov 20) must NOT have touched Cash or Receivable
    let cash_d = tb_d.accounts.iter().find(|a| a.account_code == 1010).unwrap();
    assert_eq!(cash_d.total_debit_paisa, 100000000); // 5M future debit NOT leaked
    assert_eq!(cash_d.total_credit_paisa, 42000000); // 40M + 2M
    assert_eq!(cash_d.net_balance_paisa, 58000000);

    let recv_d = tb_d.accounts.iter().find(|a| a.account_code == 1200).unwrap();
    assert_eq!(recv_d.total_credit_paisa, 0); // 5M future credit NOT leaked

    // ------------------------------------------------------------------------
    // Verification Cut E: as_of_date = "2026-11-30" (All JVs 1, 2, 3, 4 included)
    // ------------------------------------------------------------------------
    let tb_e = AccountingService::calculate_trial_balance(&conn, Some("2026-11-30")).expect("TB Cut E");
    assert_eq!(tb_e.accounts.len(), active_coa_count);
    // 142M + 5M = 147M
    assert_eq!(tb_e.total_debits_paisa, 147000000);
    assert_eq!(tb_e.total_credits_paisa, 147000000);
    assert!(tb_e.is_balanced);

    let cash_e = tb_e.accounts.iter().find(|a| a.account_code == 1010).unwrap();
    assert_eq!(cash_e.total_debit_paisa, 105000000); // 100M + 5M
    assert_eq!(cash_e.total_credit_paisa, 42000000);

    let recv_e = tb_e.accounts.iter().find(|a| a.account_code == 1200).unwrap();
    assert_eq!(recv_e.total_credit_paisa, 5000000);
}

// ============================================================================
// EMPIRICAL CHALLENGE 5: PROFIT & LOSS SALES RETURN DEDUCTION INVARIANTS
// ============================================================================
#[test]
fn test_empirical_pnl_sales_returns_deductions_and_boundary_cases() {
    let conn = setup_test_db();
    let p_start = "2026-11-01";
    let p_end = "2026-11-30";

    // 1. Create Sales Invoices in Period:
    // Invoice 1 (2026-11-05): Gross 50,000 PKR, Discount 5,000 PKR -> Net 45,000 PKR
    conn.execute(
        "INSERT INTO sales_invoices (
            id, invoice_number, customer_id, invoice_date, due_date,
            subtotal_paisa, discount_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            status, is_cancelled, payment_type
         ) VALUES (501, 'INV-PNL-RET-01', 1, '2026-11-05', '2026-11-05',
                   5000000, 500000, 4500000, 4500000, 0, 'PAID', 0, 'CASH')",
        [],
    ).expect("Insert invoice 1");

    // Add COGS item for Invoice 1: 30,000 PKR (3,000,000 paisa)
    conn.execute(
        "INSERT INTO sales_invoice_items (
            invoice_id, product_id, unit_chosen, pack_qty, loose_qty, total_base_units, unit_price_paisa,
            line_total_paisa, cogs_unit_cost_paisa, cogs_total_paisa
         ) VALUES (501, 1, 'PACK', 20, 0, 480, 250000, 5000000, 150000, 3000000)",
        [],
    ).expect("Insert invoice item");

    // Invoice 2 (2026-11-12): Gross 30,000 PKR, Discount 0 -> Net 30,000 PKR
    conn.execute(
        "INSERT INTO sales_invoices (
            id, invoice_number, customer_id, invoice_date, due_date,
            subtotal_paisa, discount_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            status, is_cancelled, payment_type
         ) VALUES (502, 'INV-PNL-RET-02', 2, '2026-11-12', '2026-11-12',
                   3000000, 0, 3000000, 0, 3000000, 'UNPAID', 0, 'CREDIT')",
        [],
    ).expect("Insert invoice 2");

    // Add COGS item for Invoice 2: 18,000 PKR (1,800,000 paisa)
    conn.execute(
        "INSERT INTO sales_invoice_items (
            invoice_id, product_id, unit_chosen, pack_qty, loose_qty, total_base_units, unit_price_paisa,
            line_total_paisa, cogs_unit_cost_paisa, cogs_total_paisa
         ) VALUES (502, 1, 'PACK', 12, 0, 288, 250000, 3000000, 150000, 1800000)",
        [],
    ).expect("Insert invoice 2 item");

    // Baseline check before any sales returns:
    // Gross: 5,000,000 + 3,000,000 = 8,000,000 paisa (₨ 80,000)
    // Discount: 500,000 paisa (₨ 5,000)
    // Returns: 0
    // Net Sales Revenue: 7,500,000 paisa (₨ 75,000)
    // COGS: 3,000,000 + 1,800,000 = 4,800,000 paisa (₨ 48,000)
    // Gross Profit: 7,500,000 - 4,800,000 = 2,700,000 paisa (₨ 27,000)
    let pnl_baseline = AccountingService::calculate_profit_and_loss(&conn, p_start, p_end).expect("P&L baseline");
    assert_eq!(pnl_baseline.revenue.gross_sales_paisa, 8000000);
    assert_eq!(pnl_baseline.revenue.total_discounts_paisa, 500000);
    assert_eq!(pnl_baseline.revenue.total_sales_returns_paisa, 0);
    assert_eq!(pnl_baseline.revenue.net_sales_revenue_paisa, 7500000);
    assert_eq!(pnl_baseline.cogs.total_cogs_paisa, 4800000);
    assert_eq!(pnl_baseline.gross_profit_paisa, 2700000);

    // 2. Insert Approved Sales Returns:
    // Return 1: ₨ 8,000 (800,000 paisa) on 2026-11-06 (in period)
    conn.execute(
        "INSERT INTO sales_returns (
            id, return_number, invoice_id, customer_id, return_date,
            total_return_paisa, refund_mode, reason, status, is_cancelled
         ) VALUES (601, 'RET-01', 501, 1, '2026-11-06', 800000, 'CASH', 'Spoiled bottles', 'APPROVED', 0)",
        [],
    ).expect("Insert return 1");

    // Return 2: ₨ 4,000 (400,000 paisa) on 2026-11-15 (in period)
    conn.execute(
        "INSERT INTO sales_returns (
            id, return_number, invoice_id, customer_id, return_date,
            total_return_paisa, refund_mode, reason, status, is_cancelled
         ) VALUES (602, 'RET-02', 502, 2, '2026-11-15', 400000, 'CREDIT_NOTE', 'Transit damage', 'APPROVED', 0)",
        [],
    ).expect("Insert return 2");

    // 3. Insert Boundary & Cancelled Returns that MUST BE EXCLUDED:
    // Return 3: Prior to period (2026-10-31) - ₨ 5,000
    conn.execute(
        "INSERT INTO sales_returns (
            id, return_number, invoice_id, customer_id, return_date,
            total_return_paisa, refund_mode, reason, status, is_cancelled
         ) VALUES (603, 'RET-PRIOR', 501, 1, '2026-10-31', 500000, 'CASH', 'Old return', 'APPROVED', 0)",
        [],
    ).expect("Insert prior return");

    // Return 4: Future / Past end of period (2026-12-05) - ₨ 6,000
    conn.execute(
        "INSERT INTO sales_returns (
            id, return_number, invoice_id, customer_id, return_date,
            total_return_paisa, refund_mode, reason, status, is_cancelled
         ) VALUES (604, 'RET-FUTURE', 501, 1, '2026-12-05', 600000, 'CASH', 'Next month return', 'APPROVED', 0)",
        [],
    ).expect("Insert future return");

    // Return 5: In period (2026-11-10) but status = 'CANCELLED' - ₨ 7,000
    conn.execute(
        "INSERT INTO sales_returns (
            id, return_number, invoice_id, customer_id, return_date,
            total_return_paisa, refund_mode, reason, status, is_cancelled
         ) VALUES (605, 'RET-CANCEL-1', 501, 1, '2026-11-10', 700000, 'CASH', 'Rejected return', 'CANCELLED', 0)",
        [],
    ).expect("Insert cancelled status return");

    // Return 6: In period (2026-11-11) but is_cancelled = 1 - ₨ 3,500
    conn.execute(
        "INSERT INTO sales_returns (
            id, return_number, invoice_id, customer_id, return_date,
            total_return_paisa, refund_mode, reason, status, is_cancelled
         ) VALUES (606, 'RET-CANCEL-2', 501, 1, '2026-11-11', 350000, 'CASH', 'Voided return', 'APPROVED', 1)",
        [],
    ).expect("Insert is_cancelled return");

    // 4. Calculate P&L for November
    let pnl = AccountingService::calculate_profit_and_loss(&conn, p_start, p_end).expect("Calculate P&L with returns");

    // Verified Expectations:
    // Only Return 1 (800,000) and Return 2 (400,000) are valid!
    // Total Sales Returns in period = 800,000 + 400,000 = 1,200,000 paisa (₨ 12,000)
    assert_eq!(pnl.revenue.gross_sales_paisa, 8000000);
    assert_eq!(pnl.revenue.total_discounts_paisa, 500000);
    assert_eq!(pnl.revenue.total_sales_returns_paisa, 1200000, "Must include only valid in-period non-cancelled returns");

    // Net Sales Revenue: 8,000,000 - 500,000 - 1,200,000 = 6,300,000 paisa (₨ 63,000)
    assert_eq!(pnl.revenue.net_sales_revenue_paisa, 6300000);
    assert_eq!(pnl.revenue.total_operating_revenue_paisa, 6300000);

    // Gross Profit: Total Operating Revenue (6,300,000) - COGS (4,800,000) = 1,500,000 paisa (₨ 15,000)
    assert_eq!(pnl.gross_profit_paisa, 1500000);
    let expected_margin = (1500000.0 / 6300000.0) * 100.0;
    assert!((pnl.gross_margin_percent - expected_margin).abs() < 0.001);

    // 5. Heavy Returns Boundary Test (Returns exceeding sales)
    // Add Return 7: ₨ 70,000 (7,000,000 paisa) on 2026-11-20
    conn.execute(
        "INSERT INTO sales_returns (
            id, return_number, invoice_id, customer_id, return_date,
            total_return_paisa, refund_mode, reason, status, is_cancelled
         ) VALUES (607, 'RET-HEAVY', 501, 1, '2026-11-20', 7000000, 'CASH', 'Mass recall', 'APPROVED', 0)",
        [],
    ).expect("Insert heavy return");

    let pnl_heavy = AccountingService::calculate_profit_and_loss(&conn, p_start, p_end).expect("Calculate P&L heavy returns");
    // Total Returns = 1,200,000 + 7,000,000 = 8,200,000 paisa
    // Net Revenue = 8,000,000 - 500,000 - 8,200,000 = -700,000 paisa (-₨ 7,000)
    assert_eq!(pnl_heavy.revenue.total_sales_returns_paisa, 8200000);
    assert_eq!(pnl_heavy.revenue.net_sales_revenue_paisa, -700000);
    assert_eq!(pnl_heavy.revenue.total_operating_revenue_paisa, -700000);
    // Gross Profit = -700,000 - 4,800,000 = -5,500,000 paisa
    assert_eq!(pnl_heavy.gross_profit_paisa, -5500000);
    // Margin percent handles negative revenue gracefully (defaults to 0.0)
    assert_eq!(pnl_heavy.gross_margin_percent, 0.0);
}
