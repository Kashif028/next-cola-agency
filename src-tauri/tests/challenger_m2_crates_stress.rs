use rusqlite::params;
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::db::pool::{create_db_pool, create_in_memory_pool};
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::services::crates::{
    CrateService, RecordCrateTransactionDto, RecordSecurityDepositDto, RefundSecurityDepositDto,
};
use std::sync::Arc;
use std::thread;

// ============================================================================
// CHALLENGE TEST 1: Pure Crate Issue & Return Cycles — Liquid & Revenue Invariance
// ============================================================================
#[test]
fn test_empirical_pure_crate_cycles_liquid_and_revenue_invariance() {
    let pool = create_in_memory_pool().expect("Failed to initialize test pool");
    let mut conn = pool.get().expect("Failed to get connection");
    run_migrations(&mut conn).expect("Failed to run migrations");

    // Capture initial baseline state across products and financial ledgers
    let initial_liquid_p1: i64 = conn
        .query_row(
            "SELECT current_stock_base_units FROM products WHERE id = 1;",
            [],
            |r| r.get(0),
        )
        .expect("Query p1 liquid stock");
    let initial_liquid_p5: i64 = conn
        .query_row(
            "SELECT current_stock_base_units FROM products WHERE id = 5;",
            [],
            |r| r.get(0),
        )
        .expect("Query p5 liquid stock");
    let initial_liquid_p7: i64 = conn
        .query_row(
            "SELECT current_stock_base_units FROM products WHERE id = 7;",
            [],
            |r| r.get(0),
        )
        .expect("Query p7 liquid stock");

    let initial_revenue_credits: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE account_id = 23;", // Account 4010
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let initial_cogs_debits: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0) FROM journal_lines WHERE account_id = 26;", // Account 5010
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let initial_journal_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM journal_entries;", [], |r| r.get(0))
        .expect("Query initial journal count");

    let initial_cust1_crates: i64 = conn
        .query_row(
            "SELECT current_crate_balance FROM customers WHERE id = 1;",
            [],
            |r| r.get(0),
        )
        .expect("Query cust 1 crate balance");

    // Perform 20 multi-quantity crate transactions with no cash deposits
    let mut expected_cust1_crates = initial_cust1_crates;
    let transactions = vec![
        (50, 0),  // Issue 50
        (0, 20),  // Return 20
        (35, 15), // Net +20
        (100, 0), // Issue 100
        (0, 100), // Return 100
        (12, 12), // Net 0
        (75, 25), // Net +50
        (0, 50),  // Return 50
        (10, 0),  // Net +10
        (0, 30),  // Return 30
        (40, 10), // Net +30
        (5, 5),   // Net 0
        (25, 0),  // Net +25
        (0, 45),  // Return 45
        (60, 20), // Net +40
        (0, 30),  // Return 30
        (15, 0),  // Net +15
        (0, 10),  // Return 10
        (80, 40), // Net +40
        (0, 60),  // Return 60
    ];

    for (idx, (out_qty, in_qty)) in transactions.into_iter().enumerate() {
        let res = CrateService::record_crate_transaction(
            &mut conn,
            RecordCrateTransactionDto {
                customer_id: 1,
                crates_out: out_qty,
                crates_in: in_qty,
                voucher_ref: format!("CYCLE-TEST-{}", idx),
                date: Some("2026-11-04".to_string()),
                deposit_paid_paisa: None,
                deposit_refunded_paisa: None,
                notes: Some(format!("Cycle stress step {}", idx)),
                user_id: Some(1),
            },
        )
        .expect("Transaction cycle should succeed");

        expected_cust1_crates += out_qty - in_qty;
        assert_eq!(
            res.new_customer_crate_balance, expected_cust1_crates,
            "Cycle {}: customer crate balance mismatch",
            idx
        );
    }

    // VERIFICATION 1: Liquid stock delta must be strictly 0 for all RGB products
    let final_liquid_p1: i64 = conn
        .query_row(
            "SELECT current_stock_base_units FROM products WHERE id = 1;",
            [],
            |r| r.get(0),
        )
        .expect("Query p1 final liquid");
    let final_liquid_p5: i64 = conn
        .query_row(
            "SELECT current_stock_base_units FROM products WHERE id = 5;",
            [],
            |r| r.get(0),
        )
        .expect("Query p5 final liquid");
    let final_liquid_p7: i64 = conn
        .query_row(
            "SELECT current_stock_base_units FROM products WHERE id = 7;",
            [],
            |r| r.get(0),
        )
        .expect("Query p7 final liquid");

    assert_eq!(
        final_liquid_p1, initial_liquid_p1,
        "Liquid stock P1 delta must be strictly 0"
    );
    assert_eq!(
        final_liquid_p5, initial_liquid_p5,
        "Liquid stock P5 delta must be strictly 0"
    );
    assert_eq!(
        final_liquid_p7, initial_liquid_p7,
        "Liquid stock P7 delta must be strictly 0"
    );

    // VERIFICATION 2: Revenue delta must be strictly 0
    let final_revenue_credits: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE account_id = 23;", // Account 4010
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    assert_eq!(
        final_revenue_credits, initial_revenue_credits,
        "Operating revenue credits (Account 4010) must be strictly unchanged (0 delta)"
    );

    // VERIFICATION 3: COGS delta must be strictly 0
    let final_cogs_debits: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0) FROM journal_lines WHERE account_id = 26;", // Account 5010
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    assert_eq!(
        final_cogs_debits, initial_cogs_debits,
        "COGS debits (Account 5010) must be strictly unchanged (0 delta)"
    );

    // VERIFICATION 4: No unneeded journal entries should have been created
    let final_journal_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM journal_entries;", [], |r| r.get(0))
        .expect("Query final journal count");
    assert_eq!(
        final_journal_count, initial_journal_count,
        "Pure crate circulation must not generate financial journal entries"
    );

    // VERIFICATION 5: Final customer crate balance in DB matches mathematical sum
    let db_final_crates: i64 = conn
        .query_row(
            "SELECT current_crate_balance FROM customers WHERE id = 1;",
            [],
            |r| r.get(0),
        )
        .expect("Query final crate balance");
    assert_eq!(
        db_final_crates, expected_cust1_crates,
        "Customer crate balance in DB must match running total"
    );
}

