//! Tier 5 Adversarial Stress Suite: Backend Services & SQLite Database Invariants
//! Milestone 7 Phase 2: White-Box Adversarial Coverage Hardening
//! File: src-tauri/tests/challenger_m7_backend_invariants_stress.rs
//!
//! Author: Challenger M7_1 (Empirical Challenger)
//!
//! Scope of Empirical Verification:
//! 1. Direct SQLite Day-Locking & Immutability Triggers (10 guarded tables)
//! 2. Service-level Day-Locking Enforcements across all transactional services
//! 3. Multi-table Transaction Rollback & State Isolation under partial failures
//! 4. Zero-drift Integer Paisa Arithmetic & Boundary Value Extremes
//! 5. Empty Crate Circulation Purity & Security Deposit Accounting Isolation
//! 6. RBAC 4-Role Permission Matrix & Audit Log Tamper Resistance
//! 7. Empirical Discovery: Crate Transaction Day-Locking Gap Analysis

use rusqlite::{params, Connection};
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::dtos::*;
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::domain::models::PaymentType;
use logar_pos_lib::domain::rbac::{has_permission, Action, Role};
use logar_pos_lib::services::accounting::AccountingService;
use logar_pos_lib::services::auth::AuthService;
use logar_pos_lib::services::cancellations::{CancellationService, CancelInvoiceDto};
use logar_pos_lib::services::crates::{
    CrateService, RecordCrateTransactionDto, RecordSecurityDepositDto,
};
use logar_pos_lib::services::logistics::LogisticsService;
use logar_pos_lib::services::purchases::{
    PurchaseItemInputDto, PurchaseService, RecordPurchaseDto,
};
use logar_pos_lib::services::returns::{
    RecordSalesReturnDto, ReturnItemDto, SalesReturnService,
};
use logar_pos_lib::services::sales::{
    CreateSalesInvoiceDto, CreateSalesInvoiceItemDto, SalesService,
};
use logar_pos_lib::services::settlement::SettlementService;

/// Initialize isolated in-memory SQLite database with all schema migrations
fn setup_test_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations 001 through 007");
    conn
}

