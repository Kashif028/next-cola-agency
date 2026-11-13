use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::dtos::*;
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::services::accounting::*;
use rusqlite::{params, Connection};

fn setup_test_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations");
    conn
}

// ============================================================================
// TEST 1: BALANCED DOUBLE-ENTRY INVARIANT & UNBALANCED REJECTION
// ============================================================================
#[test]
fn test_double_entry_balanced_jv_enforcement_and_unbalanced_rejection() {
    let mut conn = setup_test_db();
    let tx = conn.transaction().expect("Start transaction");

    // Case 1: Valid Balanced Journal Entry (Dr 1010 Cash 5,000 PKR, Cr 1200 Receivable 5,000 PKR)
    let valid_input = CreateJournalEntryInput {
        entry_date: "2026-11-05".into(),
        voucher_type: "RECEIPT".into(),
        reference_doc_type: Some("MANUAL".into()),
        reference_doc_id: None,
        narration: "Balanced test receipt".into(),
        lines: vec![
            JournalLineInput {
                account_id: 2, // 1010 Cash
                debit_paisa: 500000,
                credit_paisa: 0,
                line_narration: Some("Debit cash".into()),
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 8, // 1200 Receivable
                debit_paisa: 0,
                credit_paisa: 500000,
                line_narration: Some("Credit receivable".into()),
                customer_id: Some(1),
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };

    let jv_id = AccountingService::post_journal_entry(&tx, valid_input).expect("Post valid balanced JV");
    assert!(jv_id > 0);

    // Verify lines inserted
    let (dr_sum, cr_sum): (i64, i64) = tx
        .query_row(
            "SELECT SUM(debit_paisa), SUM(credit_paisa) FROM journal_lines WHERE entry_id = ?1",
            params![jv_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query JV sums");
    assert_eq!(dr_sum, 500000);
    assert_eq!(cr_sum, 500000);

    // Case 2: Unbalanced Journal Entry (Dr 5,000 != Cr 3,000) MUST BE REJECTED
    let unbalanced_input = CreateJournalEntryInput {
        entry_date: "2026-11-05".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Unbalanced test".into(),
        lines: vec![
            JournalLineInput {
                account_id: 2,
                debit_paisa: 500000,
                credit_paisa: 0,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 8,
                debit_paisa: 0,
                credit_paisa: 300000, // Discrepancy of 2,000 PKR!
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };

    let err = AccountingService::post_journal_entry(&tx, unbalanced_input).unwrap_err();
    match err {
        AppError::Validation(msg) => {
            assert!(msg.contains("Unbalanced journal entry rejected"));
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // Case 3: Empty Lines MUST BE REJECTED
    let empty_input = CreateJournalEntryInput {
        entry_date: "2026-11-05".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Empty test".into(),
        lines: vec![],
        created_by: Some(1),
    };
    let err2 = AccountingService::post_journal_entry(&tx, empty_input).unwrap_err();
    match err2 {
        AppError::Validation(msg) => assert!(msg.contains("empty")),
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // Case 4: Non-existent Account ID MUST BE REJECTED
    let non_existent_account_input = CreateJournalEntryInput {
        entry_date: "2026-11-05".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Invalid account test".into(),
        lines: vec![
            JournalLineInput {
                account_id: 9999, // Non-existent!
                debit_paisa: 100000,
                credit_paisa: 0,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 2,
                debit_paisa: 0,
                credit_paisa: 100000,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };
    let err3 = AccountingService::post_journal_entry(&tx, non_existent_account_input).unwrap_err();
    match err3 {
        AppError::Validation(msg) => assert!(msg.contains("not found in Chart of Accounts")),
        other => panic!("Expected Validation error, got: {:?}", other),
    }
}

// ============================================================================
// TEST 2: CUSTOMER LEDGER STATEMENT & DATE FILTERING WITH OPENING BALANCE
// ============================================================================
#[test]
fn test_customer_ledger_statement_and_date_filtering() {
    let conn = setup_test_db();

    // Setup: Customer 1 (Bismillah Kiryana Store)
    // Clear any previous entries
    conn.execute("DELETE FROM customer_ledger WHERE customer_id = 1", []).expect("Clean ledger");
    conn.execute("UPDATE customers SET current_balance_paisa = 0, current_balance = 0 WHERE id = 1", []).expect("Reset balance");

    // Insert historical transactions:
    // 2026-11-01: Debit 10,000 PKR (1,000,000 paisa) - Invoice 1
    // 2026-11-03: Debit 15,000 PKR (1,500,000 paisa) - Invoice 2
    // 2026-11-05: Credit 8,000 PKR (800,000 paisa)   - Recovery 1
    // 2026-11-07: Debit 20,000 PKR (2,000,000 paisa) - Invoice 3
    // 2026-11-10: Credit 12,000 PKR (1,200,000 paisa) - Recovery 2

    let txns = vec![
        ("2026-11-01", "SALE", "INV-01", 1000000i64, 0i64),
        ("2026-11-03", "SALE", "INV-02", 1500000i64, 0i64),
        ("2026-11-05", "PAYMENT", "REC-01", 0i64, 800000i64),
        ("2026-11-07", "SALE", "INV-03", 2000000i64, 0i64),
        ("2026-11-10", "PAYMENT", "REC-02", 0i64, 1200000i64),
    ];

    let mut running = 0i64;
    for (dt, v_type, v_num, dp, cp) in txns {
        running = running + dp - cp;
        conn.execute(
            "INSERT INTO customer_ledger (
                customer_id, entry_date, voucher_type, voucher_number, description,
                debit, credit, debit_paisa, credit_paisa, running_balance, running_balance_paisa
             ) VALUES (1, ?1, ?2, ?3, 'Test ledger entry', ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                dt, v_type, v_num,
                dp / 100, cp / 100, dp, cp,
                running / 100, running
            ],
        ).expect("Insert ledger row");
    }

    conn.execute("UPDATE customers SET current_balance_paisa = ?1, current_balance = ?2 WHERE id = 1", params![running, running / 100]).expect("Update balance");

    // Query entire statement (no date filters)
    let full_statement = AccountingService::get_customer_ledger(&conn, 1, None, None).expect("Query full statement");
    assert_eq!(full_statement.opening_balance_paisa, 0);
    assert_eq!(full_statement.entries.len(), 5);
    assert_eq!(full_statement.total_debit_paisa, 4500000); // ₨ 45,000
    assert_eq!(full_statement.total_credit_paisa, 2000000); // ₨ 20,000
    assert_eq!(full_statement.closing_balance_paisa, 2500000); // ₨ 25,000

    // Query date-filtered statement: 2026-11-05 to 2026-11-08
    // Prior to 2026-11-05: 2026-11-01 (10,000) + 2026-11-03 (15,000) = 25,000 PKR opening balance
    let filtered_stmt = AccountingService::get_customer_ledger(&conn, 1, Some("2026-11-05"), Some("2026-11-08")).expect("Query filtered statement");
    assert_eq!(filtered_stmt.opening_balance_paisa, 2500000); // ₨ 25,000
    assert_eq!(filtered_stmt.entries.len(), 2); // 2026-11-05 and 2026-11-07
    assert_eq!(filtered_stmt.entries[0].credit_paisa, 800000);
    assert_eq!(filtered_stmt.entries[0].running_balance_paisa, 1700000); // 25,000 - 8,000 = 17,000
    assert_eq!(filtered_stmt.entries[1].debit_paisa, 2000000);
    assert_eq!(filtered_stmt.entries[1].running_balance_paisa, 3700000); // 17,000 + 20,000 = 37,000
    assert_eq!(filtered_stmt.total_debit_paisa, 2000000);
    assert_eq!(filtered_stmt.total_credit_paisa, 800000);
    assert_eq!(filtered_stmt.closing_balance_paisa, 3700000);
}

// ============================================================================
// TEST 3: SUPPLIER LEDGER STATEMENT & OPENING PAYABLE
// ============================================================================
#[test]
fn test_supplier_ledger_statement_and_opening_payable() {
    let conn = setup_test_db();

    conn.execute("DELETE FROM supplier_ledger WHERE supplier_id = 1", []).expect("Clean supplier ledger");

    // Historical entries:
    // 2026-11-01: Purchase Credit 100,000 PKR (payable increases)
    // 2026-11-03: Cash Payment Debit 40,000 PKR (payable decreases)
    // 2026-11-06: Purchase Credit 60,000 PKR (payable increases)

    let txns = vec![
        ("2026-11-01", "PURCHASE", 0i64, 10000000i64),
        ("2026-11-03", "CASH_PAYMENT", 4000000i64, 0i64),
        ("2026-11-06", "PURCHASE", 0i64, 6000000i64),
    ];

    let mut running = 0i64;
    for (dt, v_type, dp, cp) in txns {
        running = running + cp - dp;
        conn.execute(
            "INSERT INTO supplier_ledger (
                supplier_id, entry_date, voucher_type, voucher_number, description,
                debit, credit, debit_paisa, credit_paisa, running_balance, running_balance_paisa
             ) VALUES (1, ?1, ?2, 'V-TEST', 'Supplier consignment entry', ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                dt, v_type,
                dp / 100, cp / 100, dp, cp,
                running / 100, running
            ],
        ).expect("Insert supplier ledger row");
    }

    conn.execute("UPDATE suppliers SET current_payable_paisa = ?1, current_payable = ?2 WHERE id = 1", params![running, running / 100]).expect("Update supplier payable");

    // Filter from 2026-11-04
    // Prior payable: 100,000 - 40,000 = 60,000 PKR (6,000,000 paisa)
    let stmt = AccountingService::get_supplier_ledger(&conn, 1, Some("2026-11-04"), None).expect("Query supplier statement");
    assert_eq!(stmt.opening_payable_paisa, 6000000);
    assert_eq!(stmt.entries.len(), 1);
    assert_eq!(stmt.entries[0].credit_paisa, 6000000);
    assert_eq!(stmt.entries[0].running_balance_paisa, 12000000);
    assert_eq!(stmt.closing_payable_paisa, 12000000);
}

// ============================================================================
// TEST 4: 5-BUCKET UDHAAR AGING & BOUNDARY TESTS
// ============================================================================
#[test]
fn test_udhaar_aging_5_buckets_boundary_exact_days() {
    let conn = setup_test_db();

    // As of date: 2026-11-15
    // Invoice 1: 2026-11-11 (4 days old) -> Bucket 0-7 (5,000 PKR)
    // Invoice 2: 2026-11-03 (12 days old) -> Bucket 8-15 (7,500 PKR)
    // Invoice 3: 2026-10-21 (25 days old) -> Bucket 16-30 (12,000 PKR)
    // Invoice 4: 2026-10-01 (45 days old) -> Bucket 31-60 (15,000 PKR)
    // Invoice 5: 2026-08-30 (77 days old) -> Bucket 60+ (20,000 PKR)

    conn.execute("DELETE FROM sales_invoices WHERE customer_id = 1", []).expect("Clear test invoices");

    let invs = vec![
        ("INV-AG-01", "2026-11-11", 500000i64),
        ("INV-AG-02", "2026-11-03", 750000i64),
        ("INV-AG-03", "2026-10-21", 1200000i64),
        ("INV-AG-04", "2026-10-01", 1500000i64),
        ("INV-AG-05", "2026-08-30", 2000000i64),
    ];

    for (num, dt, due) in invs {
        conn.execute(
            "INSERT INTO sales_invoices (
                invoice_number, customer_id, invoice_date, due_date,
                subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
                status, is_cancelled, payment_type
             ) VALUES (?1, 1, ?2, ?2, ?3, ?3, 0, ?3, 'UNPAID', 0, 'CREDIT')",
            params![num, dt, due],
        ).expect("Insert test invoice");
    }

    let aging = AccountingService::calculate_customer_aging(&conn, 1, Some("2026-11-15")).expect("Calculate aging");
    assert_eq!(aging.bucket_0_7_paisa, 500000);   // ₨ 5,000
    assert_eq!(aging.bucket_8_15_paisa, 750000);  // ₨ 7,500
    assert_eq!(aging.bucket_16_30_paisa, 1200000); // ₨ 12,000
    assert_eq!(aging.bucket_31_60_paisa, 1500000); // ₨ 15,000
    assert_eq!(aging.bucket_60_plus_paisa, 2000000); // ₨ 20,000
    assert_eq!(aging.total_outstanding_paisa, 5950000); // ₨ 59,500

    // Exact boundary assertions:
    // 7 days old -> Bucket 0-7
    // 8 days old -> Bucket 8-15
    // 15 days old -> Bucket 8-15
    // 16 days old -> Bucket 16-30
    // 30 days old -> Bucket 16-30
    // 31 days old -> Bucket 31-60
    // 60 days old -> Bucket 31-60
    // 61 days old -> Bucket 60+
    conn.execute("DELETE FROM sales_invoices WHERE customer_id = 1", []).expect("Clear test invoices");

    let boundary_invs = vec![
        ("B-7", "2026-11-08", 100000i64),  // Exactly 7 days (15 - 8 = 7)
        ("B-8", "2026-11-07", 200000i64),  // Exactly 8 days (15 - 7 = 8)
        ("B-15", "2026-10-31", 300000i64), // Exactly 15 days (15 - (-0) = 15)
        ("B-16", "2026-10-30", 400000i64), // Exactly 16 days
        ("B-30", "2026-10-16", 500000i64), // Exactly 30 days
        ("B-31", "2026-10-15", 600000i64), // Exactly 31 days
        ("B-60", "2026-09-16", 700000i64), // Exactly 60 days
        ("B-61", "2026-09-15", 800000i64), // Exactly 61 days
    ];

    for (num, dt, due) in boundary_invs {
        conn.execute(
            "INSERT INTO sales_invoices (
                invoice_number, customer_id, invoice_date, due_date,
                subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
                status, is_cancelled, payment_type
             ) VALUES (?1, 1, ?2, ?2, ?3, ?3, 0, ?3, 'UNPAID', 0, 'CREDIT')",
            params![num, dt, due],
        ).expect("Insert boundary invoice");
    }

    let b_aging = AccountingService::calculate_customer_aging(&conn, 1, Some("2026-11-15")).expect("Calculate boundary aging");
    assert_eq!(b_aging.bucket_0_7_paisa, 100000);   // B-7
    assert_eq!(b_aging.bucket_8_15_paisa, 500000);  // B-8 (200,000) + B-15 (300,000)
    assert_eq!(b_aging.bucket_16_30_paisa, 900000); // B-16 (400,000) + B-30 (500,000)
    assert_eq!(b_aging.bucket_31_60_paisa, 1300000); // B-31 (600,000) + B-60 (700,000)
    assert_eq!(b_aging.bucket_60_plus_paisa, 800000); // B-61 (800,000)
}

// ============================================================================
// TEST 5: CUSTOMER RECOVERIES (MODES A, B, C) & WASOOLI RASEED
// ============================================================================
#[test]
fn test_customer_recovery_modes_and_wasooli_raseed() {
    let mut conn = setup_test_db();

    // Setup customer 1 with 45,000 PKR balance and 3 open invoices
    conn.execute("DELETE FROM sales_invoices WHERE customer_id = 1", []).expect("Clean invoices");
    conn.execute("UPDATE customers SET current_balance_paisa = 4500000, current_balance = 45000 WHERE id = 1", []).expect("Set customer balance");

    conn.execute(
        "INSERT INTO sales_invoices (id, invoice_number, customer_id, invoice_date, due_date, payment_type, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa, status, is_cancelled)
         VALUES (101, 'INV-A', 1, '2026-11-01', '2026-11-01', 'CREDIT', 1000000, 1000000, 0, 1000000, 'UNPAID', 0)",
        [],
    ).expect("Insert Inv A");

    conn.execute(
        "INSERT INTO sales_invoices (id, invoice_number, customer_id, invoice_date, due_date, payment_type, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa, status, is_cancelled)
         VALUES (102, 'INV-B', 1, '2026-11-02', '2026-11-02', 'CREDIT', 1500000, 1500000, 0, 1500000, 'UNPAID', 0)",
        [],
    ).expect("Insert Inv B");

    conn.execute(
        "INSERT INTO sales_invoices (id, invoice_number, customer_id, invoice_date, due_date, payment_type, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa, status, is_cancelled)
         VALUES (103, 'INV-C', 1, '2026-11-03', '2026-11-03', 'CREDIT', 2000000, 2000000, 0, 2000000, 'UNPAID', 0)",
        [],
    ).expect("Insert Inv C");

    // 1. MODE A: Specific Bill Allocation
    // Pay 12,000 PKR (1,200,000 paisa) against Inv A (10,000) and Inv B (15,000)
    // Inv A should be 100% cleared (PAID), Inv B should have 2,000 knocked off (PARTIAL, 13,000 remaining due)
    let recovery_a = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 1200000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("SPECIFIC".into()),
            payment_date: Some("2026-11-05".into()),
            target_invoice_ids: Some(vec![101, 102]),
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Specific knock-off".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record Mode A recovery");

    assert_eq!(recovery_a.previous_balance_paisa, 4500000);
    assert_eq!(recovery_a.new_balance_paisa, 3300000); // 45,000 - 12,000 = 33,000
    assert_eq!(recovery_a.allocations.len(), 2);
    assert_eq!(recovery_a.allocations[0].invoice_id, 101);
    assert_eq!(recovery_a.allocations[0].allocated_paisa, 1000000);
    assert_eq!(recovery_a.allocations[0].new_status, "PAID");
    assert_eq!(recovery_a.allocations[1].invoice_id, 102);
    assert_eq!(recovery_a.allocations[1].allocated_paisa, 200000);
    assert_eq!(recovery_a.allocations[1].remaining_due_paisa, 1300000);
    assert_eq!(recovery_a.allocations[1].new_status, "PARTIAL");

    // Wasooli Raseed verification
    assert!(recovery_a.formatted_thermal_receipt.contains("WASOOLI RASEED"));
    assert!(recovery_a.formatted_thermal_receipt.contains("INV-A"));
    assert!(recovery_a.formatted_thermal_receipt.contains("12000.00"));

    // Verify Cash Book incremented
    let last_cash_in: i64 = conn
        .query_row(
            "SELECT cash_in_paisa FROM cash_book WHERE transaction_type = 'CUSTOMER_RECOVERY' ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .expect("Query cash book recovery");
    assert_eq!(last_cash_in, 1200000);

    // 2. MODE B: FIFO Allocation via Bank
    // Pay 15,000 PKR (1,500,000 paisa) via BANK
    // Oldest open invoice is Inv B (13,000 remaining due), then Inv C (receives 2,000)
    let prev_bank_balance: i64 = conn
        .query_row("SELECT current_balance_paisa FROM bank_accounts WHERE id = 1", [], |r| r.get(0))
        .expect("Query bank balance");

    let recovery_b = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 1500000,
            payment_mode: "BANK".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some("2026-11-06".into()),
            target_invoice_ids: None,
            bank_account_id: Some(1),
            bank_name: Some("Meezan Bank Limited".into()),
            instrument_number: Some("RAAST-98321".into()),
            instrument_date: None,
            notes: Some("FIFO Raast recovery".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record Mode B recovery");

    assert_eq!(recovery_b.new_balance_paisa, 1800000); // 33,000 - 15,000 = 18,000
    assert_eq!(recovery_b.allocations.len(), 2);
    assert_eq!(recovery_b.allocations[0].invoice_id, 102);
    assert_eq!(recovery_b.allocations[0].allocated_paisa, 1300000);
    assert_eq!(recovery_b.allocations[0].new_status, "PAID");
    assert_eq!(recovery_b.allocations[1].invoice_id, 103);
    assert_eq!(recovery_b.allocations[1].allocated_paisa, 200000);
    assert_eq!(recovery_b.allocations[1].remaining_due_paisa, 1800000);

    // Bank Account updated, Cash Book NOT touched
    let new_bank_balance: i64 = conn
        .query_row("SELECT current_balance_paisa FROM bank_accounts WHERE id = 1", [], |r| r.get(0))
        .expect("Query bank balance");
    assert_eq!(new_bank_balance, prev_bank_balance + 1500000);

    // 3. MODE C: On-Account with Overpayment (Creates Advance Credit)
    // Customer has 18,000 PKR outstanding. Retailer deposits 28,000 PKR on-account.
    // Resulting balance: -10,000 PKR (Retailer Advance Deposit Liability)
    let recovery_c = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 2800000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some("2026-11-07".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Pre-season advance deposit".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record Mode C recovery");

    assert_eq!(recovery_c.previous_balance_paisa, 1800000);
    assert_eq!(recovery_c.new_balance_paisa, -1000000); // ₨ -10,000 (Advance Credit)
    assert!(recovery_c.allocations.is_empty()); // Bills remain untouched
}

// ============================================================================
// TEST 6: OPERATING EXPENSES, CASH OUTFLOW & DAY-LOCK PREVENTION
// ============================================================================
#[test]
fn test_operating_expenses_cash_deduction_and_day_lock() {
    let mut conn = setup_test_db();

    // 1. Seed initial till cash: 50,000 PKR
    conn.execute(
        "INSERT INTO cash_book (entry_date, transaction_type, cash_in, cash_in_paisa, running_balance_paisa, running_cash_balance)
         VALUES ('2026-11-05', 'OPENING_FLOAT', 50000, 5000000, 5000000, 50000)",
        [],
    ).expect("Seed initial cash");

    // 2. Record Fuel Expense: 2,000 PKR (200,000 paisa)
    let res = AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            expense_date: Some("2026-11-05".into()),
            account_id: 30, // 6010 Delivery Vehicle Fuel
            amount_paisa: 200000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: Some("PSO Fuel Pump".into()),
            description: "Diesel for Toyota Hilux Van Beat 1".into(),
            reference_number: Some("REC-FUEL-01".into()),
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    ).expect("Record fuel expense");

    assert_eq!(res.amount_paisa, 200000);
    assert_eq!(res.new_balance_paisa, 4800000); // 50,000 - 2,000 = 48,000 PKR

    // Verify Cash Book record
    let cash_bal: i64 = conn
        .query_row("SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .expect("Query cash balance");
    assert_eq!(cash_bal, 4800000);

    // Verify Balanced Journal Entry (Dr 6010, Cr 1010)
    let (dr_acct, cr_acct): (i64, i64) = conn
        .query_row(
            "SELECT 
                (SELECT account_id FROM journal_lines WHERE entry_id = ?1 AND debit_paisa > 0),
                (SELECT account_id FROM journal_lines WHERE entry_id = ?1 AND credit_paisa > 0)",
            params![res.journal_entry_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query journal accounts");
    assert_eq!(dr_acct, 30); // 6010 Fuel
    assert_eq!(cr_acct, 2);  // 1010 Cash

    // 3. Insufficient Drawer Cash Guard
    let overdraw_err = AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            expense_date: Some("2026-11-05".into()),
            account_id: 30,
            amount_paisa: 10000000, // 100,000 PKR exceeds available 48,000 PKR!
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: None,
            description: "Overdraw attempt".into(),
            reference_number: None,
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    ).unwrap_err();

    match overdraw_err {
        AppError::Validation(msg) => assert!(msg.contains("Insufficient cash in drawer")),
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // 4. Day-Lock Guard
    // Finalize closing for 2026-11-02
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked) VALUES ('2026-11-02', 1)",
        [],
    ).expect("Lock date 2026-11-02");

    let lock_err = AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            expense_date: Some("2026-11-02".into()),
            account_id: 30,
            amount_paisa: 50000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: None,
            description: "Locked date expense attempt".into(),
            reference_number: None,
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    ).unwrap_err();

    match lock_err {
        AppError::DayLocked(msg) => assert!(msg.contains("locked")),
        other => panic!("Expected DayLocked error, got: {:?}", other),
    }

    // 5. Tamper-Resistance Trigger Enforcement: Direct UPDATE / DELETE on closed date must be rejected by SQLite triggers
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked) VALUES ('2026-11-05', 1)",
        [],
    ).expect("Lock date 2026-11-05");

    let raw_upd_exp_err = conn.execute(
        "UPDATE operating_expenses SET amount_paisa = 99999 WHERE expense_date = '2026-11-05'",
        [],
    ).unwrap_err();
    assert!(
        raw_upd_exp_err.to_string().contains("Access Denied: Cannot modify an expense on a locked accounting date."),
        "Trigger trg_prevent_update_locked_operating_expense must fire: {}",
        raw_upd_exp_err
    );

    let raw_del_exp_err = conn.execute(
        "DELETE FROM operating_expenses WHERE expense_date = '2026-11-05'",
        [],
    ).unwrap_err();
    assert!(
        raw_del_exp_err.to_string().contains("Access Denied: Operating expenses cannot be deleted on a locked accounting date."),
        "Trigger trg_prevent_delete_operating_expense must fire: {}",
        raw_del_exp_err
    );

    // Seed customer recovery for 2026-11-01 then lock date and verify trigger blocks UPDATE and DELETE
    conn.execute(
        "INSERT INTO customer_recoveries (
            recovery_number, customer_id, recovery_date, amount_paisa, amount,
            payment_mode, allocation_mode, previous_balance_paisa, new_balance_paisa, is_locked
         ) VALUES ('REC-AUDIT-LOCK', 1, '2026-11-01', 50000, 500.0, 'CASH', 'FIFO', 50000, 0, 0)",
        [],
    ).expect("Seed recovery on open date");

    // Lock recovery date via daily closing
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked) VALUES ('2026-11-01', 1)",
        [],
    ).expect("Lock date 2026-11-01");

    let raw_upd_rec_err = conn.execute(
        "UPDATE customer_recoveries SET amount_paisa = 99999 WHERE recovery_number = 'REC-AUDIT-LOCK'",
        [],
    ).unwrap_err();
    assert!(
        raw_upd_rec_err.to_string().contains("Access Denied: Cannot modify a recovery on a locked accounting date."),
        "Trigger trg_prevent_update_locked_recovery must fire: {}",
        raw_upd_rec_err
    );

    let raw_del_rec_err = conn.execute(
        "DELETE FROM customer_recoveries WHERE recovery_number = 'REC-AUDIT-LOCK'",
        [],
    ).unwrap_err();
    assert!(
        raw_del_rec_err.to_string().contains("Access Denied: Cannot delete a recovery on a locked accounting date."),
        "Trigger trg_prevent_delete_locked_recovery must fire: {}",
        raw_del_rec_err
    );
}

// ============================================================================
// TEST 7: CONTRA CASH/BANK TRANSFERS & BANK RECONCILIATION STATEMENT (BRS)
// ============================================================================
#[test]
fn test_cash_bank_contra_transfers_and_brs() {
    let mut conn = setup_test_db();

    // 1. Setup initial drawer: 50,000 PKR
    conn.execute(
        "INSERT INTO cash_book (entry_date, transaction_type, cash_in, cash_in_paisa, running_balance_paisa, running_cash_balance)
         VALUES ('2026-11-05', 'OPENING', 50000, 5000000, 5000000, 50000)",
        [],
    ).expect("Seed cash");

    // Bank Account initial: 100,000 PKR (10,000,000 paisa)
    conn.execute("UPDATE bank_accounts SET current_balance_paisa = 10000000, current_balance = 100000.0 WHERE id = 1", []).expect("Seed bank");

    // 2. CONTRA TRANSFER: Cash Deposit from Drawer to Bank: 20,000 PKR (2,000,000 paisa)
    let deposit_tx = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "CASH_TO_BANK".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-05".into(),
            amount_paisa: 2000000,
            instrument_type: Some("CASH_DEPOSIT".into()),
            instrument_number: Some("CHQ-DEP-01".into()),
            particulars: "Daily sales cash deposit to Meezan Bank".into(),
            user_id: Some(1),
        },
    ).expect("Transfer drawer cash to bank");

    assert_eq!(deposit_tx.deposit_paisa, 2000000);
    assert_eq!(deposit_tx.running_balance_paisa, 12000000); // 100,000 + 20,000 = 120,000 PKR

    // Drawer cash dropped by 20,000 PKR (from 50,000 to 30,000 PKR)
    let drawer_cash: i64 = conn
        .query_row("SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .expect("Query cash");
    assert_eq!(drawer_cash, 3000000);

    // 3. CONTRA TRANSFER: Cash Withdrawal from Bank to Drawer: 5,000 PKR (500,000 paisa)
    let withdraw_tx = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "BANK_TO_CASH".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-05".into(),
            amount_paisa: 500000,
            instrument_type: Some("ATM_WITHDRAWAL".into()),
            instrument_number: Some("ATM-9941".into()),
            particulars: "ATM withdrawal for cashier petty cash float".into(),
            user_id: Some(1),
        },
    ).expect("Withdraw cash from bank to drawer");

    assert_eq!(withdraw_tx.withdrawal_paisa, 500000);
    assert_eq!(withdraw_tx.running_balance_paisa, 11500000); // 120,000 - 5,000 = 115,000 PKR

    // Drawer cash increased by 5,000 PKR (from 30,000 to 35,000 PKR)
    let drawer_cash_after: i64 = conn
        .query_row("SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .expect("Query cash");
    assert_eq!(drawer_cash_after, 3500000);

    // 4. BANK RECONCILIATION STATEMENT (BRS)
    // Insert uncleared customer cheque deposit: 25,000 PKR (2,500,000 paisa)
    conn.execute(
        "INSERT INTO bank_transactions (
            bank_name, account_number, transaction_date, transaction_type,
            instrument_type, instrument_number, particulars,
            deposit_paisa, withdrawal_paisa, running_balance_paisa,
            is_cleared, clearance_date
         ) VALUES (
            'Meezan Bank Limited', '0102-0103948101', '2026-11-05', 'CUSTOMER_CHEQUE',
            'CHEQUE', 'CHQ-UNCLEARED-01', 'Uncleared customer recovery cheque',
            2500000, 0, 14000000, 0, NULL
         )",
        [],
    ).expect("Insert uncleared deposit");

    // Insert unpresented supplier cheque withdrawal: 15,000 PKR (1,500,000 paisa)
    conn.execute(
        "INSERT INTO bank_transactions (
            bank_name, account_number, transaction_date, transaction_type,
            instrument_type, instrument_number, particulars,
            deposit_paisa, withdrawal_paisa, running_balance_paisa,
            is_cleared, clearance_date
         ) VALUES (
            'Meezan Bank Limited', '0102-0103948101', '2026-11-05', 'SUPPLIER_CHEQUE',
            'CHEQUE', 'CHQ-UNPRESENTED-01', 'Unpresented cheque to Nextco',
            0, 1500000, 12500000, 0, NULL
         )",
        [],
    ).expect("Insert unpresented withdrawal");

    let brs = AccountingService::get_bank_reconciliation(&conn, 1, "2026-11-05").expect("Generate BRS");
    assert_eq!(brs.book_balance_paisa, 11500000); // ₨ 115,000
    assert_eq!(brs.uncleared_deposits_count, 1);
    assert_eq!(brs.uncleared_deposits_paisa, 2500000); // ₨ 25,000
    assert_eq!(brs.unpresented_withdrawals_count, 1);
    assert_eq!(brs.unpresented_withdrawals_paisa, 1500000); // ₨ 15,000

    // Reconciled Statement Balance = Book (115,000) - Uncleared Dep (25,000) + Unpresented With (15,000) = 105,000 PKR
    assert_eq!(brs.reconciled_statement_balance_paisa, 10500000);
}