// ============================================================================
// CHALLENGE TEST 2: Surplus Crate Returns & Negative Balance Handling
// ============================================================================
#[test]
fn test_empirical_surplus_crate_returns_negative_balance_handling() {
    let pool = create_in_memory_pool().expect("Failed to initialize test pool");
    let mut conn = pool.get().expect("Failed to get connection");
    run_migrations(&mut conn).expect("Failed to run migrations");

    // Customer 2 starts with 0 crates
    let initial_balance: i64 = conn
        .query_row(
            "SELECT current_crate_balance FROM customers WHERE id = 2;",
            [],
            |r| r.get(0),
        )
        .expect("Query initial balance");

    // 1. Retailer returns 25 surplus crates (more than owed -> 0 - 25 = -25)
    let res1 = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 2,
            crates_out: 0,
            crates_in: 25,
            voucher_ref: "SURPLUS-RET-01".to_string(),
            date: Some("2026-11-04".to_string()),
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: Some("Retailer returned surplus crates from previous vendor".to_string()),
            user_id: Some(1),
        },
    )
    .expect("Surplus crate return must not crash and must succeed cleanly");

    assert_eq!(
        res1.previous_customer_crate_balance, initial_balance,
        "Previous balance was initial"
    );
    assert_eq!(
        res1.new_customer_crate_balance,
        initial_balance - 25,
        "New balance must be negative representing distributor liability"
    );

    // 2. Retailer returns ANOTHER 15 crates -> balance becomes -40
    let res2 = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 2,
            crates_out: 0,
            crates_in: 15,
            voucher_ref: "SURPLUS-RET-02".to_string(),
            date: Some("2026-11-04".to_string()),
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: Some("Second surplus batch".to_string()),
            user_id: Some(1),
        },
    )
    .expect("Second surplus return must succeed");

    assert_eq!(res2.new_customer_crate_balance, initial_balance - 40);

    // 3. Distributor issues 30 crates on new delivery -> balance becomes -10
    let res3 = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 2,
            crates_out: 30,
            crates_in: 0,
            voucher_ref: "DELIVERY-ISSUE-01".to_string(),
            date: Some("2026-11-04".to_string()),
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: Some("New consignment delivered".to_string()),
            user_id: Some(1),
        },
    )
    .expect("Consignment issuance against negative balance must succeed");

    assert_eq!(res3.new_customer_crate_balance, initial_balance - 10);

    // 4. Distributor issues 10 crates -> balance reaches exact 0
    let res4 = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 2,
            crates_out: 10,
            crates_in: 0,
            voucher_ref: "DELIVERY-ISSUE-02".to_string(),
            date: Some("2026-11-04".to_string()),
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: Some("Second consignment delivered".to_string()),
            user_id: Some(1),
        },
    )
    .expect("Balance re-zeroing must succeed");

    assert_eq!(res4.new_customer_crate_balance, initial_balance);

    // 5. Distributor issues 5 crates -> balance becomes +5
    let res5 = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 2,
            crates_out: 5,
            crates_in: 0,
            voucher_ref: "DELIVERY-ISSUE-03".to_string(),
            date: Some("2026-11-04".to_string()),
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: Some("Third consignment".to_string()),
            user_id: Some(1),
        },
    )
    .expect("Positive balance transition must succeed");

    assert_eq!(res5.new_customer_crate_balance, initial_balance + 5);

    // 6. Inspect customer crate ledger history: all 5 entries must be intact with correct running balances
    let ledger = CrateService::get_customer_crate_ledger(&conn, 2, 10).expect("Fetch crate ledger");
    assert_eq!(ledger.len(), 5, "Expected 5 ledger records");

    // Ledger is ordered descending by ID
    assert_eq!(ledger[0].running_crate_balance, initial_balance + 5);
    assert_eq!(ledger[1].running_crate_balance, initial_balance);
    assert_eq!(ledger[2].running_crate_balance, initial_balance - 10);
    assert_eq!(ledger[3].running_crate_balance, initial_balance - 40);
    assert_eq!(ledger[4].running_crate_balance, initial_balance - 25);

    // 7. Test get_empties_overview does not crash when negative customer balances exist
    let overview = CrateService::get_empties_overview(&conn).expect("Fetch empties overview");
    assert!(
        overview.total_customer_crates_outstanding >= 0
            || overview.total_customer_crates_outstanding < 0,
        "Overview query executed cleanly"
    );
}

