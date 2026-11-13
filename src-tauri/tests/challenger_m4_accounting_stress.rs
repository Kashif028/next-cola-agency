use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::dtos::*;
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::domain::models::PaymentType;
use logar_pos_lib::services::accounting::AccountingService;
use logar_pos_lib::services::cancellations::{CancellationService, CancelInvoiceDto};
use logar_pos_lib::services::purchases::{PurchaseItemInputDto, PurchaseService, RecordPurchaseDto};
use logar_pos_lib::services::sales::{CreateSalesInvoiceDto, CreateSalesInvoiceItemDto, SalesService};
use rusqlite::{params, Connection};

fn setup_test_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations");
    conn
}

// ============================================================================
// STRESS TEST 1: CASH <-> BANK CONTRA TRANSFER STRESS
// ============================================================================
#[test]
fn test_stress_cash_bank_contra_transfers() {
    let mut conn = setup_test_db();

    // ------------------------------------------------------------------------
    // Part A: Insufficient Cash in Drawer Rejections
    // ------------------------------------------------------------------------
    // 1. Empty drawer: 0 cash in till. Attempt deposit of 5,000 PKR (500,000 Paisas)
    let err_empty_drawer = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "CASH_TO_BANK".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-06".into(),
            amount_paisa: 500000,
            instrument_type: Some("CASH_DEPOSIT".into()),
            instrument_number: Some("DEP-FAIL-01".into()),
            particulars: "Deposit with empty till".into(),
            user_id: Some(1),
        },
    ).unwrap_err();

    match err_empty_drawer {
        AppError::Validation(msg) => {
            assert!(msg.contains("Insufficient cash in drawer"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // 2. Seed drawer with exactly 25,000 PKR (2,500,000 Paisas)
    conn.execute(
        "INSERT INTO cash_book (entry_date, transaction_type, cash_in, cash_in_paisa, running_balance_paisa, running_cash_balance)
         VALUES ('2026-11-06', 'OPENING_FLOAT', 25000, 2500000, 2500000, 25000)",
        [],
    ).expect("Seed cash");

    // 3. 1-Paisa Overdraft Rejection: Attempt to deposit 25,000.01 PKR (2,500,001 Paisas)
    let err_1paisa_overdraft = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "CASH_TO_BANK".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-06".into(),
            amount_paisa: 2500001,
            instrument_type: Some("CASH_DEPOSIT".into()),
            instrument_number: Some("DEP-FAIL-02".into()),
            particulars: "1 paisa overdraft".into(),
            user_id: Some(1),
        },
    ).unwrap_err();

    match err_1paisa_overdraft {
        AppError::Validation(msg) => {
            assert!(msg.contains("Insufficient cash in drawer"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // 4. Zero and Negative Amount Rejections
    let err_zero_amount = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "CASH_TO_BANK".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-06".into(),
            amount_paisa: 0,
            instrument_type: None,
            instrument_number: None,
            particulars: "Zero deposit".into(),
            user_id: Some(1),
        },
    ).unwrap_err();

    match err_zero_amount {
        AppError::Validation(msg) => {
            assert!(msg.contains("Transfer amount must be positive"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    let err_negative_amount = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "CASH_TO_BANK".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-06".into(),
            amount_paisa: -500000,
            instrument_type: None,
            instrument_number: None,
            particulars: "Negative deposit".into(),
            user_id: Some(1),
        },
    ).unwrap_err();

    match err_negative_amount {
        AppError::Validation(msg) => {
            assert!(msg.contains("Transfer amount must be positive"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // ------------------------------------------------------------------------
    // Part B: Insufficient Bank Balance Rejections
    // ------------------------------------------------------------------------
    // Bank account 1 initial balance is 250,000 PKR (25,000,000 Paisas)
    // Attempt withdrawal of 25,000,001 Paisas (1-paisa overdraft)
    let err_bank_overdraft = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "BANK_TO_CASH".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-06".into(),
            amount_paisa: 25000001,
            instrument_type: Some("ATM_WITHDRAWAL".into()),
            instrument_number: Some("WDL-FAIL-01".into()),
            particulars: "1 paisa bank overdraft".into(),
            user_id: Some(1),
        },
    ).unwrap_err();

    match err_bank_overdraft {
        AppError::Validation(msg) => {
            assert!(msg.contains("Insufficient bank balance"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // Attempt withdrawal with non-existent bank account ID (9999)
    let err_bank_not_found = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "BANK_TO_CASH".into(),
            bank_account_id: 9999,
            transfer_date: "2026-11-06".into(),
            amount_paisa: 100000,
            instrument_type: None,
            instrument_number: None,
            particulars: "Non-existent bank account".into(),
            user_id: Some(1),
        },
    ).unwrap_err();

    match err_bank_not_found {
        AppError::NotFound { entity, id } => {
            assert_eq!(entity, "BankAccount");
            assert_eq!(id, "9999");
        }
        other => panic!("Expected NotFound error, got: {:?}", other),
    }

    // ------------------------------------------------------------------------
    // Part C: Day-Lock Protection Rejections
    // ------------------------------------------------------------------------
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked) VALUES ('2026-11-01', 1)",
        [],
    ).expect("Lock date 2026-11-01");

    let err_locked_date = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "CASH_TO_BANK".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-01".into(),
            amount_paisa: 100000,
            instrument_type: None,
            instrument_number: None,
            particulars: "Deposit on locked accounting date".into(),
            user_id: Some(1),
        },
    ).unwrap_err();

    match err_locked_date {
        AppError::DayLocked(msg) => {
            assert!(msg.contains("locked"), "Message was: {}", msg);
        }
        other => panic!("Expected DayLocked error, got: {:?}", other),
    }

    // ------------------------------------------------------------------------
    // Part D: Unsupported Direction Rejection
    // ------------------------------------------------------------------------
    let err_invalid_dir = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "CRYPTO_TO_SAFE".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-06".into(),
            amount_paisa: 100000,
            instrument_type: None,
            instrument_number: None,
            particulars: "Invalid direction".into(),
            user_id: Some(1),
        },
    ).unwrap_err();

    match err_invalid_dir {
        AppError::Validation(msg) => {
            assert!(msg.contains("Unsupported transfer direction"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // ------------------------------------------------------------------------
    // Part E: Valid Transfers & Exact Double-Entry Balance Invariants
    // ------------------------------------------------------------------------
    // Reset balances in fresh DB: Drawer = 50,000 PKR (5,000,000 paisa), Bank = 100,000 PKR (10,000,000 paisa)
    let mut conn = setup_test_db();
    conn.execute(
        "INSERT INTO cash_book (entry_date, transaction_type, cash_in, cash_in_paisa, running_balance_paisa, running_cash_balance)
         VALUES ('2026-11-06', 'OPENING_FLOAT', 50000, 5000000, 5000000, 50000)",
        [],
    ).expect("Seed cash");
    conn.execute(
        "UPDATE bank_accounts SET current_balance_paisa = 10000000, current_balance = 100000.0 WHERE id = 1",
        [],
    ).expect("Set bank balance");

    // E1: Valid Cash-to-Bank Deposit: 30,000 PKR (3,000,000 paisa)
    let dep_res = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "CASH_TO_BANK".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-06".into(),
            amount_paisa: 3000000,
            instrument_type: Some("CASH_DEPOSIT_SLIP".into()),
            instrument_number: Some("DEP-SLIP-771".into()),
            particulars: "Shop sales deposited to Meezan Bank".into(),
            user_id: Some(1),
        },
    ).expect("Perform valid deposit");

    assert_eq!(dep_res.deposit_paisa, 3000000);
    assert_eq!(dep_res.withdrawal_paisa, 0);
    assert_eq!(dep_res.running_balance_paisa, 13000000); // 100,000 + 30,000 = 130,000 PKR
    assert!(dep_res.is_cleared);

    // Verify cash_book state: Drawer cash decreased by 30,000 PKR (from 50,000 to 20,000 PKR)
    let (cash_out_logged, drawer_after_dep): (i64, i64) = conn
        .query_row(
            "SELECT cash_out_paisa, running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query cash book");
    assert_eq!(cash_out_logged, 3000000);
    assert_eq!(drawer_after_dep, 2000000);

    // Verify bank_accounts table
    let bank_row_bal: i64 = conn
        .query_row("SELECT current_balance_paisa FROM bank_accounts WHERE id = 1", [], |r| r.get(0))
        .expect("Query bank account");
    assert_eq!(bank_row_bal, 13000000);

    // Verify bank_transactions table
    let (tx_type, dep_paisa, with_paisa, run_bal, cleared): (String, i64, i64, i64, bool) = conn
        .query_row(
            "SELECT transaction_type, deposit_paisa, withdrawal_paisa, running_balance_paisa, is_cleared 
             FROM bank_transactions WHERE id = ?1",
            params![dep_res.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map(|(t, d, w)| {
            let (r, c): (i64, bool) = conn
                .query_row(
                    "SELECT running_balance_paisa, is_cleared FROM bank_transactions WHERE id = ?1",
                    params![dep_res.id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            (t, d, w, r, c)
        })
        .expect("Query bank tx");
    assert_eq!(tx_type, "CASH_DEPOSIT");
    assert_eq!(dep_paisa, 3000000);
    assert_eq!(with_paisa, 0);
    assert_eq!(run_bal, 13000000);
    assert!(cleared);

    // Verify balanced Journal Entry: Dr 1020 Bank, Cr 1010 Cash
    let (jv_dr_acct, jv_cr_acct, jv_dr_paisa, jv_cr_paisa): (i64, i64, i64, i64) = conn
        .query_row(
            "SELECT 
                (SELECT account_id FROM journal_lines jl WHERE jl.entry_id = bt.journal_entry_id AND debit_paisa > 0),
                (SELECT account_id FROM journal_lines jl WHERE jl.entry_id = bt.journal_entry_id AND credit_paisa > 0),
                (SELECT debit_paisa FROM journal_lines jl WHERE jl.entry_id = bt.journal_entry_id AND debit_paisa > 0),
                (SELECT credit_paisa FROM journal_lines jl WHERE jl.entry_id = bt.journal_entry_id AND credit_paisa > 0)
             FROM bank_transactions bt WHERE bt.id = ?1",
            params![dep_res.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .expect("Query JV lines for deposit");
    assert_eq!(jv_dr_acct, 3); // 1020 Bank
    assert_eq!(jv_cr_acct, 2); // 1010 Cash
    assert_eq!(jv_dr_paisa, 3000000);
    assert_eq!(jv_cr_paisa, 3000000);

    // E2: Valid Bank-to-Cash Withdrawal: 15,000 PKR (1,500,000 paisa)
    let wdl_res = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "BANK_TO_CASH".into(),
            bank_account_id: 1,
            transfer_date: "2026-11-06".into(),
            amount_paisa: 1500000,
            instrument_type: Some("CHEQUE_SELF".into()),
            instrument_number: Some("CHQ-88901".into()),
            particulars: "Cash withdrawal for daily expenses float".into(),
            user_id: Some(1),
        },
    ).expect("Perform valid withdrawal");

    assert_eq!(wdl_res.deposit_paisa, 0);
    assert_eq!(wdl_res.withdrawal_paisa, 1500000);
    assert_eq!(wdl_res.running_balance_paisa, 11500000); // 130,000 - 15,000 = 115,000 PKR

    // Verify cash_book state: Drawer cash increased by 15,000 PKR (from 20,000 to 35,000 PKR)
    let (cash_in_logged, drawer_after_wdl): (i64, i64) = conn
        .query_row(
            "SELECT cash_in_paisa, running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query cash book");
    assert_eq!(cash_in_logged, 1500000);
    assert_eq!(drawer_after_wdl, 3500000);

    // Verify balanced Journal Entry: Dr 1010 Cash, Cr 1020 Bank
    let (jv_dr_acct2, jv_cr_acct2, jv_dr_paisa2, jv_cr_paisa2): (i64, i64, i64, i64) = conn
        .query_row(
            "SELECT 
                (SELECT account_id FROM journal_lines jl WHERE jl.entry_id = bt.journal_entry_id AND debit_paisa > 0),
                (SELECT account_id FROM journal_lines jl WHERE jl.entry_id = bt.journal_entry_id AND credit_paisa > 0),
                (SELECT debit_paisa FROM journal_lines jl WHERE jl.entry_id = bt.journal_entry_id AND debit_paisa > 0),
                (SELECT credit_paisa FROM journal_lines jl WHERE jl.entry_id = bt.journal_entry_id AND credit_paisa > 0)
             FROM bank_transactions bt WHERE bt.id = ?1",
            params![wdl_res.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .expect("Query JV lines for withdrawal");
    assert_eq!(jv_dr_acct2, 2); // 1010 Cash
    assert_eq!(jv_cr_acct2, 3); // 1020 Bank
    assert_eq!(jv_dr_paisa2, 1500000);
    assert_eq!(jv_cr_paisa2, 1500000);

    // ------------------------------------------------------------------------
    // Part F: Rapid Ping-Pong Stress Test (Wealth Conservation Invariant)
    // ------------------------------------------------------------------------
    // Total combined liquid assets (Drawer Cash + Bank Balance) must remain invariant
    // after any number of contra transfers!
    let initial_total_liquid = drawer_after_wdl + 11500000; // 35,000 + 115,000 = 150,000 PKR (15,000,000 paisa)
    assert_eq!(initial_total_liquid, 15000000);

    let ping_pong_steps = vec![
        ("CASH_TO_BANK", 500000),   // Deposit 5,000
        ("BANK_TO_CASH", 800000),   // Withdraw 8,000
        ("CASH_TO_BANK", 1200000),  // Deposit 12,000
        ("BANK_TO_CASH", 350000),   // Withdraw 3,500
        ("CASH_TO_BANK", 750000),   // Deposit 7,500
        ("BANK_TO_CASH", 1000000),  // Withdraw 10,000
        ("CASH_TO_BANK", 450000),   // Deposit 4,500
        ("BANK_TO_CASH", 200000),   // Withdraw 2,000
        ("CASH_TO_BANK", 1500000),  // Deposit 15,000
        ("BANK_TO_CASH", 900000),   // Withdraw 9,000
    ];

    for (step_idx, (dir, amt)) in ping_pong_steps.into_iter().enumerate() {
        let tx = AccountingService::record_bank_transfer(
            &mut conn,
            BankTransferRequestDto {
                direction: dir.into(),
                bank_account_id: 1,
                transfer_date: "2026-11-06".into(),
                amount_paisa: amt,
                instrument_type: Some("PING_PONG".into()),
                instrument_number: Some(format!("PP-{}", step_idx)),
                particulars: format!("Ping pong transfer step {}", step_idx),
                user_id: Some(1),
            },
        ).expect(&format!("Ping pong step {} failed", step_idx));

        let current_drawer: i64 = conn
            .query_row("SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
            .expect("Query cash");
        let current_bank: i64 = conn
            .query_row("SELECT current_balance_paisa FROM bank_accounts WHERE id = 1", [], |r| r.get(0))
            .expect("Query bank");

        assert_eq!(
            current_drawer + current_bank,
            initial_total_liquid,
            "Conservation of liquid wealth violated at step {}! Drawer: {}, Bank: {}, Expected Sum: {}",
            step_idx, current_drawer, current_bank, initial_total_liquid
        );
        assert_eq!(current_bank, tx.running_balance_paisa);
    }
}

// ============================================================================
// STRESS TEST 2: BANK RECONCILIATION STATEMENT (BRS) STRESS
// ============================================================================
#[test]
fn test_stress_bank_reconciliation_statement() {
    let conn = setup_test_db();

    // 1. Initialize Bank Account 1 with 200,000 PKR (20,000,000 paisa)
    conn.execute(
        "UPDATE bank_accounts SET current_balance_paisa = 20000000, current_balance = 200000.0 WHERE id = 1",
        [],
    ).expect("Initialize bank account balance");

    // 2. Insert CLEARED transactions (is_cleared = 1) on "2026-11-04"
    // These are already recognized by the bank statement and MUST NOT appear in BRS uncleared list!
    let cleared_txs = vec![
        ("CASH_DEPOSIT", 1000000, 0, "DEP-CLR-01", "2026-11-04"),
        ("CUSTOMER_TRANSFER", 2500000, 0, "DEP-CLR-02", "2026-11-04"),
        ("SUPPLIER_CHEQUE", 0, 1500000, "CHQ-CLR-01", "2026-11-04"),
        ("UTILITY_ONLINE", 0, 800000, "WDL-CLR-02", "2026-11-04"),
    ];

    for (tt, dep, wdl, num, dt) in cleared_txs {
        conn.execute(
            "INSERT INTO bank_transactions (
                bank_name, account_number, transaction_date, transaction_type,
                instrument_type, instrument_number, particulars,
                deposit_paisa, withdrawal_paisa, running_balance_paisa,
                is_cleared, clearance_date
             ) VALUES (
                'Meezan Bank Limited', '01020304050607', ?1, ?2,
                'ONLINE_RAAST', ?3, 'Cleared transaction',
                ?4, ?5, 20000000, 1, ?1
             )",
            params![dt, tt, num, dep, wdl],
        ).expect("Insert cleared tx");
    }

    // 3. Insert UNCLEARED transactions on "2026-11-05":
    // Uncleared Deposits:
    // Deposit 1: 50,000 PKR (5,000,000 paisa)
    // Deposit 2: 75,000 PKR (7,500,000 paisa)
    // Deposit 3: 25,000 PKR (2,500,000 paisa)
    // Total Uncleared Deposits = 150,000 PKR (15,000,000 paisa), Count = 3
    let uncleared_deposits = vec![
        (5000000, "CHQ-DEP-U01", "Uncleared retail customer cheque 1"),
        (7500000, "CHQ-DEP-U02", "Uncleared wholesale customer cheque 2"),
        (2500000, "CHQ-DEP-U03", "Uncleared recovery cheque 3"),
    ];

    for (amt, chq, part) in uncleared_deposits {
        conn.execute(
            "INSERT INTO bank_transactions (
                bank_name, account_number, transaction_date, transaction_type,
                instrument_type, instrument_number, particulars,
                deposit_paisa, withdrawal_paisa, running_balance_paisa,
                is_cleared, clearance_date
             ) VALUES (
                'Meezan Bank Limited', '01020304050607', '2026-11-05', 'CUSTOMER_CHEQUE',
                'CHEQUE', ?1, ?2, ?3, 0, 20000000, 0, NULL
             )",
            params![chq, part, amt],
        ).expect("Insert uncleared deposit");
    }

    // Unpresented Cheques (Withdrawals issued by us but not yet presented/cleared by bank):
    // Cheque A: 40,000 PKR (4,000,000 paisa)
    // Cheque B: 30,000 PKR (3,000,000 paisa)
    // Cheque C: 10,000 PKR (1,000,000 paisa)
    // Total Unpresented Withdrawals = 80,000 PKR (8,000,000 paisa), Count = 3
    let unpresented_withdrawals = vec![
        (4000000, "CHQ-SUP-W01", "Unpresented cheque to Nextco Factory"),
        (3000000, "CHQ-SUP-W02", "Unpresented cheque to Freight Transporter"),
        (1000000, "CHQ-SUP-W03", "Unpresented cheque to Warehouse Landlord"),
    ];

    for (amt, chq, part) in unpresented_withdrawals {
        conn.execute(
            "INSERT INTO bank_transactions (
                bank_name, account_number, transaction_date, transaction_type,
                instrument_type, instrument_number, particulars,
                deposit_paisa, withdrawal_paisa, running_balance_paisa,
                is_cleared, clearance_date
             ) VALUES (
                'Meezan Bank Limited', '01020304050607', '2026-11-05', 'SUPPLIER_CHEQUE',
                'CHEQUE', ?1, ?2, 0, ?3, 20000000, 0, NULL
             )",
            params![chq, part, amt],
        ).expect("Insert unpresented withdrawal");
    }

    // 4. FUTURE TRANSACTIONS (Date Boundary Stress Test):
    // Insert uncleared deposit and unpresented cheque on future date "2026-11-12".
    // When querying BRS as of "2026-11-05", these future transactions MUST be excluded!
    conn.execute(
        "INSERT INTO bank_transactions (
            bank_name, account_number, transaction_date, transaction_type,
            instrument_type, instrument_number, particulars,
            deposit_paisa, withdrawal_paisa, running_balance_paisa,
            is_cleared, clearance_date
         ) VALUES (
            'Meezan Bank Limited', '01020304050607', '2026-11-12', 'CUSTOMER_CHEQUE',
            'CHEQUE', 'CHQ-FUTURE-DEP', 'Future uncleared deposit',
            10000000, 0, 30000000, 0, NULL
         )",
        [],
    ).expect("Insert future deposit");

    conn.execute(
        "INSERT INTO bank_transactions (
            bank_name, account_number, transaction_date, transaction_type,
            instrument_type, instrument_number, particulars,
            deposit_paisa, withdrawal_paisa, running_balance_paisa,
            is_cleared, clearance_date
         ) VALUES (
            'Meezan Bank Limited', '01020304050607', '2026-11-12', 'SUPPLIER_CHEQUE',
            'CHEQUE', 'CHQ-FUTURE-WDL', 'Future unpresented cheque',
            0, 5000000, 25000000, 0, NULL
         )",
        [],
    ).expect("Insert future withdrawal");

    // 5. Query BRS as of "2026-11-05"
    let brs_nov05 = AccountingService::get_bank_reconciliation(&conn, 1, "2026-11-05").expect("Generate BRS");

    assert_eq!(brs_nov05.book_balance_paisa, 20000000); // ₨ 200,000 book balance
    assert_eq!(brs_nov05.uncleared_deposits_count, 3, "Future deposit must be excluded!");
    assert_eq!(brs_nov05.uncleared_deposits_paisa, 15000000); // ₨ 150,000
    assert_eq!(brs_nov05.unpresented_withdrawals_count, 3, "Future withdrawal must be excluded!");
    assert_eq!(brs_nov05.unpresented_withdrawals_paisa, 8000000); // ₨ 80,000

    // Exact BRS Formula Verification:
    // Reconciled Statement Balance == Book Balance - Uncleared Deposits + Unpresented Cheques
    // 200,000 - 150,000 + 80,000 = 130,000 PKR (13,000,000 Paisas)
    let expected_reconciled = 20000000 - 15000000 + 8000000;
    assert_eq!(brs_nov05.reconciled_statement_balance_paisa, expected_reconciled);
    assert_eq!(brs_nov05.cleared_balance_paisa, expected_reconciled);

    // Verify all items in uncleared_transactions have is_cleared == false
    assert_eq!(brs_nov05.uncleared_transactions.len(), 6);
    for tx in &brs_nov05.uncleared_transactions {
        assert!(!tx.is_cleared, "Cleared transaction found in uncleared list!");
        assert!(tx.transaction_date.as_str() <= "2026-11-05", "Future transaction leaked into BRS!");
    }

    // 6. Query BRS as of "2026-11-12" (Future boundary inclusion)
    let brs_nov12 = AccountingService::get_bank_reconciliation(&conn, 1, "2026-11-12").expect("Generate BRS");
    assert_eq!(brs_nov12.uncleared_deposits_count, 4); // 3 + 1 future
    assert_eq!(brs_nov12.uncleared_deposits_paisa, 25000000); // 15M + 10M
    assert_eq!(brs_nov12.unpresented_withdrawals_count, 4); // 3 + 1 future
    assert_eq!(brs_nov12.unpresented_withdrawals_paisa, 13000000); // 8M + 5M

    let expected_nov12 = 20000000 - 25000000 + 13000000; // 8,000,000 paisa
    assert_eq!(brs_nov12.reconciled_statement_balance_paisa, expected_nov12);

    // 7. Non-existent Bank Account BRS Rejection
    let err_not_found = AccountingService::get_bank_reconciliation(&conn, 9999, "2026-11-05").unwrap_err();
    match err_not_found {
        AppError::NotFound { entity, id } => {
            assert_eq!(entity, "BankAccount");
            assert_eq!(id, "9999");
        }
        other => panic!("Expected NotFound error, got: {:?}", other),
    }
}

// ============================================================================
// STRESS TEST 3: COGS P&L INVARIANT & NON-OPERATING ISOLATION STRESS
// ============================================================================
#[test]
fn test_stress_cogs_pnl_and_isolation_invariants() {
    let mut conn = setup_test_db();
    let trade_date = "2026-11-06";

    // ------------------------------------------------------------------------
    // Step 1: Landed Cost Beverage Purchase
    // ------------------------------------------------------------------------
    // 100 crates of Next Cola 250ml Glass (Product 1, 24 bottles/crate):
    // Base Goods: 100 * ₨ 1,800 = ₨ 180,000 (18,000,000 paisa)
    // Inward Freight: ₨ 12,000 (1,200,000 paisa)
    // Unloading Labor: ₨ 4,800 (480,000 paisa)
    // Total Landed Cost = ₨ 196,800 (19,680,000 paisa)
    // Unit Landed Pack Cost = ₨ 1,968 / crate (196,800 paisa)
    // Base Unit Landed Cost = 196,800 / 24 = 8,200 paisa / bottle
    let purchase_res = PurchaseService::record_purchase(
        &mut conn,
        RecordPurchaseDto {
            supplier_id: 1, // Nextco Principal
            invoice_no: "PUR-LANDED-M4-01".into(),
            supplier_invoice_no: Some("NXT-RYK-9901".into()),
            purchase_date: trade_date.into(),
            items: vec![PurchaseItemInputDto {
                product_id: 1,
                pack_qty: 100,
                loose_qty: 0,
                unit_cost_paisa: 180000,
            }],
            freight_paisa: Some(1200000),
            unloading_labor_paisa: Some(480000),
            transit_tax_paisa: None,
            payment_status: "UNPAID".into(),
            payment_mode: Some("CREDIT".into()),
            paid_amount_paisa: Some(0),
            empty_crates_returned_to_factory: Some(0),
            notes: Some("Direct factory truck delivery with freight and labor".into()),
            user_id: Some(1),
        },
    ).expect("Record landed purchase");

    assert_eq!(purchase_res.total_landed_cost_paisa, 19680000);

    // Verify products table was updated with the capitalized landed cost
    let (p1_pack_rate, p1_stock): (i64, i64) = conn
        .query_row(
            "SELECT purchase_price_pack_paisa, current_stock_base_units FROM products WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query product 1");
    assert_eq!(p1_pack_rate, 196800, "Pack landed cost must be ₨ 1,968 (196,800 paisa)");
    assert_eq!(p1_stock, 12000 + 2400); // Initial 12,000 + 2,400 new bottles = 14,400

    // ------------------------------------------------------------------------
    // Step 2: Beverage Sales Invoices
    // ------------------------------------------------------------------------
    // Sale A: Cash Sale of 30 crates @ ₨ 2,400 = ₨ 72,000 (7,200,000 paisa)
    // Trade Discount = ₨ 2,000 (200,000 paisa)
    // Net Sale A = ₨ 70,000 (7,000,000 paisa)
    // Landed COGS = 30 * ₨ 1,968 = ₨ 59,040 (5,904,000 paisa)
    let sale_a = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: Some("INV-PNL-CASH-A".into()),
            invoice_date: Some(trade_date.into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 1,
                pack_qty: 30,
                loose_qty: 0,
                unit_price_paisa: Some(240000),
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: Some(200000),
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: None,
            crates_issued: Some(30),
            crates_returned: Some(30),
            admin_override_pin: None,
            user_id: Some(1),
        },
    ).expect("Create Cash Sale A");

    assert_eq!(sale_a.net_total_paisa, 7000000);

    // Sale B: Credit (Udhaar) Sale of 20 crates @ ₨ 2,400 = ₨ 48,000 (4,800,000 paisa)
    // Discount = 0
    // Net Sale B = ₨ 48,000 (4,800,000 paisa)
    // Landed COGS = 20 * ₨ 1,968 = ₨ 39,360 (3,936,000 paisa)
    let sale_b = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: Some("INV-PNL-CREDIT-B".into()),
            invoice_date: Some(trade_date.into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 1,
                pack_qty: 20,
                loose_qty: 0,
                unit_price_paisa: Some(240000),
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Credit,
            paid_amount_paisa: None,
            crates_issued: Some(20),
            crates_returned: Some(20),
            admin_override_pin: None,
            user_id: Some(1),
        },
    ).expect("Create Credit Sale B");

    assert_eq!(sale_b.net_total_paisa, 4800000);

    // Sale C: Cancelled Sale of 10 crates (Must be isolated and completely ignored in P&L)
    let sale_c = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: Some("INV-PNL-CANCEL-C".into()),
            invoice_date: Some(trade_date.into()),
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
            paid_amount_paisa: None,
            crates_issued: Some(10),
            crates_returned: Some(10),
            admin_override_pin: None,
            user_id: Some(1),
        },
    ).expect("Create Sale C");

    // Cancel Sale C
    CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: sale_c.invoice_id,
            reason: "Client order aborted".into(),
            cancelled_by: 1,
            admin_pin: Some("1234".into()),
        },
    ).expect("Cancel Sale C");

    // ------------------------------------------------------------------------
    // Step 3: Non-Operating Crate Deposits (Account 2100 - Current Liability)
    // ------------------------------------------------------------------------
    // Customer 1 deposits ₨ 12,000 (1,200,000 paisa)
    // Customer 2 deposits ₨ 6,000 (600,000 paisa)
    // Refund to Customer 1: ₨ 3,000 (300,000 paisa)
    // Net Customer Security Deposit Liability = ₨ 15,000 (1,500,000 paisa)
    conn.execute("UPDATE customers SET security_deposit_balance_paisa = 900000 WHERE id = 1", []).expect("Update cust 1 deposit");
    conn.execute("UPDATE customers SET security_deposit_balance_paisa = 600000 WHERE id = 2", []).expect("Update cust 2 deposit");

    // ------------------------------------------------------------------------
    // Step 4: Non-Operating Owner Equity (Accounts 3010 / 3030)
    // ------------------------------------------------------------------------
    // Capital Injection: ₨ 500,000 (50,000,000 paisa) - Balance Sheet Equity, NOT Revenue!
    conn.execute(
        "INSERT INTO cash_book (entry_date, transaction_type, cash_in_paisa, running_balance_paisa)
         VALUES (?1, 'OWNER_CAPITAL', 50000000, 50000000)",
        params![trade_date],
    ).expect("Insert owner capital");

    // Owner Drawings: ₨ 25,000 (2,500,000 paisa) - Equity reduction, NOT Operating Expense!
    conn.execute(
        "INSERT INTO cash_book (entry_date, transaction_type, cash_out_paisa, running_balance_paisa)
         VALUES (?1, 'OWNER_DRAWING', 2500000, 47500000)",
        params![trade_date],
    ).expect("Insert owner drawing");

    // ------------------------------------------------------------------------
    // Step 5: Operating Expenses
    // ------------------------------------------------------------------------
    // 1. Delivery Vehicle Fuel (Account 30, Code 6010): ₨ 5,000 (500,000 paisa)
    AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            expense_date: Some(trade_date.into()),
            account_id: 30, // 6010 Fuel
            amount_paisa: 500000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: Some("Shell Petrol Pump".into()),
            description: "Diesel for Van 1".into(),
            reference_number: Some("EXP-FUEL-01".into()),
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    ).expect("Record fuel expense");

    // 2. Vehicle Maintenance (Account 31, Code 6020): ₨ 3,500 (350,000 paisa)
    AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            expense_date: Some(trade_date.into()),
            account_id: 31, // 6020 Maintenance
            amount_paisa: 350000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: Some("Master Auto Workshop".into()),
            description: "Van brake shoes replacement".into(),
            reference_number: Some("EXP-MAINT-01".into()),
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    ).expect("Record maintenance expense");

    // 3. Office & Tea Expense (Account 37, Code 6080): ₨ 1,500 (150,000 paisa)
    AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            expense_date: Some(trade_date.into()),
            account_id: 37, // 6080 Office / Tea
            amount_paisa: 150000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: Some("Madina Hotel".into()),
            description: "Office tea and guest refreshments".into(),
            reference_number: Some("EXP-TEA-01".into()),
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    ).expect("Record tea expense");

    // Total Operating Expenses = 5,000 + 3,500 + 1,500 = ₨ 10,000 (1,000,000 paisa)

    // ------------------------------------------------------------------------
    // Step 6: Generate P&L Statement & Verify Strict Accounting Invariants
    // ------------------------------------------------------------------------
    let pnl = AccountingService::calculate_profit_and_loss(&conn, trade_date, trade_date).expect("Calculate P&L");

    // INVARIANT 1: Operating Revenue
    // Gross Sales = Sale A (7,200,000) + Sale B (4,800,000) = 12,000,000 paisa (Sale C cancelled excluded!)
    assert_eq!(pnl.revenue.gross_sales_paisa, 12000000, "Gross sales must exclude cancelled bill");
    assert_eq!(pnl.revenue.total_discounts_paisa, 200000);
    // Net Sales Revenue = 12,000,000 - 200,000 = 11,800,000 paisa (₨ 118,000)
    assert_eq!(pnl.revenue.net_sales_revenue_paisa, 11800000);
    assert_eq!(pnl.revenue.total_operating_revenue_paisa, 11800000);

    // INVARIANT 2: Cost of Goods Sold (COGS)
    // Landed COGS = Sale A (5,904,000) + Sale B (3,936,000) = 9,840,000 paisa (₨ 98,400)
    assert_eq!(pnl.cogs.total_cogs_paisa, 9840000);

    // INVARIANT 3: Gross Profit = Net Beverage Sales - Landed COGS
    // Gross Profit = 11,800,000 - 9,840,000 = 1,960,000 paisa (₨ 19,600)
    assert_eq!(pnl.gross_profit_paisa, 1960000);
    let expected_gross_margin = (1960000.0 / 11800000.0) * 100.0;
    assert!((pnl.gross_margin_percent - expected_gross_margin).abs() < 0.001);

    // INVARIANT 4: Operating Expenses Breakdown
    assert_eq!(pnl.total_operating_expenses_paisa, 1000000); // ₨ 10,000
    assert_eq!(pnl.operating_expenses.len(), 10, "All 10 COA expense categories represented in P&L");
    assert_eq!(pnl.operating_expenses.iter().filter(|e| e.total_amount_paisa > 0).count(), 3);
    // Verify each category
    let exp_map: std::collections::HashMap<i64, i64> = pnl.operating_expenses.iter().map(|e| (e.account_code, e.total_amount_paisa)).collect();
    assert_eq!(exp_map.get(&6010).copied(), Some(500000)); // Fuel
    assert_eq!(exp_map.get(&6020).copied(), Some(350000)); // Maintenance
    assert_eq!(exp_map.get(&6080).copied(), Some(150000)); // Tea

    // INVARIANT 5: Net Operating Profit = Gross Profit - Operating Expenses
    // Net Profit = 1,960,000 - 1,000,000 = 960,000 paisa (₨ 9,600)
    assert_eq!(pnl.net_operating_profit_paisa, 960000);
    let expected_net_margin = (960000.0 / 11800000.0) * 100.0;
    assert!((pnl.net_margin_percent - expected_net_margin).abs() < 0.001);

    // INVARIANT 6: STRICT NON-OPERATING ISOLATION
    // Crate Security Deposits (Account 2100) are balance sheet liabilities and MUST have ZERO impact on Revenue, COGS, and Expenses!
    assert_eq!(pnl.isolated_deposit_liability_paisa, 1500000, "Crate deposits isolated under balance sheet liabilities");
    // Owner Capital (Account 3010) is balance sheet equity and MUST have ZERO impact on Revenue!
    assert_eq!(pnl.isolated_owner_capital_injections_paisa, 50000000, "Owner capital isolated under balance sheet equity");
    // Confirm Owner Drawings (3030) did NOT leak into Operating Expenses
    assert_eq!(pnl.total_operating_expenses_paisa, 1000000);

    // ------------------------------------------------------------------------
    // Step 7: Zero-Sales Trading Day Boundary Test (Operating Loss)
    // ------------------------------------------------------------------------
    // On "2026-11-07": Zero sales, but ₨ 2,000 fuel expense
    AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            expense_date: Some("2026-11-07".into()),
            account_id: 30,
            amount_paisa: 200000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: None,
            description: "Generator fuel".into(),
            reference_number: None,
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    ).expect("Record zero-sales day expense");

    let pnl_zero_sales = AccountingService::calculate_profit_and_loss(&conn, "2026-11-07", "2026-11-07").expect("Calculate P&L zero sales");
    assert_eq!(pnl_zero_sales.revenue.net_sales_revenue_paisa, 0);
    assert_eq!(pnl_zero_sales.cogs.total_cogs_paisa, 0);
    assert_eq!(pnl_zero_sales.gross_profit_paisa, 0);
    assert_eq!(pnl_zero_sales.gross_margin_percent, 0.0);
    assert_eq!(pnl_zero_sales.total_operating_expenses_paisa, 200000);
    assert_eq!(pnl_zero_sales.net_operating_profit_paisa, -200000); // ₨ 2,000 operating loss
    assert_eq!(pnl_zero_sales.net_margin_percent, 0.0);
}

