use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::domain::models::PaymentType;
use logar_pos_lib::services::cancellations::*;
use logar_pos_lib::services::closing::*;
use logar_pos_lib::services::purchases::*;
use logar_pos_lib::services::returns::*;
use logar_pos_lib::services::sales::*;
use rusqlite::Connection;

fn setup_test_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations");
    conn
}

// ============================================================================
// TEST 1: POS CASH SALE & GOLDEN CASH INVARIANT
// ============================================================================
#[test]
fn test_pos_cash_sale_golden_cash_invariant() {
    let mut conn = setup_test_db();

    // Initial stock for Product 1 (Next Cola 250ml Glass, 24 bottles/pack) is 12,000
    let initial_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .expect("Query initial stock");
    assert_eq!(initial_stock, 12000);

    // Initial cash book count
    let initial_cash_entries: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .unwrap_or(0);

    // Cash sale of 10 cartons of Product 1 @ ₨ 2,160/carton = ₨ 21,600 (2,160,000 Paisas)
    // 10 cartons * 24 bottles = 240 base bottles
    let req = CreateSalesInvoiceDto {
        customer_id: 1, // Bismillah Kiryana Store
        invoice_number: Some("INV-TEST-CASH-01".into()),
        invoice_date: Some("2026-11-04".into()),
        due_date: None,
        delivery_sheet_id: None,
        trip_id: None,
        items: vec![CreateSalesInvoiceItemDto {
            product_id: 1,
            pack_qty: 10,
            loose_qty: 0,
            unit_price_paisa: Some(216000), // ₨ 2,160 / crate
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
    };

    let receipt = SalesService::create_invoice(&mut conn, req).expect("Cash invoice creation should succeed");

    assert_eq!(receipt.invoice_number, "INV-TEST-CASH-01");
    assert_eq!(receipt.net_total_paisa, 2160000);
    assert_eq!(receipt.paid_amount_paisa, 2160000);
    assert_eq!(receipt.due_amount_paisa, 0);
    assert_eq!(receipt.status, logar_pos_lib::domain::models::InvoiceStatus::Paid);

    // Verify stock decremented by exactly 240 base units
    let new_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .expect("Query new stock");
    assert_eq!(new_stock, initial_stock - 240);

    // Verify Cash Book incremented by paid_amount_paisa
    let new_cash_entries: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .expect("Query cash book entries");
    assert_eq!(new_cash_entries, initial_cash_entries + 1);

    let (cash_in, running_bal): (i64, i64) = conn
        .query_row(
            "SELECT cash_in_paisa, running_balance_paisa FROM cash_book WHERE voucher_ref_number = 'INV-TEST-CASH-01'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query cash book entry details");
    assert_eq!(cash_in, 2160000);
    assert_eq!(running_bal, 2160000);

    // Customer balance must be completely unchanged (0 Udhaar)
    let cust_balance: i64 = conn
        .query_row("SELECT current_balance_paisa FROM customers WHERE id = 1", [], |r| r.get(0))
        .expect("Query customer balance");
    assert_eq!(cust_balance, 0);

    // Balanced Journal Entries check
    let (debit_sum, credit_sum): (i64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0), COALESCE(SUM(credit_paisa), 0) 
             FROM journal_lines WHERE entry_id = ?1",
            rusqlite::params![receipt.sales_journal_entry_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query sales journal lines");
    assert_eq!(debit_sum, credit_sum, "Sales journal voucher must balance");
    assert_eq!(debit_sum, 2160000);

    // COGS Journal Entries check
    let (cogs_debit, cogs_credit): (i64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0), COALESCE(SUM(credit_paisa), 0) 
             FROM journal_lines WHERE entry_id = ?1",
            rusqlite::params![receipt.cogs_journal_entry_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query COGS journal lines");
    assert_eq!(cogs_debit, cogs_credit, "COGS journal voucher must balance");

    // Thermal receipt formatting check
    assert!(receipt.formatted_thermal_receipt.contains("INV-TEST-CASH-01"));
    assert!(receipt.formatted_thermal_receipt.contains("Bismillah Kiryana Store"));
}

// ============================================================================
// TEST 2: POS CREDIT SALE & STRICT ZERO CASH BOOK INVARIANT
// ============================================================================
#[test]
fn test_pos_credit_sale_zero_cash_book_invariant() {
    let mut conn = setup_test_db();

    // Acceptance Criteria 1: Selling stock with 0 cash received increases customer debt,
    // decrements stock, and leaves the cash book completely unchanged.
    let initial_cash_entries: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .unwrap_or(0);

    let initial_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0))
        .expect("Query initial stock"); // Product 2: Next Cola 1.5L PET (6 btl/pack)

    // Sell 20 packs on CREDIT @ ₨ 1,050/pack = ₨ 21,000 (2,100,000 Paisas)
    // 20 packs * 6 bottles = 120 base bottles
    let req = CreateSalesInvoiceDto {
        customer_id: 1,
        invoice_number: Some("INV-TEST-CREDIT-01".into()),
        invoice_date: Some("2026-11-04".into()),
        due_date: None,
        delivery_sheet_id: None,
        trip_id: None,
        items: vec![CreateSalesInvoiceItemDto {
            product_id: 2,
            pack_qty: 20,
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

    let receipt = SalesService::create_invoice(&mut conn, req).expect("Credit invoice should succeed");

    assert_eq!(receipt.net_total_paisa, 2100000);
    assert_eq!(receipt.paid_amount_paisa, 0);
    assert_eq!(receipt.due_amount_paisa, 2100000);
    assert_eq!(receipt.status, logar_pos_lib::domain::models::InvoiceStatus::Unpaid);

    // 1. Stock must be decremented
    let new_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0))
        .expect("Query new stock");
    assert_eq!(new_stock, initial_stock - 120);

    // 2. Customer balance must be incremented by exact debt
    let cust_bal: i64 = conn
        .query_row("SELECT current_balance_paisa FROM customers WHERE id = 1", [], |r| r.get(0))
        .expect("Query customer balance");
    assert_eq!(cust_bal, 2100000);

    // 3. Customer ledger entry created
    let ledger_debit: i64 = conn
        .query_row(
            "SELECT debit FROM customer_ledger WHERE customer_id = 1 AND voucher_ref_id = ?1",
            rusqlite::params![receipt.invoice_id],
            |r| r.get(0),
        )
        .expect("Query customer ledger debit");
    assert_eq!(ledger_debit, 21000); // ₨ 21,000

    // 4. GOLDEN CASH INVARIANT: ZERO entries created in cash_book!
    let new_cash_entries: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .expect("Query cash book count");
    assert_eq!(new_cash_entries, initial_cash_entries, "Credit sale must NEVER create cash book rows");
}

// ============================================================================
// TEST 3: SPLIT PAYMENT, CRATE CIRCULATION & SECURITY DEPOSITS
// ============================================================================
#[test]
fn test_pos_split_payment_and_crate_exchange() {
    let mut conn = setup_test_db();

    // Customer purchases 5 crates of Product 1 (120 bottles) = ₨ 10,800 (1,080,000 Paisa)
    // Crate deposit charged: ₨ 600 (60,000 Paisa)
    // Total Net Payable: ₨ 11,400 (1,140,000 Paisa)
    // Tendered Cash: ₨ 5,000 (500,000 Paisa)
    // Remaining Udhaar: ₨ 6,400 (640,000 Paisa)
    // Crates Issued: 5, Returned: 3 (Net +2 crates)
    let req = CreateSalesInvoiceDto {
        customer_id: 1,
        invoice_number: Some("INV-SPLIT-01".into()),
        invoice_date: Some("2026-11-04".into()),
        due_date: None,
        delivery_sheet_id: None,
        trip_id: None,
        items: vec![CreateSalesInvoiceItemDto {
            product_id: 1,
            pack_qty: 5,
            loose_qty: 0,
            unit_price_paisa: Some(216000),
            line_discount_paisa: None,
        }],
        invoice_discount_paisa: None,
        crate_deposit_charged_paisa: Some(60000),
        payment_type: PaymentType::Split,
        paid_amount_paisa: Some(500000),
        crates_issued: Some(5),
        crates_returned: Some(3),
        admin_override_pin: None,
        user_id: Some(1),
    };

    let receipt = SalesService::create_invoice(&mut conn, req).expect("Split payment should succeed");

    assert_eq!(receipt.net_total_paisa, 1140000);
    assert_eq!(receipt.paid_amount_paisa, 500000);
    assert_eq!(receipt.due_amount_paisa, 640000);
    assert_eq!(receipt.status, logar_pos_lib::domain::models::InvoiceStatus::Partial);

    // Cash Book has exactly paid portion (₨ 5,000)
    let cash_in: i64 = conn
        .query_row(
            "SELECT cash_in_paisa FROM cash_book WHERE voucher_ref_number = 'INV-SPLIT-01'",
            [],
            |r| r.get(0),
        )
        .expect("Query cash book entry");
    assert_eq!(cash_in, 500000);

    // Customer balance increased by due portion (₨ 6,400)
    let cust_bal: i64 = conn
        .query_row("SELECT current_balance_paisa FROM customers WHERE id = 1", [], |r| r.get(0))
        .expect("Query customer balance");
    assert_eq!(cust_bal, 640000);

    // Customer crate balance updated: initial 15 + (5 - 3) = 17 crates
    let crate_bal: i32 = conn
        .query_row("SELECT current_crate_balance FROM customers WHERE id = 1", [], |r| r.get(0))
        .expect("Query crate balance");
    assert_eq!(crate_bal, 17);

    // Security deposit recorded as liability under Account 2100
    let dep_liability: i64 = conn
        .query_row("SELECT security_deposit_balance_paisa FROM customers WHERE id = 1", [], |r| r.get(0))
        .expect("Query deposit liability");
    assert_eq!(dep_liability, 60000);
}

// ============================================================================
// TEST 4: INSUFFICIENT STOCK & ATOMIC TRANSACTION ROLLBACK
// ============================================================================
#[test]
fn test_insufficient_stock_rejection_and_clean_rollback() {
    let mut conn = setup_test_db();

    // Attempt to sell 1,000 crates (24,000 bottles) of Product 1 when only 12,000 exist
    let req = CreateSalesInvoiceDto {
        customer_id: 1,
        invoice_number: Some("INV-OVERDRAFT".into()),
        invoice_date: Some("2026-11-04".into()),
        due_date: None,
        delivery_sheet_id: None,
        trip_id: None,
        items: vec![CreateSalesInvoiceItemDto {
            product_id: 1,
            pack_qty: 1000,
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

    let err = SalesService::create_invoice(&mut conn, req);
    assert!(err.is_err());
    match err {
        Err(AppError::InsufficientStock {
            product_id,
            requested_base,
            available_base,
        }) => {
            assert_eq!(product_id, 1);
            assert_eq!(requested_base, 24000);
            assert_eq!(available_base, 12000);
        }
        _ => panic!("Expected InsufficientStock error"),
    }

    // Verify stock remains untouched at 12,000
    let stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .expect("Query stock");
    assert_eq!(stock, 12000);

    // Verify 0 invoices were created
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sales_invoices WHERE invoice_number = 'INV-OVERDRAFT'", [], |r| r.get(0))
        .expect("Query count");
    assert_eq!(count, 0);
}

// ============================================================================
// TEST 5: CREDIT LIMIT ENFORCEMENT & ADMIN SUPERVISOR PIN OVERRIDE
// ============================================================================
#[test]
fn test_credit_limit_breach_and_admin_override() {
    let mut conn = setup_test_db();

    // Customer 3 (Subhanallah Cold Corner) has credit_limit_paisa = 10,000,000 (₨ 100,000)
    // Attempt to purchase 100 packs of Product 2 on credit = ₨ 105,000 (10,500,000 Paisas) -> BREACH
    let req_fail = CreateSalesInvoiceDto {
        customer_id: 3,
        invoice_number: Some("INV-BREACH-FAIL".into()),
        invoice_date: Some("2026-11-04".into()),
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
        admin_override_pin: None, // No PIN
        user_id: Some(1),
    };

    let err1 = SalesService::create_invoice(&mut conn, req_fail.clone());
    assert!(err1.is_err(), "Must reject credit breach without PIN");
    match err1 {
        Err(AppError::CreditLimitExceeded { customer_id, limit_paisa, attempted_paisa, .. }) => {
            assert_eq!(customer_id, 3);
            assert_eq!(limit_paisa, 10000000);
            assert_eq!(attempted_paisa, 10500000);
        }
        _ => panic!("Expected CreditLimitExceeded error"),
    }

    // Attempt with incorrect PIN ("9999")
    let mut req_wrong_pin = req_fail.clone();
    req_wrong_pin.admin_override_pin = Some("9999".into());
    let err2 = SalesService::create_invoice(&mut conn, req_wrong_pin);
    assert!(err2.is_err(), "Must reject credit breach with incorrect PIN");

    // Attempt with valid Admin PIN ("1234")
    let mut req_valid_pin = req_fail.clone();
    req_valid_pin.invoice_number = Some("INV-BREACH-OVERRIDDEN".into());
    req_valid_pin.admin_override_pin = Some("1234".into());

    let receipt = SalesService::create_invoice(&mut conn, req_valid_pin).expect("Valid PIN override must succeed");
    assert_eq!(receipt.invoice_number, "INV-BREACH-OVERRIDDEN");
    assert_eq!(receipt.due_amount_paisa, 10500000);

    // Verify audit log has CREDIT_LIMIT_OVERRIDE entry
    let audit_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM audit_logs WHERE action = 'CREDIT_LIMIT_OVERRIDE' AND entity_id = '3'",
            [],
            |r| r.get(0),
        )
        .expect("Query audit log");
    assert_eq!(audit_count, 1);
}

// ============================================================================
// TEST 6: LANDED COST PURCHASING & ZERO-DRIFT REMAINDER DISTRIBUTION
// ============================================================================
#[test]
fn test_landed_cost_purchasing_zero_drift_apportionment() {
    let mut conn = setup_test_db();

    // Initial stock of Product 1: 12,000 base bottles
    // Initial stock of Product 2: 3,000 base bottles
    let p1_init: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0)).unwrap();
    let p2_init: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0)).unwrap();

    // Purchase:
    // Item 1: 100 packs of Product 1 @ ₨ 1,800/pack = ₨ 180,000 (18,000,000 Paisas) (2,400 base bottles)
    // Item 2: 50 packs of Product 2 @ ₨ 900/pack = ₨ 45,000 (4,500,000 Paisas) (300 base bottles)
    // Base goods = ₨ 225,000 (22,500,000 Paisas)
    // Freight: ₨ 15,000 (1,500,000 Paisas)
    // Unloading Labor: ₨ 3,500 (350,000 Paisas)
    // Transit Tax: ₨ 1,200 (120,000 Paisas)
    // Total Direct Expenses = ₨ 19,700 (1,970,000 Paisas)
    // Total Landed Cost = ₨ 244,700 (24,470,000 Paisas)
    let req = RecordPurchaseDto {
        supplier_id: 1, // Nextco Beverages Plant Hub
        invoice_no: "PUR-LANDED-01".into(),
        supplier_invoice_no: Some("FAC-9941".into()),
        purchase_date: "2026-11-04".into(),
        items: vec![
            PurchaseItemInputDto {
                product_id: 1,
                pack_qty: 100,
                loose_qty: 0,
                unit_cost_paisa: 180000,
            },
            PurchaseItemInputDto {
                product_id: 2,
                pack_qty: 50,
                loose_qty: 0,
                unit_cost_paisa: 90000,
            },
        ],
        freight_paisa: Some(1500000),
        unloading_labor_paisa: Some(350000),
        transit_tax_paisa: Some(120000),
        payment_status: "UNPAID".into(),
        payment_mode: Some("CREDIT".into()),
        paid_amount_paisa: Some(0),
        empty_crates_returned_to_factory: Some(50),
        notes: Some("Full truckload consignment".into()),
        user_id: Some(1),
    };

    let res = PurchaseService::record_purchase(&mut conn, req).expect("Purchase recording should succeed");

    assert_eq!(res.base_invoice_cost_paisa, 22500000);
    assert_eq!(res.total_landed_cost_paisa, 24470000);
    assert_eq!(res.due_amount_paisa, 24470000);

    // Verify EXACT zero-drift remainder distribution
    let sum_allocated: i64 = conn
        .query_row(
            "SELECT SUM(landed_cost_allocated_paisa) FROM purchase_invoice_items WHERE purchase_id = ?1",
            rusqlite::params![res.purchase_id],
            |r| r.get(0),
        )
        .expect("Query allocated surcharges");
    assert_eq!(sum_allocated, 1970000, "Sum of allocated surcharges must exactly equal 1,970,000 Paisas");

    // Stock increment verification
    let p1_after: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0)).unwrap();
    let p2_after: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0)).unwrap();
    assert_eq!(p1_after, p1_init + 2400);
    assert_eq!(p2_after, p2_init + 300);

    // Supplier payable updated
    let payable: i64 = conn.query_row("SELECT current_payable_paisa FROM suppliers WHERE id = 1", [], |r| r.get(0)).unwrap();
    assert_eq!(payable, 24470000);

    // Supplier ledger entry created
    let sl_credit: i64 = conn
        .query_row("SELECT credit FROM supplier_ledger WHERE supplier_id = 1 AND voucher_ref_id = ?1", rusqlite::params![res.purchase_id], |r| r.get(0))
        .expect("Query supplier ledger");
    assert_eq!(sl_credit, 244700);

    // Balanced Journal Entry verification (Dr Inventory 1100, Cr AP 2010)
    let (dr, cr): (i64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0), COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE entry_id = ?1",
            rusqlite::params![res.journal_entry_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query journal lines");
    assert_eq!(dr, cr);
    assert_eq!(dr, 24470000);
}