// ============================================================================
// TEST 8: GENUINE COGS PROFIT & LOSS ENGINE & ISOLATION INVARIANTS
// ============================================================================
#[test]
fn test_pnl_engine_cogs_and_isolation_invariants() {
    let conn = setup_test_db();

    // 1. Create a Sales Invoice on 2026-11-05:
    // 10 cartons of Next Cola 250ml Glass:
    // Selling price: 2,500 PKR / carton = 25,000 PKR (2,500,000 paisa)
    // Historical Landed Cost: 2,000 PKR / carton = 20,000 PKR (2,000,000 paisa)
    conn.execute(
        "INSERT INTO sales_invoices (
            id, invoice_number, customer_id, invoice_date, due_date, payment_type,
            subtotal_paisa, discount_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            status, is_cancelled
         ) VALUES (501, 'INV-PNL-01', 1, '2026-11-05', '2026-11-05', 'CASH', 2500000, 0, 2500000, 2500000, 0, 'PAID', 0)",
        [],
    ).expect("Insert sales invoice");

    conn.execute(
        "INSERT INTO sales_invoice_items (
            invoice_id, product_id, unit_chosen, pack_qty, loose_qty, total_base_units,
            unit_price_paisa, line_total_paisa, cogs_total_paisa
         ) VALUES (501, 1, 'PACK', 10, 0, 240, 250000, 2500000, 2000000)",
        [],
    ).expect("Insert sales invoice item");

    // 2. Record an Operating Expense: 2,000 PKR (Fuel)
    conn.execute(
        "INSERT INTO operating_expenses (
            expense_number, expense_date, account_id, account_code, amount, amount_paisa,
            payment_mode, description
         ) VALUES ('EXP-PNL-01', '2026-11-05', 30, 6010, 2000.0, 200000, 'CASH', 'Delivery Fuel')",
        [],
    ).expect("Insert operating expense");

    // 3. Record Crate Security Deposit (Account 2100): 6,000 PKR (Current Liability, NOT Revenue)
    conn.execute(
        "UPDATE customers SET security_deposit_balance_paisa = 600000 WHERE id = 1",
        [],
    ).expect("Set customer deposit liability");

    // 4. Record Owner Capital Injection (Account 3010): 500,000 PKR (Equity, NOT Revenue)
    conn.execute(
        "INSERT INTO cash_book (entry_date, transaction_type, cash_in_paisa, running_balance_paisa)
         VALUES ('2026-11-05', 'OWNER_CAPITAL', 50000000, 50000000)",
        [],
    ).expect("Insert owner capital injection");

    // 5. Calculate P&L Statement for 2026-11-05
    let pnl = AccountingService::calculate_profit_and_loss(&conn, "2026-11-01", "2026-11-30").expect("Calculate P&L");

    // Net Sales Revenue = 25,000 PKR
    assert_eq!(pnl.revenue.net_sales_revenue_paisa, 2500000);

    // COGS = 20,000 PKR
    assert_eq!(pnl.cogs.total_cogs_paisa, 2000000);

    // Gross Profit = 25,000 - 20,000 = 5,000 PKR (500,000 paisa)
    assert_eq!(pnl.gross_profit_paisa, 500000);
    assert!((pnl.gross_margin_percent - 20.0).abs() < 0.01); // 5,000 / 25,000 = 20%

    // Operating Expenses = 2,000 PKR
    assert_eq!(pnl.total_operating_expenses_paisa, 200000);

    // Net Operating Profit = 5,000 - 2,000 = 3,000 PKR (300,000 paisa)
    assert_eq!(pnl.net_operating_profit_paisa, 300000);
    assert!((pnl.net_margin_percent - 12.0).abs() < 0.01); // 3,000 / 25,000 = 12%

    // INVARIANT EXCLUSION VERIFICATION:
    // Crate deposit liability is strictly isolated and NEVER included in revenue/profit
    assert_eq!(pnl.isolated_deposit_liability_paisa, 600000); // ₨ 6,000
    // Owner capital is strictly isolated and NEVER included in revenue/profit
    assert_eq!(pnl.isolated_owner_capital_injections_paisa, 50000000); // ₨ 500,000

    // CANCELLED INVOICE TEST:
    // If invoice is cancelled, revenue and COGS drop to 0!
    conn.execute("UPDATE sales_invoices SET is_cancelled = 1, status = 'CANCELLED' WHERE id = 501", []).expect("Cancel invoice");

    let pnl_cancelled = AccountingService::calculate_profit_and_loss(&conn, "2026-11-01", "2026-11-30").expect("Recalculate P&L");
    assert_eq!(pnl_cancelled.revenue.net_sales_revenue_paisa, 0);
    assert_eq!(pnl_cancelled.cogs.total_cogs_paisa, 0);
    assert_eq!(pnl_cancelled.gross_profit_paisa, 0);
    assert_eq!(pnl_cancelled.net_operating_profit_paisa, -200000); // Operating loss equal to expenses
}