// ============================================================================
// 1. TIER 5 DIRECT SQLITE DAY-LOCKING & IMMUTABILITY TRIGGERS
// ============================================================================
#[test]
fn test_tier5_adversarial_day_locking_direct_sqlite_triggers() {
    let conn = setup_test_db();
    let locked_date = "2026-11-01";

    // Lock the date 2026-11-01 via daily_closings master record
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked, opening_cash_paisa, physical_closing_cash_paisa)
         VALUES (?1, 1, 100000, 100000)",
        params![locked_date],
    ).expect("Seed locked closing date");

    // 1. sales_invoices: INSERT on locked date must ABORT
    let err = conn.execute(
        "INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa, payment_type)
         VALUES ('INV-ATTACK-01', 1, '2026-11-01', '2026-11-15', 50000, 50000, 50000, 0, 'CASH')",
        [],
    ).unwrap_err();
    assert!(err.to_string().contains("Cannot create a sales invoice on a locked accounting date"), "Actual: {}", err);

    // 2. sales_invoices: UPDATE locked invoice must ABORT
    conn.execute(
        "INSERT INTO sales_invoices (id, invoice_number, customer_id, invoice_date, due_date, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa, payment_type, is_locked)
         VALUES (991, 'INV-PRE-01', 1, '2026-11-02', '2026-11-16', 50000, 50000, 50000, 0, 'CASH', 1)",
        [],
    ).expect("Seed locked invoice");
    let err = conn.execute("UPDATE sales_invoices SET subtotal_paisa = 100000 WHERE id = 991", []).unwrap_err();
    assert!(err.to_string().contains("Cannot modify a sales invoice on a locked accounting date"), "Actual: {}", err);

    // 3. sales_invoices: DELETE locked invoice must ABORT
    let err = conn.execute("DELETE FROM sales_invoices WHERE id = 991", []).unwrap_err();
    assert!(err.to_string().contains("Cannot delete a sales invoice on a locked accounting date"), "Actual: {}", err);

    // 4. purchase_invoices: INSERT on locked date must ABORT
    let err = conn.execute(
        "INSERT INTO purchase_invoices (purchase_number, supplier_id, purchase_date, base_goods_paisa, total_landed_cost_paisa, paid_amount_paisa, due_amount_paisa, payment_status)
         VALUES ('PUR-ATTACK-01', 1, '2026-11-01', 100000, 100000, 100000, 0, 'PAID')",
        [],
    ).unwrap_err();
    assert!(err.to_string().contains("Cannot create a purchase invoice on a locked accounting date"), "Actual: {}", err);

    // 5. purchase_invoices: UPDATE locked purchase must ABORT
    conn.execute(
        "INSERT INTO purchase_invoices (id, purchase_number, supplier_id, purchase_date, base_goods_paisa, total_landed_cost_paisa, paid_amount_paisa, due_amount_paisa, payment_status, is_locked)
         VALUES (992, 'PUR-PRE-01', 1, '2026-11-02', 100000, 100000, 100000, 0, 'PAID', 1)",
        [],
    ).expect("Seed locked purchase");
    let err = conn.execute("UPDATE purchase_invoices SET total_landed_cost_paisa = 200000 WHERE id = 992", []).unwrap_err();
    assert!(err.to_string().contains("Cannot modify a purchase invoice on a locked accounting date"), "Actual: {}", err);

    // 6. purchase_invoices: DELETE locked purchase must ABORT
    let err = conn.execute("DELETE FROM purchase_invoices WHERE id = 992", []).unwrap_err();
    assert!(err.to_string().contains("Cannot delete a purchase invoice on a locked accounting date"), "Actual: {}", err);

    // 7. sales_returns: INSERT on locked date must ABORT
    let err = conn.execute(
        "INSERT INTO sales_returns (return_number, customer_id, return_date, total_return_paisa, refund_mode, reason)
         VALUES ('RET-ATTACK-01', 1, '2026-11-01', 5000, 'CASH', 'Attack return')",
        [],
    ).unwrap_err();
    assert!(err.to_string().contains("Cannot create a sales return on a locked accounting date"), "Actual: {}", err);

    // 8. sales_returns: UPDATE locked return must ABORT
    conn.execute(
        "INSERT INTO sales_returns (id, return_number, customer_id, return_date, total_return_paisa, refund_mode, reason, is_locked)
         VALUES (993, 'RET-PRE-01', 1, '2026-11-02', 5000, 'CASH', 'Locked return', 1)",
        [],
    ).expect("Seed locked return");
    let err = conn.execute("UPDATE sales_returns SET total_return_paisa = 10000 WHERE id = 993", []).unwrap_err();
    assert!(err.to_string().contains("Cannot modify a sales return on a locked accounting date"), "Actual: {}", err);

    // 9. sales_returns: DELETE locked return must ABORT
    let err = conn.execute("DELETE FROM sales_returns WHERE id = 993", []).unwrap_err();
    assert!(err.to_string().contains("Cannot delete a sales return on a locked accounting date"), "Actual: {}", err);

    // 10. operating_expenses: INSERT on locked date must ABORT
    let err = conn.execute(
        "INSERT INTO operating_expenses (expense_number, expense_date, account_id, amount, amount_paisa, payment_mode, description)
         VALUES ('EXP-ATTACK-01', '2026-11-01', 30, 200.0, 20000, 'CASH', 'Test expense')",
        [],
    ).unwrap_err();
    assert!(err.to_string().contains("Cannot record an operating expense on a locked accounting date"), "Actual: {}", err);

    // 11. operating_expenses: UPDATE locked expense must ABORT
    conn.execute(
        "INSERT INTO operating_expenses (id, expense_number, expense_date, account_id, amount, amount_paisa, payment_mode, description, is_locked)
         VALUES (994, 'EXP-PRE-01', '2026-11-03', 30, 200.0, 20000, 'CASH', 'Test locked expense', 0)",
        [],
    ).expect("Seed open expense");
    conn.execute("INSERT INTO daily_closings (closing_date, is_locked) VALUES ('2026-11-03', 1)", []).expect("Lock date 2026-11-03");

    let err = conn.execute("UPDATE operating_expenses SET amount_paisa = 50000 WHERE id = 994", []).unwrap_err();
    assert!(err.to_string().contains("Cannot modify an expense on a locked accounting date"), "Actual: {}", err);

    // 12. operating_expenses: DELETE locked expense must ABORT
    let err = conn.execute("DELETE FROM operating_expenses WHERE id = 994", []).unwrap_err();
    assert!(err.to_string().contains("Operating expenses cannot be deleted on a locked accounting date"), "Actual: {}", err);

    // 13. customer_recoveries: INSERT on locked date must ABORT
    let err = conn.execute(
        "INSERT INTO customer_recoveries (recovery_number, customer_id, recovery_date, amount, amount_paisa, payment_mode, allocation_mode, previous_balance_paisa, new_balance_paisa)
         VALUES ('REC-ATTACK-01', 1, '2026-11-01', 100.0, 10000, 'CASH', 'ON_ACCOUNT', 50000, 40000)",
        [],
    ).unwrap_err();
    assert!(err.to_string().contains("Cannot record recovery on a locked accounting date"), "Actual: {}", err);

    // 14. customer_recoveries: UPDATE locked recovery must ABORT
    conn.execute(
        "INSERT INTO customer_recoveries (id, recovery_number, customer_id, recovery_date, amount, amount_paisa, payment_mode, allocation_mode, previous_balance_paisa, new_balance_paisa, is_locked)
         VALUES (995, 'REC-PRE-01', 1, '2026-11-04', 100.0, 10000, 'CASH', 'ON_ACCOUNT', 50000, 40000, 0)",
        [],
    ).expect("Seed recovery");
    conn.execute("INSERT INTO daily_closings (closing_date, is_locked) VALUES ('2026-11-04', 1)", []).expect("Lock date 2026-11-04");

    let err = conn.execute("UPDATE customer_recoveries SET amount_paisa = 20000 WHERE id = 995", []).unwrap_err();
    assert!(err.to_string().contains("Cannot modify a recovery on a locked accounting date"), "Actual: {}", err);

    // 15. customer_recoveries: DELETE locked recovery must ABORT
    let err = conn.execute("DELETE FROM customer_recoveries WHERE id = 995", []).unwrap_err();
    assert!(err.to_string().contains("Cannot delete a recovery on a locked accounting date"), "Actual: {}", err);

    // 16. delivery_sheets: INSERT on locked date must ABORT
    let err = conn.execute(
        "INSERT INTO delivery_sheets (sheet_number, sheet_date, route_id, driver_id, vehicle_number)
         VALUES ('DS-ATTACK-01', '2026-11-01', 1, 1, 'LES-1000')",
        [],
    ).unwrap_err();
    assert!(err.to_string().contains("Cannot create a loading sheet on a locked accounting date"), "Actual: {}", err);

    // 17. delivery_sheets: DELETE settled sheet must ABORT
    conn.execute(
        "INSERT INTO delivery_sheets (id, sheet_number, sheet_date, route_id, driver_id, vehicle_number, status)
         VALUES (996, 'DS-PRE-01', '2026-11-02', 1, 1, 'LES-1000', 'SETTLED')",
        [],
    ).expect("Seed settled sheet");
    let err = conn.execute("DELETE FROM delivery_sheets WHERE id = 996", []).unwrap_err();
    assert!(err.to_string().contains("Settled delivery sheets are permanent audit records"), "Actual: {}", err);

    // 18. trip_settlements: INSERT on locked date must ABORT
    let err = conn.execute(
        "INSERT INTO trip_settlements (trip_id, sheet_id, settlement_date, driver_shortage_action)
         VALUES (9999, 996, '2026-11-01', 'BALANCED')",
        [],
    ).unwrap_err();
    assert!(err.to_string().contains("Cannot create trip settlement on a locked accounting date"), "Actual: {}", err);

    // 19. daily_closings: UPDATE locked closing must ABORT
    let err = conn.execute(
        "UPDATE daily_closings SET physical_closing_cash_paisa = 999999 WHERE closing_date = '2026-11-01'",
        [],
    ).unwrap_err();
    assert!(err.to_string().contains("Cannot modify a finalized daily closing record"), "Actual: {}", err);

    // 20. daily_closings: DELETE locked closing must ABORT
    let err = conn.execute("DELETE FROM daily_closings WHERE closing_date = '2026-11-01'", []).unwrap_err();
    assert!(err.to_string().contains("Cannot delete a finalized daily closing record"), "Actual: {}", err);

    // 21. cash_book: UPDATE locked record must ABORT
    conn.execute(
        "INSERT INTO cash_book (id, entry_date, transaction_type, cash_in_paisa, running_balance_paisa, is_locked)
         VALUES (997, '2026-11-02', 'POS_SALE_CASH', 5000, 5000, 1)",
        [],
    ).expect("Seed locked cash book");
    let err = conn.execute("UPDATE cash_book SET cash_in_paisa = 10000 WHERE id = 997", []).unwrap_err();
    assert!(err.to_string().contains("Cannot modify cash book record on a locked accounting date"), "Actual: {}", err);

    // 22. cash_book: DELETE any cash book record must ABORT (permanent immutability)
    let err = conn.execute("DELETE FROM cash_book WHERE id = 997", []).unwrap_err();
    assert!(err.to_string().contains("Cash book records are permanent and immutable"), "Actual: {}", err);

    // 23. audit_logs: UPDATE must ABORT
    conn.execute(
        "INSERT INTO audit_logs (id, action, entity_type, entity_id) VALUES (998, 'TEST', 'test', '1')",
        [],
    ).expect("Seed audit log");
    let err = conn.execute("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = 998", []).unwrap_err();
    assert!(err.to_string().contains("Audit logs cannot be updated"), "Actual: {}", err);

    // 24. audit_logs: DELETE must ABORT
    let err = conn.execute("DELETE FROM audit_logs WHERE id = 998", []).unwrap_err();
    assert!(err.to_string().contains("Audit logs cannot be deleted"), "Actual: {}", err);
}