// ============================================================================
// TEST 7: BILL CANCELLATION & AUDIT TRAIL
// ============================================================================
#[test]
fn test_bill_cancellation_atomic_reversal_and_audit() {
    let mut conn = setup_test_db();

    // 1. Create a sale
    let req = CreateSalesInvoiceDto {
        customer_id: 1,
        invoice_number: Some("INV-CANCEL-ME".into()),
        invoice_date: Some("2026-11-04".into()),
        due_date: None,
        delivery_sheet_id: None,
        trip_id: None,
        items: vec![CreateSalesInvoiceItemDto {
            product_id: 1,
            pack_qty: 5, // 120 bottles
            loose_qty: 0,
            unit_price_paisa: Some(216000),
            line_discount_paisa: None,
        }],
        invoice_discount_paisa: None,
        crate_deposit_charged_paisa: None,
        payment_type: PaymentType::Split,
        paid_amount_paisa: Some(500000), // ₨ 5,000 cash
        crates_issued: Some(5),
        crates_returned: Some(2),
        admin_override_pin: None,
        user_id: Some(1),
    };

    let receipt = SalesService::create_invoice(&mut conn, req).expect("Create sale");
    let initial_stock: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0)).unwrap();

    // 2. Reject cancellation with empty reason
    let err_empty = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: receipt.invoice_id,
            reason: "   ".into(),
            cancelled_by: 1,
            admin_pin: None,
        },
    );
    assert!(err_empty.is_err(), "Must reject empty cancellation reason");

    // 3. Reject cancellation by non-admin without PIN
    // User 3 is SALESMAN
    let err_unauth = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: receipt.invoice_id,
            reason: "Mistake by cashier".into(),
            cancelled_by: 3,
            admin_pin: None,
        },
    );
    assert!(err_unauth.is_err(), "Must reject non-admin without PIN");

    // 4. Cancel bill with Admin user (id: 1)
    let cancel_res = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: receipt.invoice_id,
            reason: "Customer order rejected on delivery".into(),
            cancelled_by: 1,
            admin_pin: Some("1234".into()),
        },
    )
    .expect("Valid cancellation should succeed");

    assert!(cancel_res.success);
    assert_eq!(cancel_res.restored_stock_items, 1);
    assert_eq!(cancel_res.refunded_cash_paisa, 500000);

    // Verify stock restored
    let restored_stock: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0)).unwrap();
    assert_eq!(restored_stock, initial_stock + 120);

    // Verify invoice marked CANCELLED
    let (status, is_cancelled): (String, i32) = conn
        .query_row("SELECT status, is_cancelled FROM sales_invoices WHERE id = ?1", rusqlite::params![receipt.invoice_id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    assert_eq!(status, "CANCELLED");
    assert_eq!(is_cancelled, 1);

    // Verify Cash Book refund entry created
    let refund_cash: i64 = conn
        .query_row("SELECT cash_out_paisa FROM cash_book WHERE voucher_ref_type = 'INVOICE_CANCEL'", [], |r| r.get(0))
        .expect("Query cash refund");
    assert_eq!(refund_cash, 500000);

    // Verify audit log record
    let audit_action: String = conn
        .query_row("SELECT action FROM audit_logs WHERE id = ?1", rusqlite::params![cancel_res.audit_log_id], |r| r.get(0))
        .expect("Query audit log");
    assert_eq!(audit_action, "BILL_CANCEL");

    // 5. Reject double-cancellation (idempotency guard)
    let err_double = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: receipt.invoice_id,
            reason: "Try to cancel again".into(),
            cancelled_by: 1,
            admin_pin: None,
        },
    );
    assert!(err_double.is_err(), "Must reject already cancelled invoice");
}