// ============================================================================
// TEST 9: TRIAL BALANCE ENGINE ALGEBRAIC EQUALITY
// ============================================================================
#[test]
fn test_trial_balance_algebraic_equality() {
    let mut conn = setup_test_db();

    // Setup initial balanced journal entries across multiple accounts
    let tx = conn.transaction().expect("Start transaction");

    // 1. Initial Owner Capital: Dr 1010 Cash (2) 1,000,000 PKR, Cr 3010 Owner Capital (19) 1,000,000 PKR
    let jv1 = CreateJournalEntryInput {
        entry_date: "2026-11-01".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: Some("OWNER_EQUITY".into()),
        reference_doc_id: None,
        narration: "Owner capital contribution".into(),
        lines: vec![
            JournalLineInput {
                account_id: 2,
                debit_paisa: 100000000,
                credit_paisa: 0,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 19,
                debit_paisa: 0,
                credit_paisa: 100000000,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };
    AccountingService::post_journal_entry(&tx, jv1).expect("Post JV 1");

    // 2. Deposit Cash to Bank: Dr 1020 Bank (3) 400,000 PKR, Cr 1010 Cash (2) 400,000 PKR
    let jv2 = CreateJournalEntryInput {
        entry_date: "2026-11-02".into(),
        voucher_type: "TRANSFER".into(),
        reference_doc_type: Some("CONTRA".into()),
        reference_doc_id: None,
        narration: "Bank deposit".into(),
        lines: vec![
            JournalLineInput {
                account_id: 3,
                debit_paisa: 40000000,
                credit_paisa: 0,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 2,
                debit_paisa: 0,
                credit_paisa: 40000000,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };
    AccountingService::post_journal_entry(&tx, jv2).expect("Post JV 2");

    // 3. Operating Expense: Dr 6010 Fuel (30) 10,000 PKR, Cr 1010 Cash (2) 10,000 PKR
    let jv3 = CreateJournalEntryInput {
        entry_date: "2026-11-03".into(),
        voucher_type: "EXPENSE".into(),
        reference_doc_type: Some("EXPENSE".into()),
        reference_doc_id: None,
        narration: "Vehicle fuel".into(),
        lines: vec![
            JournalLineInput {
                account_id: 30,
                debit_paisa: 1000000,
                credit_paisa: 0,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 2,
                debit_paisa: 0,
                credit_paisa: 1000000,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };
    AccountingService::post_journal_entry(&tx, jv3).expect("Post JV 3");

    tx.commit().expect("Commit JVs");

    let tb = AccountingService::calculate_trial_balance(&conn, Some("2026-11-10")).expect("Calculate trial balance");

    // Total debits must strictly equal total credits
    assert_eq!(tb.total_debits_paisa, 141000000);
    assert_eq!(tb.total_credits_paisa, 141000000);
    assert!(tb.is_balanced);
}

// ============================================================================
// TEST 10: TRIAL BALANCE HISTORICAL DATE BARRIER & FUTURE LEAK PREVENTION
// ============================================================================
#[test]
fn test_trial_balance_historical_date_filtering_and_future_leak_prevention() {
    let mut conn = setup_test_db();
    let tx = conn.transaction().expect("Start transaction");

    // 1. JV 1 on 2026-11-01: Dr 1010 Cash (2) 100,000,000 Paisa, Cr 3010 Capital (19) 100,000,000 Paisa
    let jv1 = CreateJournalEntryInput {
        entry_date: "2026-11-01".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: Some("OWNER_EQUITY".into()),
        reference_doc_id: None,
        narration: "Owner capital contribution".into(),
        lines: vec![
            JournalLineInput { account_id: 2, debit_paisa: 100000000, credit_paisa: 0, line_narration: None, customer_id: None, supplier_id: None },
            JournalLineInput { account_id: 19, debit_paisa: 0, credit_paisa: 100000000, line_narration: None, customer_id: None, supplier_id: None },
        ],
        created_by: Some(1),
    };
    AccountingService::post_journal_entry(&tx, jv1).expect("Post JV 1");

    // 2. JV 2 on 2026-11-02: Dr 1020 Bank (3) 40,000,000 Paisa, Cr 1010 Cash (2) 40,000,000 Paisa
    let jv2 = CreateJournalEntryInput {
        entry_date: "2026-11-02".into(),
        voucher_type: "TRANSFER".into(),
        reference_doc_type: Some("CONTRA".into()),
        reference_doc_id: None,
        narration: "Bank deposit".into(),
        lines: vec![
            JournalLineInput { account_id: 3, debit_paisa: 40000000, credit_paisa: 0, line_narration: None, customer_id: None, supplier_id: None },
            JournalLineInput { account_id: 2, debit_paisa: 0, credit_paisa: 40000000, line_narration: None, customer_id: None, supplier_id: None },
        ],
        created_by: Some(1),
    };
    AccountingService::post_journal_entry(&tx, jv2).expect("Post JV 2");

    // 3. JV 3 on 2026-11-20 (FUTURE ENTRY): Dr 1010 Cash (2) 5,000,000 Paisa, Cr 3010 Capital (19) 5,000,000 Paisa
    let jv3 = CreateJournalEntryInput {
        entry_date: "2026-11-20".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: Some("OWNER_EQUITY".into()),
        reference_doc_id: None,
        narration: "Future injection".into(),
        lines: vec![
            JournalLineInput { account_id: 2, debit_paisa: 5000000, credit_paisa: 0, line_narration: None, customer_id: None, supplier_id: None },
            JournalLineInput { account_id: 19, debit_paisa: 0, credit_paisa: 5000000, line_narration: None, customer_id: None, supplier_id: None },
        ],
        created_by: Some(1),
    };
    AccountingService::post_journal_entry(&tx, jv3).expect("Post JV 3");

    tx.commit().expect("Commit JVs");

    // Verify 1: Before any transactions (2026-10-31)
    let tb_pre = AccountingService::calculate_trial_balance(&conn, Some("2026-10-31")).expect("TB pre");
    assert_eq!(tb_pre.total_debits_paisa, 0);
    assert_eq!(tb_pre.total_credits_paisa, 0);
    assert!(tb_pre.is_balanced);

    // Verify 2: As of 2026-11-01 (Only JV 1 must be present; JV 2 and future JV 3 must NOT leak)
    let tb_nov1 = AccountingService::calculate_trial_balance(&conn, Some("2026-11-01")).expect("TB Nov 1");
    assert_eq!(tb_nov1.total_debits_paisa, 100000000);
    assert_eq!(tb_nov1.total_credits_paisa, 100000000);
    assert!(tb_nov1.is_balanced);
    let cash_nov1 = tb_nov1.accounts.iter().find(|a| a.account_code == 1010).unwrap();
    assert_eq!(cash_nov1.total_debit_paisa, 100000000);
    assert_eq!(cash_nov1.total_credit_paisa, 0); // Nov 2 credit of 40M excluded!
    let bank_nov1 = tb_nov1.accounts.iter().find(|a| a.account_code == 1020).unwrap();
    assert_eq!(bank_nov1.total_debit_paisa, 0); // Nov 2 debit of 40M excluded!

    // Verify 3: As of 2026-11-05 (JV 1 and JV 2 present; future JV 3 on Nov 20 excluded)
    let tb_nov5 = AccountingService::calculate_trial_balance(&conn, Some("2026-11-05")).expect("TB Nov 5");
    assert_eq!(tb_nov5.total_debits_paisa, 140000000);
    assert_eq!(tb_nov5.total_credits_paisa, 140000000);
    assert!(tb_nov5.is_balanced);
    let cash_nov5 = tb_nov5.accounts.iter().find(|a| a.account_code == 1010).unwrap();
    assert_eq!(cash_nov5.total_debit_paisa, 100000000); // Future 5M on Nov 20 excluded!
    assert_eq!(cash_nov5.total_credit_paisa, 40000000);

    // Verify 4: As of 2026-11-25 (All transactions including JV 3 present)
    let tb_nov25 = AccountingService::calculate_trial_balance(&conn, Some("2026-11-25")).expect("TB Nov 25");
    assert_eq!(tb_nov25.total_debits_paisa, 145000000);
    assert_eq!(tb_nov25.total_credits_paisa, 145000000);
    assert!(tb_nov25.is_balanced);
}

// ============================================================================
// TEST 11: PROFIT & LOSS SALES RETURNS DEDUCTION
// ============================================================================
#[test]
fn test_remediation_pnl_sales_returns_deduction() {
    let conn = setup_test_db();

    // 1. Create a credit sales invoice: Gross 30,000 PKR, Discount 5,000 PKR => Net 25,000 PKR
    conn.execute(
        "INSERT INTO sales_invoices (
            id, invoice_number, customer_id, invoice_date, due_date,
            subtotal_paisa, discount_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            status, is_cancelled, payment_type
         ) VALUES (801, 'INV-RET-TEST', 1, '2026-11-05', '2026-11-05', 3000000, 500000, 2500000, 0, 2500000, 'UNPAID', 0, 'CREDIT')",
        [],
    ).unwrap();

    // 2. Insert an approved sales return of 3,000 PKR (300,000 paisa)
    conn.execute(
        "INSERT INTO sales_returns (
            id, return_number, invoice_id, customer_id, return_date,
            total_return_paisa, refund_mode, reason, status, is_cancelled
         ) VALUES (901, 'RET-001', 801, 1, '2026-11-05', 300000, 'CREDIT_NOTE', 'Damaged goods', 'APPROVED', 0)",
        [],
    ).unwrap();

    let pnl = AccountingService::calculate_profit_and_loss(&conn, "2026-11-01", "2026-11-30").unwrap();

    // Net Sales Revenue must equal: 3,000,000 - 500,000 - 300,000 = 2,200,000 paisa
    assert_eq!(pnl.revenue.gross_sales_paisa, 3000000);
    assert_eq!(pnl.revenue.total_discounts_paisa, 500000);
    assert_eq!(pnl.revenue.total_sales_returns_paisa, 300000);
    assert_eq!(pnl.revenue.net_sales_revenue_paisa, 2200000);
    assert_eq!(pnl.revenue.total_operating_revenue_paisa, 2200000);

    // Cancel the return: should no longer be deducted
    conn.execute("UPDATE sales_returns SET is_cancelled = 1, status = 'CANCELLED' WHERE id = 901", []).unwrap();
    let pnl_recalc = AccountingService::calculate_profit_and_loss(&conn, "2026-11-01", "2026-11-30").unwrap();
    assert_eq!(pnl_recalc.revenue.total_sales_returns_paisa, 0);
    assert_eq!(pnl_recalc.revenue.net_sales_revenue_paisa, 2500000);
}

// ============================================================================
// TEST 12: CUSTOMER AGING FUTURE INVOICES EXCLUDED
// ============================================================================
#[test]
fn test_remediation_customer_aging_future_invoices_excluded() {
    let conn = setup_test_db();

    // Invoice A: dated 2026-11-15 (Day 0 as of 2026-11-15) -> 10,000 PKR
    conn.execute(
        "INSERT INTO sales_invoices (
            id, invoice_number, customer_id, invoice_date, due_date,
            subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            status, is_cancelled, payment_type
         ) VALUES (951, 'INV-CURRENT', 1, '2026-11-15', '2026-11-15', 1000000, 1000000, 0, 1000000, 'UNPAID', 0, 'CREDIT')",
        [],
    ).unwrap();

    // Invoice B: dated in future relative to as_of (2026-11-20) -> 25,000 PKR
    conn.execute(
        "INSERT INTO sales_invoices (
            id, invoice_number, customer_id, invoice_date, due_date,
            subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            status, is_cancelled, payment_type
         ) VALUES (952, 'INV-FUTURE', 1, '2026-11-20', '2026-11-20', 2500000, 2500000, 0, 2500000, 'UNPAID', 0, 'CREDIT')",
        [],
    ).unwrap();

    // Calculate aging as of 2026-11-15
    let aging = AccountingService::calculate_customer_aging(&conn, 1, Some("2026-11-15")).unwrap();

    // Future invoice MUST NOT be clamped to 0-7 or included in outstanding total!
    assert_eq!(aging.bucket_0_7_paisa, 1000000);
    assert_eq!(aging.total_outstanding_paisa, 1000000);
    assert_eq!(aging.invoices.len(), 1);
    assert_eq!(aging.invoices[0].invoice_number, "INV-CURRENT");

    // Recalculate as of 2026-11-25 (now both invoices are in past)
    let aging_later = AccountingService::calculate_customer_aging(&conn, 1, Some("2026-11-25")).unwrap();
    // INV-CURRENT is 10 days old (bucket 8-15); INV-FUTURE is 5 days old (bucket 0-7)
    assert_eq!(aging_later.bucket_0_7_paisa, 2500000);
    assert_eq!(aging_later.bucket_8_15_paisa, 1000000);
    assert_eq!(aging_later.total_outstanding_paisa, 3500000);
    assert_eq!(aging_later.invoices.len(), 2);
}

// ============================================================================
// TEST 13: 80MM THERMAL WASOOLI RASEED COLUMN ALIGNMENT (48 MONOSPACE CHARS)
// ============================================================================
#[test]
fn test_remediation_receipt_column_alignment() {
    let allocations = vec![
        InvoiceAllocationDetailDto {
            invoice_id: 1,
            invoice_number: "INV-101".into(),
            invoice_date: "2026-11-01".into(),
            previous_due_paisa: 100000,
            allocated_paisa: 100000,
            remaining_due_paisa: 0,
            new_status: "PAID".into(),
        },
    ];

    let receipt = format_recovery_receipt(
        "REC-001", "2026-11-05", "Test Shop", "Ali", "03001234567",
        "CASH", "SPECIFIC", 100000, 100000, 0, 0, &allocations,
    );

    let header_line = "Invoice No        Previous   Adjusted    Rem Due";
    assert!(receipt.contains(header_line), "Receipt should contain header line:\n{}", receipt);
    assert_eq!(header_line.len(), 48);

    // Verify row line has length 48
    let row_line = receipt.lines().find(|l| l.starts_with("INV-101")).unwrap();
    assert_eq!(row_line.len(), 48, "Row line length mismatch: '{}'", row_line);
}

