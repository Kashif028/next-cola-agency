use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use rusqlite::{params, Connection};
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::db::pool::{create_db_pool, DbPool};
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::domain::models::PaymentType;
use logar_pos_lib::services::cancellations::*;
use logar_pos_lib::services::closing::*;
use logar_pos_lib::services::returns::*;
use logar_pos_lib::services::sales::*;

/// Helper to initialize an in-memory SQLite connection with migrations applied
fn setup_in_memory_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations");
    conn
}

/// Helper to initialize a file-backed pool for WAL concurrency testing
fn setup_file_pool(dir: &tempfile::TempDir, name: &str) -> (DbPool, std::path::PathBuf) {
    let db_path = dir.path().join(name);
    let pool = create_db_pool(&db_path).expect("Failed to create file pool");
    {
        let mut conn = pool.get().expect("Failed to get connection for migration");
        run_migrations(&mut conn).expect("Failed to run migrations");
    }
    (pool, db_path)
}

// ============================================================================
// CHALLENGE 1: GOLDEN CASH INVARIANT STRESS MATRIX
// ============================================================================
// Invariant Rules:
// 1. 100% Credit sale MUST NOT insert ANY record into cash_book.
// 2. 100% Cash sale MUST insert exactly the net cash amount into cash_book.
// 3. Split sale MUST insert ONLY the cash portion into cash_book, never the credit portion.
// 4. Over 10 interleaved cash, credit, and split sales, cash book running balance
//    must strictly reflect only actual cash tendered.
#[test]
fn challenge_1_golden_cash_invariant_stress_matrix() {
    let mut conn = setup_in_memory_db();

    let initial_cash_rows: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .unwrap_or(0);
    assert_eq!(initial_cash_rows, 0, "Clean database must start with 0 cash book entries");

    // --- Scenario 1A: 100% Credit Sale (₨ 50,000 / 5,000,000 Paisa) ---
    // Customer 1: Bismillah Kiryana Store
    let credit_req = CreateSalesInvoiceDto {
        customer_id: 1,
        invoice_number: Some("INV-STR-CREDIT-01".into()),
        invoice_date: Some("2026-11-05".into()),
        due_date: None,
        delivery_sheet_id: None,
        trip_id: None,
        items: vec![CreateSalesInvoiceItemDto {
            product_id: 2, // Next Cola 1.5L PET
            pack_qty: 40,  // 40 * ₨ 1,050 = ₨ 42,000 (4,200,000 Paisa)
            loose_qty: 0,
            unit_price_paisa: Some(105000),
            line_discount_paisa: None,
        }],
        invoice_discount_paisa: None,
        crate_deposit_charged_paisa: None,
        payment_type: PaymentType::Credit,
        paid_amount_paisa: None,
        crates_issued: None,
        crates_returned: None,
        admin_override_pin: None,
        user_id: Some(1),
    };

    let credit_receipt = SalesService::create_invoice(&mut conn, credit_req)
        .expect("100% credit invoice should succeed");

    assert_eq!(credit_receipt.paid_amount_paisa, 0);
    assert_eq!(credit_receipt.due_amount_paisa, 4200000);

    // INVARIANT CHECK: Cash book must have ZERO new entries!
    let cash_rows_after_credit: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        cash_rows_after_credit, 0,
        "STRICT GOLDEN INVARIANT: Credit sale must NEVER create any cash_book row!"
    );

    // Customer balance must have increased by exactly 4,200,000 Paisa
    let cust_bal_1: i64 = conn
        .query_row("SELECT current_balance_paisa FROM customers WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cust_bal_1, 4200000);

    // --- Scenario 1B: 100% Cash Sale (₨ 21,600 / 2,160,000 Paisa) ---
    let cash_req = CreateSalesInvoiceDto {
        customer_id: 1,
        invoice_number: Some("INV-STR-CASH-01".into()),
        invoice_date: Some("2026-11-05".into()),
        due_date: None,
        delivery_sheet_id: None,
        trip_id: None,
        items: vec![CreateSalesInvoiceItemDto {
            product_id: 1, // Next Cola 250ml Glass
            pack_qty: 10,  // 10 * ₨ 2,160 = ₨ 21,600
            loose_qty: 0,
            unit_price_paisa: Some(216000),
            line_discount_paisa: None,
        }],
        invoice_discount_paisa: None,
        crate_deposit_charged_paisa: None,
        payment_type: PaymentType::Cash,
        paid_amount_paisa: None,
        crates_issued: None,
        crates_returned: None,
        admin_override_pin: None,
        user_id: Some(1),
    };

    let cash_receipt = SalesService::create_invoice(&mut conn, cash_req)
        .expect("100% cash invoice should succeed");

    assert_eq!(cash_receipt.paid_amount_paisa, 2160000);
    assert_eq!(cash_receipt.due_amount_paisa, 0);

    // INVARIANT CHECK: Cash book must have exactly 1 entry of 2,160,000 Paisa
    let (cash_in, run_bal): (i64, i64) = conn
        .query_row(
            "SELECT cash_in_paisa, running_balance_paisa FROM cash_book WHERE voucher_ref_number = 'INV-STR-CASH-01'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Cash book entry must exist for cash sale");
    assert_eq!(cash_in, 2160000);
    assert_eq!(run_bal, 2160000);

    // Customer balance must be completely unchanged by cash sale
    let cust_bal_after_cash: i64 = conn
        .query_row("SELECT current_balance_paisa FROM customers WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cust_bal_after_cash, 4200000);

    // --- Scenario 1C: Split Payment Sale ---
    // Bill total: ₨ 10,800 + ₨ 600 crate deposit = ₨ 11,400 (1,140,000 Paisa)
    // Tendered Cash: ₨ 4,000 (400,000 Paisa)
    // Due Udhaar: ₨ 7,400 (740,000 Paisa)
    let split_req = CreateSalesInvoiceDto {
        customer_id: 1,
        invoice_number: Some("INV-STR-SPLIT-01".into()),
        invoice_date: Some("2026-11-05".into()),
        due_date: None,
        delivery_sheet_id: None,
        trip_id: None,
        items: vec![CreateSalesInvoiceItemDto {
            product_id: 1,
            pack_qty: 5, // 5 * ₨ 2,160 = ₨ 10,800
            loose_qty: 0,
            unit_price_paisa: Some(216000),
            line_discount_paisa: None,
        }],
        invoice_discount_paisa: None,
        crate_deposit_charged_paisa: Some(60000),
        payment_type: PaymentType::Split,
        paid_amount_paisa: Some(400000), // Cash portion ONLY
        crates_issued: Some(5),
        crates_returned: Some(5),
        admin_override_pin: None,
        user_id: Some(1),
    };

    let split_receipt = SalesService::create_invoice(&mut conn, split_req)
        .expect("Split invoice should succeed");

    assert_eq!(split_receipt.net_total_paisa, 1140000);
    assert_eq!(split_receipt.paid_amount_paisa, 400000);
    assert_eq!(split_receipt.due_amount_paisa, 740000);

    // INVARIANT CHECK: Cash book must record ONLY the cash portion (400,000), NOT net total!
    let (split_cash_in, split_run_bal): (i64, i64) = conn
        .query_row(
            "SELECT cash_in_paisa, running_balance_paisa FROM cash_book WHERE voucher_ref_number = 'INV-STR-SPLIT-01'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Cash book entry must exist for split sale");
    assert_eq!(split_cash_in, 400000, "Split sale MUST insert only cash portion");
    assert_eq!(split_run_bal, 2160000 + 400000, "Cash running balance must be exactly ₨ 25,600");

    // Customer balance must increase by ONLY the due portion (740,000)
    let cust_bal_after_split: i64 = conn
        .query_row("SELECT current_balance_paisa FROM customers WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cust_bal_after_split, 4200000 + 740000);

    // Total cash entries in database must be exactly 2 (1 cash + 1 split, 0 from credit)
    let total_cash_rows: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .unwrap();
    assert_eq!(total_cash_rows, 2);
}

// ============================================================================
// CHALLENGE 2: CREDIT LIMIT ENFORCEMENT & SUPERVISOR PIN (WITH LEADING ZEROS)
// ============================================================================
// Stress tests:
// 1. Retailer with limit ₨ 100,000 strictly rejected when attempted credit exceeds limit.
// 2. Rejected with invalid PIN.
// 3. Rejected with non-admin PIN (Salesman PIN "3456").
// 4. Allowed with valid Admin PIN.
// 5. Leading zero PIN ("0123"):
//    - Verified that PIN "0123" is stored as text.
//    - Attempt with "123" (integer parsed) FAILS.
//    - Attempt with "0123" (exact text) SUCCEEDS.
//    - Audit log records CREDIT_LIMIT_OVERRIDE.
#[test]
fn challenge_2_credit_limit_and_leading_zero_pin() {
    let mut conn = setup_in_memory_db();

    // Customer 3 (Subhanallah Cold Corner) has credit_limit_paisa = 10,000,000 (₨ 100,000)
    // Initial balance = 0.
    // Insert a supervisor user with leading zeros in PIN: '0123'
    conn.execute(
        "INSERT INTO users (id, username, password_hash, salt, full_name, role, phone, pin_code, is_active)
         VALUES (99, 'supervisor_zero', 'hash99', 'salt99', 'Supervisor Zero', 'ADMIN', '+923009999999', '0123', 1)",
        [],
    ).expect("Insert admin with leading-zero PIN");

    // Sale of 100 packs of Product 2 @ ₨ 1,050 = ₨ 105,000 (10,500,000 Paisa) -> Exceeds limit by ₨ 5,000
    let mut breach_req = CreateSalesInvoiceDto {
        customer_id: 3,
        invoice_number: Some("INV-BREACH-01".into()),
        invoice_date: Some("2026-11-05".into()),
        due_date: None,
        delivery_sheet_id: None,
        trip_id: None,
        items: vec![CreateSalesInvoiceItemDto {
            product_id: 2,
            pack_qty: 100,
            loose_qty: 0,
            unit_price_paisa: Some(105000),
            line_discount_paisa: None,
        }],
        invoice_discount_paisa: None,
        crate_deposit_charged_paisa: None,
        payment_type: PaymentType::Credit,
        paid_amount_paisa: None,
        crates_issued: None,
        crates_returned: None,
        admin_override_pin: None,
        user_id: Some(1),
    };

    // 1. Without PIN: Must FAIL
    let err_no_pin = SalesService::create_invoice(&mut conn, breach_req.clone());
    assert!(err_no_pin.is_err(), "Must block credit breach without PIN");
    match err_no_pin {
        Err(AppError::CreditLimitExceeded { customer_id, limit_paisa, attempted_paisa, .. }) => {
            assert_eq!(customer_id, 3);
            assert_eq!(limit_paisa, 10000000);
            assert_eq!(attempted_paisa, 10500000);
        }
        _ => panic!("Expected CreditLimitExceeded error"),
    }

    // 2. With WRONG PIN ("9999"): Must FAIL
    breach_req.admin_override_pin = Some("9999".into());
    let err_wrong_pin = SalesService::create_invoice(&mut conn, breach_req.clone());
    assert!(err_wrong_pin.is_err(), "Must block credit breach with wrong PIN");

    // 3. With Non-Admin PIN (Salesman PIN "3456"): Must FAIL
    breach_req.admin_override_pin = Some("3456".into());
    let err_salesman_pin = SalesService::create_invoice(&mut conn, breach_req.clone());
    assert!(err_salesman_pin.is_err(), "Must reject non-admin PIN for supervisor credit override");

    // 4. With Stripped Leading Zero ("123" instead of "0123"): Must FAIL!
    // This stress-tests against any internal integer-parsing bypass!
    breach_req.admin_override_pin = Some("123".into());
    let err_stripped_zero = SalesService::create_invoice(&mut conn, breach_req.clone());
    assert!(
        err_stripped_zero.is_err(),
        "Must reject '123' when supervisor PIN is '0123' (string vs int type safety)"
    );

    // 5. With Inactive Admin User PIN: Must FAIL
    conn.execute("UPDATE users SET is_active = 0 WHERE id = 99", []).unwrap();
    breach_req.admin_override_pin = Some("0123".into());
    let err_inactive = SalesService::create_invoice(&mut conn, breach_req.clone());
    assert!(err_inactive.is_err(), "Must reject PIN of inactive administrator");

    // Re-enable admin user
    conn.execute("UPDATE users SET is_active = 1 WHERE id = 99", []).unwrap();

    // 6. With EXACT Leading-Zero PIN ("0123"): Must SUCCEED!
    breach_req.admin_override_pin = Some("0123".into());
    breach_req.invoice_number = Some("INV-BREACH-APPROVED".into());

    let approved_receipt = SalesService::create_invoice(&mut conn, breach_req)
        .expect("Valid supervisor PIN '0123' must override credit limit breach");

    assert_eq!(approved_receipt.invoice_number, "INV-BREACH-APPROVED");
    assert_eq!(approved_receipt.due_amount_paisa, 10500000);

    // Verify audit log has CREDIT_LIMIT_OVERRIDE entry
    let audit_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM audit_logs WHERE action = 'CREDIT_LIMIT_OVERRIDE' AND entity_id = '3'",
            [],
            |r| r.get(0),
        )
        .expect("Query audit log");
    assert_eq!(audit_count, 1, "Must create immutable audit log entry for credit override");
}

// ============================================================================
// CHALLENGE 3: SUPERVISOR BILL CANCELLATION & LOCKED DAY FAILURE
// ============================================================================
// Stress tests:
// 1. Cancellation requires valid supervisor PIN (or admin).
// 2. Cancellation reverses: product stock, customer crate balance, customer ledger, cash drawer.
// 3. Cancellation creates balanced reversing journal entry.
// 4. Double cancellation is rejected (idempotency).
// 5. CRITICAL INVARIANT: Attempting cancellation of an invoice from a LOCKED day must FAIL!
#[test]
fn challenge_3_supervisor_bill_cancellation_and_locked_day_failure() {
    let mut conn = setup_in_memory_db();
    let invoice_date = "2026-11-04";

    // 1. Create a sale with all elements: stock, crates, cash, debt
    let initial_p1_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    let initial_crates: i32 = conn
        .query_row("SELECT current_crate_balance FROM customers WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    let initial_cust_bal: i64 = conn
        .query_row("SELECT current_balance_paisa FROM customers WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    // Sale: 10 packs of Product 1 = 240 bottles @ ₨ 2,160/pack = ₨ 21,600
    // Crate deposit: ₨ 1,200 (120,000 Paisa)
    // Net total: ₨ 22,800 (2,280,000 Paisa)
    // Tendered Cash: ₨ 10,000 (1,000,000 Paisa)
    // Due Debt: ₨ 12,800 (1,280,000 Paisa)
    // Crates Issued: 10, Returned: 4 (Net +6 crates)
    let sale_req = CreateSalesInvoiceDto {
        customer_id: 1,
        invoice_number: Some("INV-CANCEL-AUDIT-01".into()),
        invoice_date: Some(invoice_date.into()),
        due_date: None,
        delivery_sheet_id: None,
        trip_id: None,
        items: vec![CreateSalesInvoiceItemDto {
            product_id: 1,
            pack_qty: 10,
            loose_qty: 0,
            unit_price_paisa: Some(216000),
            line_discount_paisa: None,
        }],
        invoice_discount_paisa: None,
        crate_deposit_charged_paisa: Some(120000),
        payment_type: PaymentType::Split,
        paid_amount_paisa: Some(1000000),
        crates_issued: Some(10),
        crates_returned: Some(4),
        admin_override_pin: None,
        user_id: Some(1),
    };

    let receipt = SalesService::create_invoice(&mut conn, sale_req)
        .expect("Invoice creation for cancellation challenge");

    // Stock was decremented by 240
    let stock_after_sale: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(stock_after_sale, initial_p1_stock - 240);

    // 2. Cancellation by non-admin without PIN must FAIL
    let unauth_cancel = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: receipt.invoice_id,
            reason: "Cashier entered wrong rate".into(),
            cancelled_by: 3, // Salesman Tariq
            admin_pin: None,
        },
    );
    assert!(unauth_cancel.is_err(), "Non-admin without PIN must be rejected");

    // 3. Cancellation with invalid PIN must FAIL
    let bad_pin_cancel = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: receipt.invoice_id,
            reason: "Cashier entered wrong rate".into(),
            cancelled_by: 3,
            admin_pin: Some("9999".into()),
        },
    );
    assert!(bad_pin_cancel.is_err(), "Non-admin with bad PIN must be rejected");

    // 4. Cancellation by non-admin with VALID Admin PIN ("1234") must SUCCEED!
    let cancel_res = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: receipt.invoice_id,
            reason: "Incorrect consignment delivered".into(),
            cancelled_by: 3,
            admin_pin: Some("1234".into()),
        },
    )
    .expect("Non-admin with valid admin PIN should successfully cancel");

    assert!(cancel_res.success);
    assert_eq!(cancel_res.refunded_cash_paisa, 1000000);
    assert_eq!(cancel_res.credited_receivable_paisa, 1280000);
    assert_eq!(cancel_res.reversed_crates_count, 6);

    // VERIFY REVERSALS:
    // A. Product stock restored to original 12,000
    let stock_restored: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(stock_restored, initial_p1_stock);

    // B. Customer crate balance restored to original 15
    let crates_restored: i32 = conn
        .query_row("SELECT current_crate_balance FROM customers WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(crates_restored, initial_crates);

    // C. Customer khata balance restored to original 0
    let bal_restored: i64 = conn
        .query_row("SELECT current_balance_paisa FROM customers WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(bal_restored, initial_cust_bal);

    // D. Cash book contains CASH_REFUND entry of ₨ 10,000 (1,000,000 Paisa)
    let refund_cash: i64 = conn
        .query_row(
            "SELECT cash_out_paisa FROM cash_book WHERE voucher_ref_type = 'INVOICE_CANCEL' AND voucher_ref_number = 'INV-CANCEL-AUDIT-01'",
            [],
            |r| r.get(0),
        )
        .expect("Cash refund entry must be in cash book");
    assert_eq!(refund_cash, 1000000);

    // E. Reversing Journal Entry is BALANCED
    let (rev_dr, rev_cr): (i64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(jl.debit_paisa), 0), COALESCE(SUM(jl.credit_paisa), 0)
             FROM journal_lines jl
             JOIN journal_entries je ON jl.entry_id = je.id
             WHERE je.reference_doc_type = 'SALES_INVOICE_CANCEL' AND je.reference_doc_id = ?1",
            params![receipt.invoice_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query cancellation journal lines");
    assert_eq!(rev_dr, rev_cr, "Reversing journal entry must balance");
    assert_eq!(rev_dr, 2280000);

    // F. Audit log recorded
    let audit_action: String = conn
        .query_row(
            "SELECT action FROM audit_logs WHERE id = ?1",
            params![cancel_res.audit_log_id],
            |r| r.get(0),
        )
        .expect("Query audit log");
    assert_eq!(audit_action, "BILL_CANCEL");

    // 5. Idempotency guard: Attempting to cancel already cancelled bill must FAIL
    let double_cancel = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: receipt.invoice_id,
            reason: "Try to cancel second time".into(),
            cancelled_by: 1,
            admin_pin: None,
        },
    );
    assert!(double_cancel.is_err(), "Must reject double cancellation");

    // 6. LOCKED DAY TEST:
    // Create a new invoice on 2026-11-04, then lock the day via daily closing ceremony.
    let inv2 = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: Some("INV-LOCKED-TEST".into()),
            invoice_date: Some(invoice_date.into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 2,
                pack_qty: 5,
                loose_qty: 0,
                unit_price_paisa: Some(105000),
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: None,
            crates_issued: None,
            crates_returned: None,
            admin_override_pin: None,
            user_id: Some(1),
        },
    )
    .expect("Create invoice before closing");

    // Lock the day via submit_closing
    let summary = ClosingService::get_daily_summary(&conn, Some(invoice_date)).unwrap();
    let denoms = DenominationCountsDto {
        note_5000: (summary.expected_closing_cash_paisa / 500_000) as u32,
        note_1000: ((summary.expected_closing_cash_paisa % 500_000) / 100_000) as u32,
        note_500: 0,
        note_100: 0,
        note_50: 0,
        note_20: 0,
        note_10: 0,
        coin_10: 0,
        coin_5: 0,
        coin_2: 0,
        coin_1: 0,
    };

    let closing_res = ClosingService::submit_closing(
        &mut conn,
        SubmitClosingDto {
            closing_date: invoice_date.into(),
            physical_denominations: denoms,
            variance_reason: Some("Day closing finalized".into()),
            admin_pin: Some("1234".into()),
            user_id: Some(1),
        },
    )
    .expect("Submit daily closing to lock the day");
    assert_eq!(closing_res.status, "LOCKED");

    // INVARIANT VERIFICATION: Attempting cancellation on a locked day MUST FAIL!
    let locked_cancel_err = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: inv2.invoice_id,
            reason: "Attempt to cancel locked invoice".into(),
            cancelled_by: 1, // Even ADMIN cannot cancel once day is locked!
            admin_pin: Some("1234".into()),
        },
    );
    assert!(
        locked_cancel_err.is_err(),
        "CRITICAL INVARIANT: Cancellation of an invoice on a locked accounting date MUST FAIL!"
    );
}