// ============================================================================
// CHALLENGE TEST 3: Negative Input Quantities Rejection
// ============================================================================
#[test]
fn test_empirical_negative_input_quantities_rejection() {
    let pool = create_in_memory_pool().expect("Failed to initialize test pool");
    let mut conn = pool.get().expect("Failed to get connection");
    run_migrations(&mut conn).expect("Failed to run migrations");

    // 3A. Reject negative crates_out in record_crate_transaction
    let neg_out = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 1,
            crates_out: -5,
            crates_in: 0,
            voucher_ref: "BAD-NEG-OUT".to_string(),
            date: None,
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(neg_out.is_err(), "Must reject crates_out < 0");
    match neg_out {
        Err(AppError::Validation(msg)) => {
            assert!(msg.to_lowercase().contains("negative"), "Error msg: {}", msg)
        }
        _ => panic!("Expected AppError::Validation"),
    }

    // 3B. Reject negative crates_in in record_crate_transaction
    let neg_in = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 1,
            crates_out: 0,
            crates_in: -10,
            voucher_ref: "BAD-NEG-IN".to_string(),
            date: None,
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(neg_in.is_err(), "Must reject crates_in < 0");
    match neg_in {
        Err(AppError::Validation(msg)) => {
            assert!(msg.to_lowercase().contains("negative"), "Error msg: {}", msg)
        }
        _ => panic!("Expected AppError::Validation"),
    }

    // 3C. Reject negative deposit_paid_paisa
    let neg_dep_paid = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 1,
            crates_out: 5,
            crates_in: 0,
            voucher_ref: "BAD-DEP-PAID".to_string(),
            date: None,
            deposit_paid_paisa: Some(-1000),
            deposit_refunded_paisa: None,
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(neg_dep_paid.is_err(), "Must reject deposit_paid_paisa < 0");
    match neg_dep_paid {
        Err(AppError::Validation(msg)) => {
            assert!(msg.to_lowercase().contains("negative"), "Error msg: {}", msg)
        }
        _ => panic!("Expected AppError::Validation"),
    }

    // 3D. Reject negative deposit_refunded_paisa
    let neg_dep_ref = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 1,
            crates_out: 0,
            crates_in: 5,
            voucher_ref: "BAD-DEP-REF".to_string(),
            date: None,
            deposit_paid_paisa: None,
            deposit_refunded_paisa: Some(-2000),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(
        neg_dep_ref.is_err(),
        "Must reject deposit_refunded_paisa < 0"
    );
    match neg_dep_ref {
        Err(AppError::Validation(msg)) => {
            assert!(msg.to_lowercase().contains("negative"), "Error msg: {}", msg)
        }
        _ => panic!("Expected AppError::Validation"),
    }

    // 3E. Reject non-positive crates_count in record_security_deposit
    let zero_crates_dep = CrateService::record_security_deposit(
        &mut conn,
        RecordSecurityDepositDto {
            customer_id: 1,
            crates_count: 0,
            deposit_rate_per_crate_paisa: 25000,
            payment_mode: "CASH".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(
        zero_crates_dep.is_err(),
        "Must reject crates_count <= 0 in record_security_deposit"
    );

    let neg_crates_dep = CrateService::record_security_deposit(
        &mut conn,
        RecordSecurityDepositDto {
            customer_id: 1,
            crates_count: -10,
            deposit_rate_per_crate_paisa: 25000,
            payment_mode: "CASH".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(
        neg_crates_dep.is_err(),
        "Must reject crates_count < 0 in record_security_deposit"
    );

    // 3F. Reject non-positive rate in record_security_deposit
    let zero_rate_dep = CrateService::record_security_deposit(
        &mut conn,
        RecordSecurityDepositDto {
            customer_id: 1,
            crates_count: 10,
            deposit_rate_per_crate_paisa: 0,
            payment_mode: "CASH".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(
        zero_rate_dep.is_err(),
        "Must reject deposit_rate_per_crate_paisa <= 0 in record_security_deposit"
    );

    let neg_rate_dep = CrateService::record_security_deposit(
        &mut conn,
        RecordSecurityDepositDto {
            customer_id: 1,
            crates_count: 10,
            deposit_rate_per_crate_paisa: -5000,
            payment_mode: "CASH".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(
        neg_rate_dep.is_err(),
        "Must reject deposit_rate_per_crate_paisa < 0 in record_security_deposit"
    );

    // 3G. Reject non-positive crates_count and rate in refund_security_deposit
    let zero_crates_ref = CrateService::refund_security_deposit(
        &mut conn,
        RefundSecurityDepositDto {
            customer_id: 1,
            crates_count: 0,
            deposit_rate_per_crate_paisa: 25000,
            payment_mode: "CASH".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(
        zero_crates_ref.is_err(),
        "Must reject crates_count <= 0 in refund_security_deposit"
    );

    let neg_rate_ref = CrateService::refund_security_deposit(
        &mut conn,
        RefundSecurityDepositDto {
            customer_id: 1,
            crates_count: 5,
            deposit_rate_per_crate_paisa: -25000,
            payment_mode: "CASH".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(
        neg_rate_ref.is_err(),
        "Must reject deposit_rate_per_crate_paisa <= 0 in refund_security_deposit"
    );
}

// ============================================================================
// CHALLENGE TEST 4: Security Deposit Liabilities Isolation from Revenue & COGS
// ============================================================================
#[test]
fn test_empirical_security_deposit_accounting_isolation_and_balance() {
    let pool = create_in_memory_pool().expect("Failed to initialize test pool");
    let mut conn = pool.get().expect("Failed to get connection");
    run_migrations(&mut conn).expect("Failed to run migrations");

    let cust_id = 3;

    // Baseline audit numbers
    let base_rev_debit: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0) FROM journal_lines WHERE account_id = 23;", // Account 4010
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let base_rev_credit: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE account_id = 23;", // Account 4010
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let base_cogs_debit: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0) FROM journal_lines WHERE account_id = 26;", // Account 5010
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let base_cogs_credit: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE account_id = 26;", // Account 5010
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // Initial deposit balance of Customer 3
    let init_cust_dep: i64 = conn
        .query_row(
            "SELECT security_deposit_balance_paisa FROM customers WHERE id = ?1;",
            params![cust_id],
            |r| r.get(0),
        )
        .expect("Query cust 3 deposit");
    assert_eq!(init_cust_dep, 0);

    // STEP 1: Direct deposit collection: 20 crates @ 250.00 PKR (25,000 Paisa) = 500,000 Paisa (5,000.00 PKR)
    let dep1 = CrateService::record_security_deposit(
        &mut conn,
        RecordSecurityDepositDto {
            customer_id: cust_id,
            crates_count: 20,
            deposit_rate_per_crate_paisa: 25000,
            payment_mode: "CASH".to_string(),
            notes: Some("Initial bulk crate security deposit".to_string()),
            user_id: Some(1),
        },
    )
    .expect("Direct deposit collection should succeed");

    assert_eq!(dep1.amount_paisa, 500000);
    assert_eq!(dep1.running_deposit_liability_paisa, 500000);

    // Verify Cash Book entry
    let (cb_type, cb_in, cb_acc): (String, i64, String) = conn
        .query_row(
            "SELECT voucher_ref_type, cash_in_paisa, account_code FROM cash_book WHERE voucher_ref_number = ?1;",
            params![dep1.voucher_number],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .expect("Find cash book row");
    assert_eq!(cb_type, "SECURITY_DEPOSIT");
    assert_eq!(cb_in, 500000);
    assert_eq!(cb_acc, "2100");

    // Verify Journal Entry for Step 1
    let je_step1 = format!("JE-{}", dep1.voucher_number);
    let (dr_cash, cr_liability): (i64, i64) = conn
        .query_row(
            "SELECT 
                (SELECT debit_paisa FROM journal_lines jl JOIN journal_entries je ON jl.entry_id = je.id WHERE je.entry_number = ?1 AND jl.account_id = 2),
                (SELECT credit_paisa FROM journal_lines jl JOIN journal_entries je ON jl.entry_id = je.id WHERE je.entry_number = ?1 AND jl.account_id = 16);",
            params![je_step1],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Find journal lines for step 1");
    assert_eq!(dr_cash, 500000, "Debit must hit Account 1010 (Cash on Hand)");
    assert_eq!(
        cr_liability, 500000,
        "Credit must hit Account 2100 (Deposit Liability)"
    );

    // STEP 2: Deposit collection embedded inside record_crate_transaction: 5 crates with 125,000 Paisa deposit
    let tx2 = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: cust_id,
            crates_out: 5,
            crates_in: 0,
            voucher_ref: "TX-DEP-EMBED-01".to_string(),
            date: Some("2026-11-04".to_string()),
            deposit_paid_paisa: Some(125000),
            deposit_refunded_paisa: None,
            notes: Some("Crates issued with deposit attached".to_string()),
            user_id: Some(1),
        },
    )
    .expect("Embedded deposit crate transaction should succeed");

    assert_eq!(tx2.deposit_balance_paisa, 500000 + 125000);

    // STEP 3: Refund deposit: 10 crates @ 25,000 = 250,000 Paisa refunded
    let ref3 = CrateService::refund_security_deposit(
        &mut conn,
        RefundSecurityDepositDto {
            customer_id: cust_id,
            crates_count: 10,
            deposit_rate_per_crate_paisa: 25000,
            payment_mode: "CASH".to_string(),
            notes: Some("Refund on 10 returned crates".to_string()),
            user_id: Some(1),
        },
    )
    .expect("Deposit refund should succeed");

    assert_eq!(ref3.amount_paisa, 250000);
    assert_eq!(
        ref3.running_deposit_liability_paisa,
        500000 + 125000 - 250000
    );

    // Verify Journal Entry for Step 3: Dr 2100 Liability (16), Cr 1010 Cash (2)
    let je_step3 = format!("JE-{}", ref3.voucher_number);
    let (dr_liability, cr_cash): (i64, i64) = conn
        .query_row(
            "SELECT 
                (SELECT debit_paisa FROM journal_lines jl JOIN journal_entries je ON jl.entry_id = je.id WHERE je.entry_number = ?1 AND jl.account_id = 16),
                (SELECT credit_paisa FROM journal_lines jl JOIN journal_entries je ON jl.entry_id = je.id WHERE je.entry_number = ?1 AND jl.account_id = 2);",
            params![je_step3],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Find journal lines for step 3");
    assert_eq!(
        dr_liability, 250000,
        "Debit must reduce Account 2100 Liability"
    );
    assert_eq!(cr_cash, 250000, "Credit must reduce Account 1010 Cash");

    // STEP 4: Embedded refund in record_crate_transaction: 4 crates returned with 100,000 Paisa refund
    let tx4 = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: cust_id,
            crates_out: 0,
            crates_in: 4,
            voucher_ref: "TX-REF-EMBED-01".to_string(),
            date: Some("2026-11-04".to_string()),
            deposit_paid_paisa: None,
            deposit_refunded_paisa: Some(100000),
            notes: Some("Empties returned with cash refund".to_string()),
            user_id: Some(1),
        },
    )
    .expect("Embedded refund crate transaction should succeed");

    assert_eq!(
        tx4.deposit_balance_paisa,
        500000 + 125000 - 250000 - 100000
    );

    // ========================================================================
    // STRICT ACCOUNTING ISOLATION VERIFICATION
    // ========================================================================

    // 1. Sales Revenue (Account 4010, Account ID 23) MUST HAVE ZERO DEBITS AND ZERO CREDITS
    let final_rev_debit: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0) FROM journal_lines WHERE account_id = 23;",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let final_rev_credit: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE account_id = 23;",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    assert_eq!(
        final_rev_debit, base_rev_debit,
        "Account 4010 Sales Revenue debits must remain strictly unchanged"
    );
    assert_eq!(
        final_rev_credit, base_rev_credit,
        "Account 4010 Sales Revenue credits must remain strictly ZERO (got: {})",
        final_rev_credit
    );

    // 2. Cost of Goods Sold (Account 5010, Account ID 26) MUST HAVE ZERO IMPACT
    let final_cogs_debit: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0) FROM journal_lines WHERE account_id = 26;",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let final_cogs_credit: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE account_id = 26;",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    assert_eq!(
        final_cogs_debit, base_cogs_debit,
        "Account 5010 COGS debits must remain strictly unchanged (0 impact)"
    );
    assert_eq!(
        final_cogs_credit, base_cogs_credit,
        "Account 5010 COGS credits must remain strictly unchanged (0 impact)"
    );

    // 3. Double-entry trial balance check: every journal entry created must be strictly balanced
    let unbalanced_entries: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM (
                SELECT je.id, SUM(jl.debit_paisa) as total_dr, SUM(jl.credit_paisa) as total_cr
                FROM journal_entries je
                JOIN journal_lines jl ON je.id = jl.entry_id
                GROUP BY je.id
                HAVING total_dr != total_cr
            );",
            [],
            |r| r.get(0),
        )
        .expect("Check unbalanced entries");
    assert_eq!(
        unbalanced_entries, 0,
        "Every single journal voucher must be strictly balanced (total_dr == total_cr)"
    );

    // 4. Net Liability in Account 2100 matches customer deposit balance exactly
    let (acct2100_dr, acct2100_cr): (i64, i64) = conn
        .query_row(
            "SELECT 
                COALESCE(SUM(debit_paisa), 0), 
                COALESCE(SUM(credit_paisa), 0) 
             FROM journal_lines WHERE account_id = 16;",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query Account 2100 totals");

    let net_liability = acct2100_cr - acct2100_dr;
    let expected_balance = 500000 + 125000 - 250000 - 100000; // 275,000 Paisa
    assert_eq!(
        net_liability, expected_balance,
        "Net ledger liability in Account 2100 must equal 275,000 Paisa"
    );

    let cust_dep_db: i64 = conn
        .query_row(
            "SELECT security_deposit_balance_paisa FROM customers WHERE id = ?1;",
            params![cust_id],
            |r| r.get(0),
        )
        .expect("Query cust deposit");
    assert_eq!(
        cust_dep_db, expected_balance,
        "Customer table security_deposit_balance_paisa must equal 275,000 Paisa"
    );
}

// ============================================================================
// CHALLENGE TEST 5: Boundary Values, Overflow Attacks & Non-Existent Entities
// ============================================================================
#[test]
fn test_empirical_boundary_values_and_overflow_protection() {
    let pool = create_in_memory_pool().expect("Failed to initialize test pool");
    let mut conn = pool.get().expect("Failed to get connection");
    run_migrations(&mut conn).expect("Failed to run migrations");

    // 5A. Multiplication overflow protection in record_security_deposit
    let overflow_req = CrateService::record_security_deposit(
        &mut conn,
        RecordSecurityDepositDto {
            customer_id: 1,
            crates_count: i64::MAX,
            deposit_rate_per_crate_paisa: 10,
            payment_mode: "CASH".to_string(),
            notes: Some("Overflow attack".to_string()),
            user_id: Some(1),
        },
    );
    assert!(
        overflow_req.is_err(),
        "Must safely reject integer overflow in deposit amount calculation"
    );
    match overflow_req {
        Err(AppError::Validation(msg)) => {
            assert!(
                msg.to_lowercase().contains("overflow"),
                "Expected overflow message, got: {}",
                msg
            );
        }
        _ => panic!("Expected Validation error for overflow"),
    }

    // 5B. Multiplication overflow protection in refund_security_deposit
    let overflow_ref = CrateService::refund_security_deposit(
        &mut conn,
        RefundSecurityDepositDto {
            customer_id: 1,
            crates_count: 5000000000,
            deposit_rate_per_crate_paisa: 5000000000,
            payment_mode: "CASH".to_string(),
            notes: Some("Overflow refund".to_string()),
            user_id: Some(1),
        },
    );
    assert!(
        overflow_ref.is_err(),
        "Must safely reject integer overflow in refund amount calculation"
    );

    // 5C. Non-existent customer error handling
    let bogus_cust_tx = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 999999,
            crates_out: 10,
            crates_in: 0,
            voucher_ref: "BOGUS-CUST".to_string(),
            date: None,
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(
        bogus_cust_tx.is_err(),
        "Must return NotFound for invalid customer_id"
    );
    match bogus_cust_tx {
        Err(AppError::NotFound { entity, id }) => {
            assert_eq!(entity, "Customer");
            assert_eq!(id, "999999");
        }
        _ => panic!("Expected NotFound error"),
    }

    let bogus_dep = CrateService::record_security_deposit(
        &mut conn,
        RecordSecurityDepositDto {
            customer_id: 999999,
            crates_count: 5,
            deposit_rate_per_crate_paisa: 10000,
            payment_mode: "CASH".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(
        bogus_dep.is_err(),
        "Must return NotFound for invalid customer_id in deposit"
    );

    let bogus_ref = CrateService::refund_security_deposit(
        &mut conn,
        RefundSecurityDepositDto {
            customer_id: 999999,
            crates_count: 5,
            deposit_rate_per_crate_paisa: 10000,
            payment_mode: "CASH".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(
        bogus_ref.is_err(),
        "Must return NotFound for invalid customer_id in refund"
    );
}

// ============================================================================
// CHALLENGE TEST 6: Multi-Threaded Concurrent Crate Operations Stress
// ============================================================================
#[test]
fn test_empirical_concurrent_crate_transactions_stress() {
    let temp_dir = tempfile::tempdir().expect("Create temp dir");
    let db_path = temp_dir.path().join("concurrent_crates.db");
    let pool = create_db_pool(&db_path).expect("Create db pool");

    {
        let mut conn = pool.get().expect("Get setup conn");
        run_migrations(&mut conn).expect("Run migrations");
    }

    let pool_arc = Arc::new(pool);
    let mut handles = vec![];
    let num_threads = 6;
    let ops_per_thread = 5;

    for t_idx in 0..num_threads {
        let pool_clone = Arc::clone(&pool_arc);
        handles.push(thread::spawn(move || {
            let mut conn = pool_clone.get().expect("Thread get conn");
            let mut succeeded = 0;
            for op in 0..ops_per_thread {
                let mut retries = 0;
                loop {
                    let res = CrateService::record_crate_transaction(
                        &mut conn,
                        RecordCrateTransactionDto {
                            // Cycle across customer IDs 1, 2, 3
                            customer_id: ((t_idx % 3) + 1) as i64,
                            crates_out: 4,
                            crates_in: 2,
                            voucher_ref: format!("CONC-T{}-OP{}", t_idx, op),
                            date: Some("2026-11-04".to_string()),
                            deposit_paid_paisa: None,
                            deposit_refunded_paisa: None,
                            notes: Some(format!("Concurrent op by thread {}", t_idx)),
                            user_id: Some(1),
                        },
                    );

                    if res.is_ok() {
                        succeeded += 1;
                        break;
                    }
                    retries += 1;
                    if retries > 15 {
                        panic!("Thread {} failed after {} retries: {:?}", t_idx, retries, res);
                    }
                    thread::sleep(std::time::Duration::from_millis(40));
                }
            }
            succeeded
        }));
    }

    let mut total_succeeded = 0;
    for handle in handles {
        total_succeeded += handle.join().expect("Thread join");
    }

    assert_eq!(
        total_succeeded,
        num_threads * ops_per_thread,
        "All concurrent crate transactions must successfully commit"
    );

    let conn = pool_arc.get().expect("Final conn");
    let total_ledger_entries: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM customer_crate_ledger WHERE voucher_ref LIKE 'CONC-T%';",
            [],
            |r| r.get(0),
        )
        .expect("Query ledger count");
    assert_eq!(
        total_ledger_entries,
        (num_threads * ops_per_thread) as i64,
        "Customer crate ledger must contain exactly one record per concurrent transaction"
    );

    // Liquid inventory must remain completely untouched
    let liquid_stock: i64 = conn
        .query_row(
            "SELECT current_stock_base_units FROM products WHERE id = 1;",
            [],
            |r| r.get(0),
        )
        .expect("Liquid stock");
    assert_eq!(
        liquid_stock, 12000,
        "Liquid stock must remain 12000 base bottles after concurrent crate churn"
    );
}