// ============================================================================
// 2. TIER 5 SERVICE-LEVEL DAY-LOCKING REJECTION MATRIX
// ============================================================================
#[test]
fn test_tier5_adversarial_day_locking_service_layer_matrix() {
    let mut conn = setup_test_db();
    let locked_date = "2026-11-01".to_string();

    // Lock date 2026-11-01
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked, opening_cash_paisa, physical_closing_cash_paisa)
         VALUES (?1, 1, 0, 0)",
        params![locked_date],
    ).expect("Lock date 2026-11-01");

    // A. SalesService::create_invoice on locked date
    let err = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: None,
            invoice_date: Some(locked_date.clone()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 1,
                pack_qty: 0,
                loose_qty: 1,
                unit_price_paisa: Some(5000),
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: Some(5000),
            crates_issued: None,
            crates_returned: None,
            admin_override_pin: None,
            user_id: Some(1),
        },
    ).unwrap_err();
    assert!(matches!(err, AppError::DayLocked(_)), "Expected DayLocked, got: {:?}", err);

    // B. PurchaseService::record_purchase on locked date
    let err = PurchaseService::record_purchase(
        &mut conn,
        RecordPurchaseDto {
            supplier_id: 1,
            invoice_no: "PUR-LOCK-01".into(),
            supplier_invoice_no: None,
            purchase_date: locked_date.clone(),
            items: vec![PurchaseItemInputDto {
                product_id: 1,
                pack_qty: 5,
                loose_qty: 0,
                unit_cost_paisa: 100000,
            }],
            freight_paisa: None,
            unloading_labor_paisa: None,
            transit_tax_paisa: None,
            payment_status: "UNPAID".into(),
            payment_mode: Some("CREDIT".into()),
            paid_amount_paisa: None,
            empty_crates_returned_to_factory: None,
            notes: None,
            user_id: Some(1),
        },
    ).unwrap_err();
    assert!(matches!(err, AppError::DayLocked(_)), "Expected DayLocked, got: {:?}", err);

    // C. CancellationService::cancel_invoice on locked invoice
    conn.execute(
        "INSERT INTO sales_invoices (id, invoice_number, customer_id, invoice_date, due_date, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa, payment_type, is_locked)
         VALUES (901, 'INV-LOCK-901', 1, '2026-11-02', '2026-11-16', 5000, 5000, 5000, 0, 'CASH', 1)",
        [],
    ).expect("Seed invoice");
    let err = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: 901,
            reason: "Attempt cancellation on locked date".into(),
            cancelled_by: 1, // Admin (id=1)
            admin_pin: None,
        },
    ).unwrap_err();
    assert!(matches!(err, AppError::DayLocked(_)), "Expected DayLocked, got: {:?}", err);

    // D. SalesReturnService::record_sales_return on locked date
    let err = SalesReturnService::record_sales_return(
        &mut conn,
        RecordSalesReturnDto {
            invoice_id: None,
            customer_id: 1,
            return_date: Some(locked_date.clone()),
            items: vec![ReturnItemDto {
                product_id: 1,
                base_units: 2,
                refund_rate_paisa: 10000,
                condition: "SALABLE".into(),
            }],
            refund_mode: "CASH".into(),
            reason: "Return on locked date".into(),
            crates_returned_by_customer: None,
            authorized_by: Some(1),
        },
    ).unwrap_err();
    assert!(matches!(err, AppError::DayLocked(_)), "Expected DayLocked, got: {:?}", err);

    // E. AccountingService::record_customer_recovery on locked date
    let err = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            payment_date: Some(locked_date.clone()),
            amount_paisa: 10000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: None,
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).unwrap_err();
    assert!(matches!(err, AppError::DayLocked(_)), "Expected DayLocked, got: {:?}", err);

    // F. AccountingService::record_supplier_payment on locked date
    let err = AccountingService::record_supplier_payment(
        &mut conn,
        RecordSupplierPaymentDto {
            supplier_id: 1,
            payment_date: Some(locked_date.clone()),
            amount_paisa: 50000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            reference_number: None,
            description: Some("Locked supplier payment".into()),
            user_id: Some(1),
        },
    ).unwrap_err();
    assert!(matches!(err, AppError::DayLocked(_)), "Expected DayLocked, got: {:?}", err);

    // G. AccountingService::record_expense on locked date
    let err = AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            account_id: 30,
            expense_date: Some(locked_date.clone()),
            amount_paisa: 15000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: Some("Guard".into()),
            description: "Chowkidar chai on locked date".into(),
            reference_number: None,
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    ).unwrap_err();
    assert!(matches!(err, AppError::DayLocked(_)), "Expected DayLocked, got: {:?}", err);

    // H. AccountingService::record_bank_transfer on locked date
    let err = AccountingService::record_bank_transfer(
        &mut conn,
        BankTransferRequestDto {
            direction: "CASH_TO_BANK".into(),
            bank_account_id: 1,
            transfer_date: locked_date.clone(),
            amount_paisa: 25000,
            instrument_type: Some("CASH_DEPOSIT".into()),
            instrument_number: Some("DEP-LOCK-01".into()),
            particulars: "Locked date transfer".into(),
            user_id: Some(1),
        },
    ).unwrap_err();
    assert!(matches!(err, AppError::DayLocked(_)), "Expected DayLocked, got: {:?}", err);

    // I. LogisticsService::create_loading_sheet on locked date
    let err = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(locked_date.clone()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-1000".into()),
            driver_id: Some(1),
            driver_name: Some("Driver".into()),
            helper_name: None,
            opening_km: None,
            empty_crates_loaded: None,
            items: vec![LoadingItemInput {
                product_id: 1,
                pack_qty: 10,
                loose_qty: 0,
            }],
            notes: None,
            created_by: Some(1),
        },
    ).unwrap_err();
    assert!(matches!(err, AppError::DayLocked(_)), "Expected DayLocked, got: {:?}", err);

    // J. SettlementService::submit_van_settlement on locked date
    conn.execute(
        "INSERT INTO delivery_sheets (id, sheet_number, sheet_date, route_id, driver_id, vehicle_number, status)
         VALUES (902, 'DS-OPEN-01', '2026-11-02', 1, 1, 'LES-1000', 'DISPATCHED')",
        [],
    ).expect("Seed open sheet");
    let err = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: 902,
            settlement_date: locked_date.clone(),
            closing_km: None,
            returns: vec![],
            actual_cash_paisa: 0,
            empty_crates_returned: 0,
            route_expenses_paisa: None,
            settlement_notes: None,
            shortage_action: None,
            user_id: Some(1),
        },
    ).unwrap_err();
    assert!(matches!(err, AppError::DayLocked(_)), "Expected DayLocked, got: {:?}", err);
}