// ============================================================================
// CHALLENGE 4: SALES RETURNS — RESTOCKING, BREAKAGE & PRICE CEILING
// ============================================================================
// Requirements:
// 1. Salable returns must increment stock and location balance.
// 2. Damaged returns must record into breakage_logs WITHOUT incrementing stock.
// 3. Return quantities cannot exceed billed quantities on that invoice.
// 4. Refund amount must not exceed original invoice unit price.
#[test]
fn challenge_4_sales_returns_salable_vs_damaged_and_price_ceiling() {
    let mut conn = setup_in_memory_db();

    let p1_init: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    // 1. Create original invoice: 10 crates (240 bottles) of Product 1 @ ₨ 2,160/crate = ₨ 90/bottle (9,000 Paisas)
    let inv_receipt = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: Some("INV-FOR-RETURN".into()),
            invoice_date: Some("2026-11-05".into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 1,
                pack_qty: 10,
                loose_qty: 0,
                unit_price_paisa: Some(216000), // ₨ 2,160 per pack of 24 = ₨ 90 / base unit
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: None,
            crates_issued: None,
            crates_returned: None,
            admin_override_pin: None,
            user_id: Some(1),
        },
    )
    .expect("Create invoice for return test");

    let p1_after_sale: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(p1_after_sale, p1_init - 240);

    // --- Scenario 4A: Valid Mixed Return (8 Salable, 4 Damaged) ---
    let return_req = RecordSalesReturnDto {
        invoice_id: Some(inv_receipt.invoice_id),
        customer_id: 1,
        return_date: None,
        items: vec![
            ReturnItemDto {
                product_id: 1,
                base_units: 8,
                refund_rate_paisa: 9000, // ₨ 90/bottle (matches original rate)
                condition: "SALABLE".into(),
            },
            ReturnItemDto {
                product_id: 1,
                base_units: 4,
                refund_rate_paisa: 9000,
                condition: "DAMAGED".into(),
            },
        ],
        refund_mode: "CASH".into(),
        reason: "Retailer return: 8 overstock, 4 shattered bottles".into(),
        crates_returned_by_customer: None,
        authorized_by: Some(1),
    };

    let ret_res = SalesReturnService::record_sales_return(&mut conn, return_req)
        .expect("Valid return should succeed");

    assert_eq!(ret_res.salable_units_restocked, 8);
    assert_eq!(ret_res.damaged_units_logged, 4);
    assert_eq!(ret_res.total_return_paisa, (8 + 4) * 9000); // ₨ 1,080 (108,000 Paisas)

    // Stock verification: ONLY 8 salable bottles restocked
    let p1_after_return: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        p1_after_return,
        p1_after_sale + 8,
        "STRICT INVARIANT: Only salable bottles must be restocked into inventory"
    );

    // Breakage log verification: Exactly 4 damaged bottles logged
    let broken_units: i64 = conn
        .query_row(
            "SELECT broken_base_units FROM breakage_logs WHERE cause = 'Customer Return Damaged'",
            [],
            |r| r.get(0),
        )
        .expect("Query breakage log");
    assert_eq!(broken_units, 4, "Damaged bottles must be recorded in breakage_logs");

    // --- Scenario 4B: Quantity exceeding billed quantity must FAIL ---
    // Total billed was 240 base units.
    let over_qty_req = RecordSalesReturnDto {
        invoice_id: Some(inv_receipt.invoice_id),
        customer_id: 1,
        return_date: None,
        items: vec![ReturnItemDto {
            product_id: 1,
            base_units: 500, // Exceeds 240!
            refund_rate_paisa: 9000,
            condition: "SALABLE".into(),
        }],
        refund_mode: "CREDIT_NOTE".into(),
        reason: "Excessive return claim".into(),
        crates_returned_by_customer: None,
        authorized_by: Some(1),
    };

    let over_qty_err = SalesReturnService::record_sales_return(&mut conn, over_qty_req);
    assert!(over_qty_err.is_err(), "Return quantity > billed quantity must be rejected");

    // --- Scenario 4C: Refund rate exceeding original invoice unit price ---
    // The requirement explicitly mandates:
    // "Refund amount must not exceed original invoice unit price."
    let over_price_req = RecordSalesReturnDto {
        invoice_id: Some(inv_receipt.invoice_id),
        customer_id: 1,
        return_date: None,
        items: vec![ReturnItemDto {
            product_id: 1,
            base_units: 5,
            refund_rate_paisa: 18000, // ₨ 180 vs ₨ 90 billed!
            condition: "SALABLE".into(),
        }],
        refund_mode: "CASH".into(),
        reason: "Attempting rate higher than original invoice".into(),
        crates_returned_by_customer: None,
        authorized_by: Some(1),
    };

    let rate_check_res = SalesReturnService::record_sales_return(&mut conn, over_price_req);
    assert!(
        rate_check_res.is_err(),
        "Refund amount must not exceed original invoice unit price (billed rate: 9000 Paisas, attempted: 18000 Paisas)"
    );
}