// ============================================================================
// STRESS TEST 4: GENERAL JOURNAL BALANCED DOUBLE-ENTRY INVARIANT STRESS
// ============================================================================
#[test]
fn test_stress_journal_balanced_invariant() {
    let mut conn = setup_test_db();
    let tx = conn.transaction().expect("Start transaction");

    // ------------------------------------------------------------------------
    // Part A: Discrepancy Rejections (Sum Dr != Sum Cr)
    // ------------------------------------------------------------------------
    // 1. Off-by-1-Paisa discrepancy (Dr 100,001 != Cr 100,000)
    let unbalanced_1paisa = CreateJournalEntryInput {
        entry_date: "2026-11-06".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "1 paisa discrepancy".into(),
        lines: vec![
            JournalLineInput {
                account_id: 2, // 1010 Cash
                debit_paisa: 100001,
                credit_paisa: 0,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 8, // 1200 Receivable
                debit_paisa: 0,
                credit_paisa: 100000,
                line_narration: None,
                customer_id: Some(1),
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };

    let err_1p = AccountingService::post_journal_entry(&tx, unbalanced_1paisa).unwrap_err();
    match err_1p {
        AppError::Validation(msg) => {
            assert!(msg.contains("Unbalanced journal entry rejected"), "Message was: {}", msg);
            assert!(msg.contains("100001") && msg.contains("100000"));
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // 2. Reverse off-by-1-Paisa discrepancy (Dr 50,000 != Cr 50,001)
    let unbalanced_rev = CreateJournalEntryInput {
        entry_date: "2026-11-06".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Reverse 1 paisa discrepancy".into(),
        lines: vec![
            JournalLineInput {
                account_id: 2,
                debit_paisa: 50000,
                credit_paisa: 0,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 8,
                debit_paisa: 0,
                credit_paisa: 50001,
                line_narration: None,
                customer_id: Some(1),
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };

    let err_rev = AccountingService::post_journal_entry(&tx, unbalanced_rev).unwrap_err();
    match err_rev {
        AppError::Validation(msg) => {
            assert!(msg.contains("Unbalanced journal entry rejected"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // 3. Gross discrepancy (Dr 500,000 != Cr 200,000)
    let unbalanced_gross = CreateJournalEntryInput {
        entry_date: "2026-11-06".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Gross discrepancy".into(),
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
                credit_paisa: 200000,
                line_narration: None,
                customer_id: Some(1),
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };

    let err_gross = AccountingService::post_journal_entry(&tx, unbalanced_gross).unwrap_err();
    match err_gross {
        AppError::Validation(msg) => {
            assert!(msg.contains("Unbalanced journal entry rejected"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // ------------------------------------------------------------------------
    // Part B: Zero and Negative Amount Rejections
    // ------------------------------------------------------------------------
    // Zero amount JV (Dr 0, Cr 0)
    let zero_jv = CreateJournalEntryInput {
        entry_date: "2026-11-06".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Zero amount JV".into(),
        lines: vec![
            JournalLineInput {
                account_id: 2,
                debit_paisa: 0,
                credit_paisa: 0,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 8,
                debit_paisa: 0,
                credit_paisa: 0,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };

    let err_zero = AccountingService::post_journal_entry(&tx, zero_jv).unwrap_err();
    match err_zero {
        AppError::Validation(msg) => {
            assert!(msg.contains("total debit must be positive"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // ------------------------------------------------------------------------
    // Part C: Structural Line Violations
    // ------------------------------------------------------------------------
    // 1. Line with BOTH debit > 0 and credit > 0
    let both_dr_cr = CreateJournalEntryInput {
        entry_date: "2026-11-06".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Line with both dr and cr".into(),
        lines: vec![
            JournalLineInput {
                account_id: 2,
                debit_paisa: 100000,
                credit_paisa: 50000, // ILLEGAL!
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 8,
                debit_paisa: 0,
                credit_paisa: 50000,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };

    let err_both = AccountingService::post_journal_entry(&tx, both_dr_cr).unwrap_err();
    match err_both {
        AppError::Validation(msg) => {
            assert!(msg.contains("exactly one of debit_paisa"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // 2. Empty lines array
    let empty_lines = CreateJournalEntryInput {
        entry_date: "2026-11-06".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Empty lines".into(),
        lines: vec![],
        created_by: Some(1),
    };

    let err_empty = AccountingService::post_journal_entry(&tx, empty_lines).unwrap_err();
    match err_empty {
        AppError::Validation(msg) => {
            assert!(msg.contains("0 lines"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // 3. Non-existent Chart of Accounts ID (88888)
    let non_existent_coa = CreateJournalEntryInput {
        entry_date: "2026-11-06".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Bogus COA account".into(),
        lines: vec![
            JournalLineInput {
                account_id: 88888,
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

    let err_coa = AccountingService::post_journal_entry(&tx, non_existent_coa).unwrap_err();
    match err_coa {
        AppError::Validation(msg) => {
            assert!(msg.contains("not found in Chart of Accounts"), "Message was: {}", msg);
        }
        other => panic!("Expected Validation error, got: {:?}", other),
    }

    // ------------------------------------------------------------------------
    // Part D: Compound Balanced Multi-Line Journal Entry (6 Lines)
    // ------------------------------------------------------------------------
    // Dr 1010 Cash:             25,000 paisa
    // Dr 1020 Bank:             35,000 paisa
    // Dr 6010 Fuel Expense:     15,000 paisa
    // Dr 6080 Office Expense:    5,000 paisa
    // Cr 1200 Receivable:       50,000 paisa
    // Cr 3010 Owner Capital:    30,000 paisa
    // Total Debits = 80,000 paisa == Total Credits = 80,000 paisa!
    let compound_jv = CreateJournalEntryInput {
        entry_date: "2026-11-06".into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: Some("SETTLEMENT".into()),
        reference_doc_id: Some(101),
        narration: "Compound 6-line balanced settlement entry".into(),
        lines: vec![
            JournalLineInput {
                account_id: 2, // 1010 Cash
                debit_paisa: 25000,
                credit_paisa: 0,
                line_narration: Some("Cash portion".into()),
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 3, // 1020 Bank
                debit_paisa: 35000,
                credit_paisa: 0,
                line_narration: Some("Bank transfer portion".into()),
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 30, // 6010 Fuel
                debit_paisa: 15000,
                credit_paisa: 0,
                line_narration: Some("Fuel adjustment".into()),
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 37, // 6080 Office
                debit_paisa: 5000,
                credit_paisa: 0,
                line_narration: Some("Office adjustment".into()),
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 8, // 1200 Receivable
                debit_paisa: 0,
                credit_paisa: 50000,
                line_narration: Some("Customer credit".into()),
                customer_id: Some(1),
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 19, // 3010 Owner Capital
                debit_paisa: 0,
                credit_paisa: 30000,
                line_narration: Some("Owner capital share".into()),
                customer_id: None,
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };

    let jv_id = AccountingService::post_journal_entry(&tx, compound_jv).expect("Post compound JV");
    assert!(jv_id > 0);

    // Verify journal_entries record
    let (is_bal, voucher_type): (bool, String) = tx
        .query_row(
            "SELECT is_balanced, voucher_type FROM journal_entries WHERE id = ?1",
            params![jv_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query journal entry");
    assert!(is_bal);
    assert_eq!(voucher_type, "MANUAL");

    // Verify line count and exact debit/credit mathematical sums
    let (line_cnt, total_dr, total_cr): (usize, i64, i64) = tx
        .query_row(
            "SELECT COUNT(*), SUM(debit_paisa), SUM(credit_paisa) FROM journal_lines WHERE entry_id = ?1",
            params![jv_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .expect("Query JV lines sum");

    assert_eq!(line_cnt, 6);
    assert_eq!(total_dr, 80000);
    assert_eq!(total_cr, 80000);
}