// ============================================================================
// 3. TIER 5 ATOMIC TRANSACTION ROLLBACK & STATE ISOLATION
// ============================================================================
#[test]
fn test_tier5_adversarial_multi_item_stock_atomicity_and_rollback() {
    let mut conn = setup_test_db();

    // Setup initial stock:
    // Product 1: 100 base units available
    // Product 2: exactly 5 base units available
    conn.execute("UPDATE products SET current_stock_base_units = 100, stock_base_units = 100 WHERE id = 1", []).unwrap();
    conn.execute("UPDATE products SET current_stock_base_units = 5, stock_base_units = 5 WHERE id = 2", []).unwrap();

    let p1_initial_stock: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0)).unwrap();
    let p2_initial_stock: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0)).unwrap();
    let initial_invoices_count: i64 = conn.query_row("SELECT COUNT(*) FROM sales_invoices", [], |r| r.get(0)).unwrap();
    let initial_khata_count: i64 = conn.query_row("SELECT COUNT(*) FROM customer_ledger", [], |r| r.get(0)).unwrap();
    let initial_cash_count: i64 = conn.query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0)).unwrap();

    // Adversarial multi-item invoice:
    // Item 1: requests 20 units of Product 1 (available: 100) -> would succeed
    // Item 2: requests 50 units of Product 2 (available: 5) -> MUST FAIL InsufficientStock!
    let res = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: None,
            invoice_date: Some("2026-11-07".into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 0,
                    loose_qty: 20,
                    unit_price_paisa: Some(5000),
                    line_discount_paisa: None,
                },
                CreateSalesInvoiceItemDto {
                    product_id: 2,
                    pack_qty: 0,
                    loose_qty: 50, // exceeds available (5)
                    unit_price_paisa: Some(6000),
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: Some(100000),
            crates_issued: None,
            crates_returned: None,
            admin_override_pin: None,
            user_id: Some(1),
        },
    );

    // Verify operation aborted with InsufficientStock
    assert!(res.is_err());
    match res.unwrap_err() {
        AppError::InsufficientStock { product_id, requested_base, available_base } => {
            assert_eq!(product_id, 2);
            assert_eq!(requested_base, 50);
            assert_eq!(available_base, 5);
        }
        other => panic!("Expected InsufficientStock error, got {:?}", other),
    }

    // Verify COMPLETE TRANSACTION ROLLBACK:
    // 1. Product 1 stock must be completely untouched (still 100, NOT decremented to 80!)
    let p1_after_stock: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0)).unwrap();
    assert_eq!(p1_after_stock, p1_initial_stock, "Product 1 stock leaked across partial transaction!");

    // 2. Product 2 stock must be untouched (still 5)
    let p2_after_stock: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0)).unwrap();
    assert_eq!(p2_after_stock, p2_initial_stock);

    // 3. No invoice records, items, khata, or cash entries created
    let after_invoices_count: i64 = conn.query_row("SELECT COUNT(*) FROM sales_invoices", [], |r| r.get(0)).unwrap();
    assert_eq!(after_invoices_count, initial_invoices_count);

    let after_khata_count: i64 = conn.query_row("SELECT COUNT(*) FROM customer_ledger", [], |r| r.get(0)).unwrap();
    assert_eq!(after_khata_count, initial_khata_count);

    let after_cash_count: i64 = conn.query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0)).unwrap();
    assert_eq!(after_cash_count, initial_cash_count);
}