// ============================================================================
// TEST 8: SALES RETURNS & BREAKAGE ROUTING
// ============================================================================
#[test]
fn test_sales_returns_salable_vs_damaged_routing() {
    let mut conn = setup_test_db();

    let p1_init: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0)).unwrap();

    // Customer returns 10 bottles of Product 1:
    // 7 Salable bottles (restocked to warehouse)
    // 3 Damaged bottles (diverted to Breakage register, NOT added to sellable stock)
    let req = RecordSalesReturnDto {
        invoice_id: None,
        customer_id: 1,
        return_date: None,
        items: vec![
            ReturnItemDto {
                product_id: 1,
                base_units: 7,
                refund_rate_paisa: 9000, // ₨ 90 / bottle
                condition: "SALABLE".into(),
            },
            ReturnItemDto {
                product_id: 1,
                base_units: 3,
                refund_rate_paisa: 9000,
                condition: "DAMAGED".into(),
            },
        ],
        refund_mode: "CREDIT_NOTE".into(),
        reason: "Retailer return: 7 overstock, 3 chipped necks".into(),
        crates_returned_by_customer: Some(0),
        authorized_by: Some(1),
    };

    let res = SalesReturnService::record_sales_return(&mut conn, req).expect("Sales return should succeed");

    assert_eq!(res.salable_units_restocked, 7);
    assert_eq!(res.damaged_units_logged, 3);
    assert_eq!(res.total_return_paisa, 90000); // 10 * 90 = ₨ 900 (90,000 Paisas)

    // Stock verification: Only the 7 salable bottles should increase inventory
    let p1_after: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0)).unwrap();
    assert_eq!(p1_after, p1_init + 7, "Only salable bottles should be restocked into sellable stock");

    // Breakage log verification: Exactly 3 damaged bottles logged
    let broken_units: i64 = conn
        .query_row("SELECT broken_base_units FROM breakage_logs WHERE cause = 'Customer Return Damaged'", [], |r| r.get(0))
        .expect("Query breakage log");
    assert_eq!(broken_units, 3);

    // Customer ledger verification: Credit note of ₨ 900 created
    let cl_credit: i64 = conn
        .query_row("SELECT credit FROM customer_ledger WHERE voucher_type = 'SALE_RETURN' ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .expect("Query customer ledger");
    assert_eq!(cl_credit, 900);
}