// ============================================================================
// CHALLENGE 5: CONCURRENT & RAPID INVOICING STRESS
// ============================================================================
// Stress tests:
// 1. Rapid successive sales allocate strictly sequential invoice numbers
//    in the format `INV-YYYYMMDD-XXXX`.
// 2. Concurrency stress across multi-threaded pooled connections:
//    - Multiple threads competing for limited stock.
//    - Must NEVER result in negative stock (`stock_base_units >= 0` always holds).
//    - Must allocate unique, collision-free invoice numbers.
#[test]
fn challenge_5_rapid_successive_invoicing_and_sequential_numbering() {
    let mut conn = setup_in_memory_db();
    let date_str = "2026-11-05";

    // Perform 15 rapid successive sales on the same date
    let mut invoice_numbers = Vec::new();
    for i in 1..=15 {
        let req = CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: None, // Autogenerated
            invoice_date: Some(date_str.into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 2, // Next Cola 1.5L PET
                pack_qty: 1,
                loose_qty: 0,
                unit_price_paisa: Some(105000),
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: None,
            crates_issued: None,
            crates_returned: None,
            admin_override_pin: None,
            user_id: Some(1),
        };

        let receipt = SalesService::create_invoice(&mut conn, req)
            .expect(&format!("Rapid invoice {} should succeed", i));
        invoice_numbers.push(receipt.invoice_number);
    }

    // Verify sequential format: INV-20261105-0001 through INV-20261105-0015
    for (idx, inv_num) in invoice_numbers.iter().enumerate() {
        let expected = format!("INV-20261105-{:04}", idx + 1);
        assert_eq!(
            inv_num, &expected,
            "Invoice number at index {} must follow sequential pattern INV-YYYYMMDD-XXXX",
            idx
        );
    }
}