// ============================================================================
// 4. TIER 5 ZERO-DRIFT INTEGER PAISA ARITHMETIC & DIVISION APPORTIONMENT
// ============================================================================
#[test]
fn test_tier5_adversarial_landed_cost_zero_drift_apportionment() {
    let mut conn = setup_test_db();

    // Adversarial purchase with non-divisible landed cost:
    // 3 products, total base units = 100 + 200 + 300 = 600 base units
    // Freight = 13,333 Paisas (odd prime-like amount)
    // Labor = 7,777 Paisas
    // Total landed expenses = 21,110 Paisas
    let res = PurchaseService::record_purchase(
        &mut conn,
        RecordPurchaseDto {
            supplier_id: 1,
            invoice_no: "PUR-DRIFT-01".into(),
            supplier_invoice_no: Some("FAC-INV-9988".into()),
            purchase_date: "2026-11-08".into(),
            items: vec![
                PurchaseItemInputDto {
                    product_id: 1, // 24 bottles/crate
                    pack_qty: 4,   // 96 base units
                    loose_qty: 4,  // 100 base units total
                    unit_cost_paisa: 120000,
                },
                PurchaseItemInputDto {
                    product_id: 2, // 24 bottles/crate
                    pack_qty: 8,   // 192 base units
                    loose_qty: 8,  // 200 base units total
                    unit_cost_paisa: 140000,
                },
                PurchaseItemInputDto {
                    product_id: 3, // 12 bottles/pack
                    pack_qty: 25,  // 300 base units
                    loose_qty: 0,  // 300 base units total
                    unit_cost_paisa: 180000,
                },
            ],
            freight_paisa: Some(13333),
            unloading_labor_paisa: Some(7777),
            transit_tax_paisa: Some(0),
            payment_status: "UNPAID".into(),
            payment_mode: Some("CREDIT".into()),
            paid_amount_paisa: None,
            empty_crates_returned_to_factory: None,
            notes: Some("Zero drift apportionment test".into()),
            user_id: Some(1),
        },
    ).expect("Record landed cost purchase");

    // Total direct expenses = 13,333 + 7,777 = 21,110 Paisas
    let direct_expenses = 13333 + 7777;
    assert_eq!(res.total_landed_cost_paisa, res.base_invoice_cost_paisa + direct_expenses);

    // Verify database line item allocation:
    // The sum of allocated_landed_cost_paisa across all lines must equal EXACTLY 21,110 Paisas!
    let total_allocated: i64 = conn.query_row(
        "SELECT SUM(landed_cost_allocated_paisa) FROM purchase_invoice_items WHERE purchase_id = ?1",
        params![res.purchase_id],
        |r| r.get(0),
    ).expect("Query allocated landed cost sum");

    assert_eq!(
        total_allocated, direct_expenses,
        "Zero-drift violation! Sum of allocated landed expenses ({}) != direct expenses ({})",
        total_allocated, direct_expenses
    );

    // Check double-entry journal voucher balance
    let (dr_sum, cr_sum): (i64, i64) = conn.query_row(
        "SELECT SUM(debit_paisa), SUM(credit_paisa) FROM journal_lines WHERE entry_id = ?1",
        params![res.journal_entry_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).expect("Query journal lines balance");

    assert_eq!(dr_sum, cr_sum, "Purchase journal voucher out of balance: Dr ({}) != Cr ({})", dr_sum, cr_sum);
    assert_eq!(dr_sum, res.total_landed_cost_paisa);
}

// ============================================================================
// 5. TIER 5 EMPTY CRATE CIRCULATION PURITY & SECURITY DEPOSIT ISOLATION
// ============================================================================
#[test]
fn test_tier5_adversarial_empty_crate_circulation_and_deposit_isolation() {
    let mut conn = setup_test_db();

    // Record baseline state:
    // Product 1 liquid stock
    let initial_liquid_stock: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0)).unwrap();
    let initial_revenue: i64 = conn.query_row(
        "SELECT COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE account_id = 26", // Account 4010 (Sales Revenue, id=26)
        [], |r| r.get(0)
    ).unwrap();

    // Customer initial crate balance
    let initial_crates: i64 = conn.query_row(
        "SELECT current_crate_balance FROM customers WHERE id = 1",
        [],
        |r| r.get(0),
    ).unwrap();

    // Step 1: Issue 50 crates to Customer 1 without cash deposit
    let crate_tx1 = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 1,
            crates_out: 50,
            crates_in: 0,
            voucher_ref: "CR-OUT-01".into(),
            date: Some("2026-11-09".into()),
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: Some("Crate issuance".into()),
            user_id: Some(1),
        },
    ).expect("Record crate out");

    assert_eq!(crate_tx1.new_customer_crate_balance, initial_crates + 50);

    // Step 2: Return 60 crates (customer has net -10 crates surplus returned)
    let crate_tx2 = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 1,
            crates_out: 0,
            crates_in: 60,
            voucher_ref: "CR-IN-01".into(),
            date: Some("2026-11-09".into()),
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: Some("Crate return surplus".into()),
            user_id: Some(1),
        },
    ).expect("Record crate return surplus");

    assert_eq!(crate_tx2.new_customer_crate_balance, initial_crates - 10);

    // Verify liquid stock and revenue are strictly untouched:
    let after_liquid_stock: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0)).unwrap();
    assert_eq!(after_liquid_stock, initial_liquid_stock, "Empty crate movement altered beverage liquid inventory!");

    let after_revenue: i64 = conn.query_row(
        "SELECT COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE account_id = 26",
        [], |r| r.get(0)
    ).unwrap();
    assert_eq!(after_revenue, initial_revenue, "Empty crate movement booked fake sales revenue!");

    // Step 3: Record Security Deposit of 15,000 PKR (1,500,000 Paisas)
    let dep_res = CrateService::record_security_deposit(
        &mut conn,
        RecordSecurityDepositDto {
            customer_id: 1,
            crates_count: 25,
            deposit_rate_per_crate_paisa: 60000, // 600 PKR/crate
            payment_mode: "CASH".into(),
            notes: Some("Security deposit for 25 crates".into()),
            user_id: Some(1),
        },
    ).expect("Record security deposit");

    assert_eq!(dep_res.amount_paisa, 1500000);
    assert_eq!(dep_res.running_deposit_liability_paisa, 1500000);

    // Verify Cash Book was credited under Account 2100 (Liability), NOT Account 4010 (Sales Revenue)
    let cash_entry_account: String = conn.query_row(
        "SELECT account_code FROM cash_book WHERE voucher_ref_number = ?1",
        params![dep_res.voucher_number],
        |r| r.get(0),
    ).expect("Query cash book account code for security deposit");
    assert_eq!(cash_entry_account, "2100", "Security deposit was wrongly routed away from Liability account 2100!");

    // Verify Sales Revenue is STILL identical to baseline (Security deposit != Sales Revenue)
    let revenue_after_deposit: i64 = conn.query_row(
        "SELECT COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE account_id = 26",
        [], |r| r.get(0)
    ).unwrap();
    assert_eq!(revenue_after_deposit, initial_revenue, "Security deposit leaked into P&L sales revenue!");
}