// ============================================================================
// TEST 9: DAILY CLOSING CEREMONY, VARIANCE ACCOUNTING & DAY LOCK
// ============================================================================
#[test]
fn test_daily_closing_ceremony_variance_reconciliation_and_day_lock() {
    let mut conn = setup_test_db();
    let closing_date = "2026-11-04";

    // 1. Setup day transactions
    // Opening float = 0 (first closing)
    // POS Cash Sale = ₨ 20,000
    let _ = SalesService::create_invoice(
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
                unit_price_paisa: Some(200000), // ₨ 2,000 * 10 = ₨ 20,000
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
    .expect("Create cash sale");

    // Credit Sale = ₨ 30,000 (must NOT touch liquid cash!)
    let _ = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: Some("INV-CLS-02".into()),
            invoice_date: Some(closing_date.into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 2,
                pack_qty: 30,
                loose_qty: 0,
                unit_price_paisa: Some(100000), // ₨ 1,000 * 30 = ₨ 30,000
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
        },
    )
    .expect("Create credit sale");

    // 2. Query summary
    let summary = ClosingService::get_daily_summary(&conn, Some(closing_date)).expect("Query daily closing summary");
    assert_eq!(summary.opening_cash_paisa, 0);
    assert_eq!(summary.cash_in.pos_cash_sales_paisa, 2000000); // ₨ 20,000
    assert_eq!(summary.expected_closing_cash_paisa, 2000000);
    assert_eq!(summary.sales_stats.total_invoices_count, 2);
    assert_eq!(summary.sales_stats.total_cash_sales_paisa, 2000000);
    assert_eq!(summary.sales_stats.total_credit_sales_paisa, 3000000);

    // 3. Count physical cash with exact balance
    // 4 notes of ₨ 5,000 = ₨ 20,000
    let denoms = DenominationCountsDto {
        note_5000: 4,
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
    };
    assert_eq!(denoms.calculate_total_paisa(), 2000000);

    // Submit closing
    let submit_req = SubmitClosingDto {
        closing_date: closing_date.into(),
        physical_denominations: denoms,
        variance_reason: Some("Reconciled perfectly".into()),
        admin_pin: Some("1234".into()),
        user_id: Some(1),
    };

    let closing_res = ClosingService::submit_closing(&mut conn, submit_req).expect("Submit closing should succeed");

    assert_eq!(closing_res.variance_paisa, 0);
    assert_eq!(closing_res.variance_type, "BALANCED");
    assert_eq!(closing_res.status, "LOCKED");
    assert_eq!(closing_res.locked_invoices_count, 2);

    // 4. Verify Day Lock trigger protection
    // Any attempt to update locked sales invoices must fail at the SQLite engine level!
    let trigger_test = conn.execute(
        "UPDATE sales_invoices SET discount_paisa = 500 WHERE invoice_date = '2026-11-04'",
        [],
    );
    assert!(trigger_test.is_err(), "Day Lock trigger must abort updates on locked sales invoices");

    let trigger_del_test = conn.execute(
        "DELETE FROM daily_closings WHERE closing_date = '2026-11-04'",
        [],
    );
    assert!(trigger_del_test.is_err(), "Day Lock trigger must abort deletion of daily closing record");
}