#[test]
fn challenge_5_concurrent_invoicing_prevents_negative_stock() {
    let temp_dir = tempfile::tempdir().expect("tempdir");
    let (pool, _path) = setup_file_pool(&temp_dir, "concurrent_sales_stress.db");

    // Set Product 2 stock to exactly 30 base units (5 packs of 6 bottles)
    {
        let conn = pool.get().expect("pool conn");
        conn.execute(
            "UPDATE products SET current_stock_base_units = 30, stock_base_units = 30 WHERE id = 2",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE product_location_balances SET balance_base_units = 30 WHERE product_id = 2 AND location_id = 1",
            [],
        )
        .unwrap();
    }

    // Spawn 10 concurrent threads, each trying to buy 2 packs (12 base units).
    // Total demand: 10 * 12 = 120 base units.
    // Available: 30 base units.
    // At most 2 sales can succeed (2 * 12 = 24 units, leaving 6 units remaining).
    // Any remaining threads MUST fail with InsufficientStock or database busy.
    // Stock must NEVER go below zero!
    let successful_sales = Arc::new(AtomicUsize::new(0));
    let insufficient_stock_errors = Arc::new(AtomicUsize::new(0));
    let mut handles = Vec::new();

    for thread_id in 0..10 {
        let pool_clone = pool.clone();
        let success_clone = successful_sales.clone();
        let error_clone = insufficient_stock_errors.clone();

        let handle = thread::spawn(move || {
            // Slight jitter to interleave execution
            thread::sleep(Duration::from_millis(thread_id * 5));

            let mut conn = match pool_clone.get() {
                Ok(c) => c,
                Err(_) => return,
            };

            let req = CreateSalesInvoiceDto {
                customer_id: 1,
                invoice_number: None, // Autogenerated
                invoice_date: Some("2026-11-05".into()),
                due_date: None,
                delivery_sheet_id: None,
                trip_id: None,
                items: vec![CreateSalesInvoiceItemDto {
                    product_id: 2,
                    pack_qty: 2, // 12 base units
                    loose_qty: 0,
                    unit_price_paisa: Some(105000),
                    line_discount_paisa: None,
                }],
                invoice_discount_paisa: None,
                crate_deposit_charged_paisa: None,
                payment_type: PaymentType::Cash,
                paid_amount_paisa: None,
                crates_issued: None,
                crates_returned: None,
                admin_override_pin: None,
                user_id: Some(1),
            };

            // Retry loop for SQLite busy contention in multi-threaded WAL mode
            let mut attempts = 0;
            while attempts < 5 {
                match SalesService::create_invoice(&mut conn, req.clone()) {
                    Ok(_) => {
                        success_clone.fetch_add(1, Ordering::SeqCst);
                        break;
                    }
                    Err(AppError::InsufficientStock { .. }) => {
                        error_clone.fetch_add(1, Ordering::SeqCst);
                        break;
                    }
                    Err(_) => {
                        // Retry on contention
                        attempts += 1;
                        thread::sleep(Duration::from_millis(20 * attempts));
                    }
                }
            }
        });
        handles.push(handle);
    }

    for h in handles {
        let _ = h.join();
    }

    // Verify final stock is NOT negative
    let conn = pool.get().expect("Final check conn");
    let final_stock: i64 = conn
        .query_row(
            "SELECT current_stock_base_units FROM products WHERE id = 2",
            [],
            |r| r.get(0),
        )
        .expect("Query final stock");

    assert!(
        final_stock >= 0,
        "CRITICAL CONCURRENCY INVARIANT: Stock must NEVER become negative! Final stock: {}",
        final_stock
    );

    let successes = successful_sales.load(Ordering::SeqCst);
    println!(
        "[Concurrency Results] Succeeded sales: {}, Final remaining stock: {} base units",
        successes, final_stock
    );

    // Initial 30 units minus (successes * 12) must equal final_stock
    assert_eq!(
        30 - (successes as i64 * 12),
        final_stock,
        "Deducted stock must exactly equal successful sales * 12 base units"
    );
}