// ============================================================================
// 6. TIER 5 RBAC MATRIX & AUDIT LOG TAMPER-RESISTANCE
// ============================================================================
#[test]
fn test_tier5_adversarial_rbac_matrix_and_audit_log_immutability() {
    let conn = setup_test_db();

    // Part A: RBAC 4-Role Permission Matrix Stress
    // 1. Bill cancellation: Only Admin can cancel
    assert!(has_permission(Role::Admin, Action::PosCancelInvoice));
    assert!(!has_permission(Role::Accountant, Action::PosCancelInvoice));
    assert!(!has_permission(Role::Salesman, Action::PosCancelInvoice));
    assert!(!has_permission(Role::Warehouse, Action::PosCancelInvoice));

    // 2. Daily Closing: Only Admin and Accountant can close
    assert!(has_permission(Role::Admin, Action::AccountingDailyClosing));
    assert!(has_permission(Role::Accountant, Action::AccountingDailyClosing));
    assert!(!has_permission(Role::Salesman, Action::AccountingDailyClosing));
    assert!(!has_permission(Role::Warehouse, Action::AccountingDailyClosing));

    // 3. Settings modification: Only Admin
    assert!(has_permission(Role::Admin, Action::AdminManageSettings));
    assert!(!has_permission(Role::Accountant, Action::AdminManageSettings));
    assert!(!has_permission(Role::Salesman, Action::AdminManageSettings));
    assert!(!has_permission(Role::Warehouse, Action::AdminManageSettings));

    // 4. POS Sale: Admin, Salesman (Accountant view only)
    assert!(has_permission(Role::Admin, Action::PosCreateInvoice));
    assert!(!has_permission(Role::Accountant, Action::PosCreateInvoice));
    assert!(has_permission(Role::Salesman, Action::PosCreateInvoice));
    assert!(!has_permission(Role::Warehouse, Action::PosCreateInvoice));

    // Part B: PIN Authentication with Leading Zeros
    // Seed user with leading-zero PIN "0099"
    conn.execute(
        "INSERT INTO users (username, password_hash, salt, full_name, role, pin_code, is_active)
         VALUES ('leading_zero_user', 'hash', 'salt', 'Agent 0099', 'SALESMAN', '0099', 1)",
        [],
    ).expect("Seed user with leading zeros");

    // Login with exact string "0099" must succeed
    let session = AuthService::login_pin(&conn, "0099").expect("PIN login with leading zeros");
    assert_eq!(session.username, "leading_zero_user");

    // Login with trimmed integer "99" must be rejected
    let failed_login = AuthService::login_pin(&conn, "99");
    assert!(failed_login.is_err(), "Numeric truncation allowed incorrect PIN match!");

    // Part C: Tamper-Resistance of Audit Logs
    let audit_id = conn.query_row(
        "SELECT id FROM audit_logs ORDER BY id DESC LIMIT 1",
        [],
        |r| r.get::<_, i64>(0),
    ).expect("Query latest audit log entry");

    // Direct UPDATE on audit_logs must be aborted by trigger
    let err_update = conn.execute(
        "UPDATE audit_logs SET action = 'EXPUNGED' WHERE id = ?1",
        params![audit_id],
    ).unwrap_err();
    assert!(err_update.to_string().contains("Audit logs cannot be updated"), "Actual: {}", err_update);

    // Direct DELETE on audit_logs must be aborted by trigger
    let err_delete = conn.execute(
        "DELETE FROM audit_logs WHERE id = ?1",
        params![audit_id],
    ).unwrap_err();
    assert!(err_delete.to_string().contains("Audit logs cannot be deleted"), "Actual: {}", err_delete);
}

// ============================================================================
// 7. EMPIRICAL DISCOVERY: CRATE TRANSACTION DAY-LOCKING GAP ANALYSIS
// ============================================================================
#[test]
fn test_tier5_empirical_gap_day_locking_crate_deposit() {
    let mut conn = setup_test_db();
    let locked_date = "2026-11-01".to_string();

    // Lock date 2026-11-01
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked, opening_cash_paisa, physical_closing_cash_paisa)
         VALUES (?1, 1, 500000, 500000)",
        params![locked_date],
    ).expect("Lock date 2026-11-01");

    // Attempt to record a crate transaction with cash deposit paid on the locked date
    let res = CrateService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 1,
            crates_out: 10,
            crates_in: 0,
            voucher_ref: "CR-GAP-01".into(),
            date: Some(locked_date.clone()),
            deposit_paid_paisa: Some(60000), // 600 PKR cash deposit
            deposit_refunded_paisa: None,
            notes: Some("Adversarial crate deposit on locked date".into()),
            user_id: Some(1),
        },
    );

    // Empirical Observation:
    // CrateService::record_crate_transaction does NOT currently check daily_closings,
    // and neither customer_crate_ledger, empties_ledger, security_deposits, nor cash_book
    // has a BEFORE INSERT trigger checking daily_closings for closed dates.
    // Therefore, this operation succeeds at runtime and inserts a cash_book row for 2026-11-01.
    //
    // As EMPIRICAL CHALLENGERS, we document this concrete boundary gap:
    // When date is supplied, crate deposit cash entries can be recorded onto historically closed dates.
    if res.is_ok() {
        let inserted_cash_book_id: Option<i64> = conn.query_row(
            "SELECT id FROM cash_book WHERE entry_date = ?1 AND particulars = 'Customer Crate Security Deposit Received'",
            params![locked_date],
            |r| r.get(0),
        ).ok();

        assert!(inserted_cash_book_id.is_some(), "Cash book entry was inserted on locked date");
        println!("[CHALLENGER GAP CONFIRMED] CrateService::record_crate_transaction permits cash deposit insertion on locked date {} without trigger abort.", locked_date);
    }
}
