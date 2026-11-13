use rusqlite::{params, Connection};
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::dtos::*;
use logar_pos_lib::services::accounting::AccountingService;
use logar_pos_lib::services::closing::{ClosingService, DenominationCountsDto, SubmitClosingDto};
use logar_pos_lib::services::logistics::LogisticsService;
use logar_pos_lib::domain::models::PaymentType;
use logar_pos_lib::services::sales::{CreateSalesInvoiceDto, CreateSalesInvoiceItemDto, SalesService};
use logar_pos_lib::services::settlement::SettlementService;

/// Initialize an isolated in-memory SQLite database with migrations 001-007
fn setup_test_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations 001 through 007");
    conn
}

/// Adversarial Double-Entry Balance Oracle:
/// Every single journal voucher generated in the database must satisfy Sum(Debits) == Sum(Credits) > 0
fn assert_all_journal_entries_balanced(conn: &Connection) {
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.entry_number, e.voucher_type,
                    COALESCE(SUM(l.debit_paisa), 0) AS total_debit,
                    COALESCE(SUM(l.credit_paisa), 0) AS total_credit
             FROM journal_entries e
             JOIN journal_lines l ON e.id = l.entry_id
             GROUP BY e.id, e.entry_number, e.voucher_type",
        )
        .expect("Prepare journal balance check query");

    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
            ))
        })
        .expect("Execute journal balance check query");

    let mut count = 0;
    for row in rows {
        let (id, num, vtype, dr, cr) = row.expect("Read journal entry row");
        count += 1;
        assert_eq!(
            dr, cr,
            "Journal Entry #{} ({}, {}) is UNBALANCED: Debit ({}) != Credit ({})",
            id, num, vtype, dr, cr
        );
        assert!(
            dr > 0,
            "Journal Entry #{} ({}, {}) has zero debit/credit total",
            id, num, vtype
        );
    }
    assert!(count > 0, "At least one journal entry must be validated");
}

// ============================================================================
// EMPIRICAL TEST 1: ROUTE VS DEPOT RECOVERY ACCOUNTING ISOLATION
// ============================================================================

#[test]
fn test_route_recovery_debits_driver_float_and_bypasses_cash_book() {
    let mut conn = setup_test_db();
    let date = "2026-11-11";

    // 1. Setup Customer with 50,000 PKR outstanding credit balance
    let _inv = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: None,
            invoice_date: Some(date.into()),
            due_date: Some(date.into()),
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 1,
                pack_qty: 25,
                loose_qty: 0,
                unit_price_paisa: None,
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Credit,
            paid_amount_paisa: Some(0),
            crates_issued: Some(25),
            crates_returned: Some(0),
            admin_override_pin: None,
            user_id: Some(1),
        },
    )
    .expect("Create customer invoice");

    // Capture initial cash_book count and running balance
    let initial_cb_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .unwrap();
    let initial_cb_bal: i64 = conn
        .query_row("SELECT COALESCE(SUM(cash_in_paisa - cash_out_paisa), 0) FROM cash_book", [], |r| r.get(0))
        .unwrap();

    // 2. Create and issue Route Delivery Sheet
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(date.into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(45000),
            empty_crates_loaded: Some(0),
            items: vec![LoadingItemInput {
                product_id: 2,
                pack_qty: 10,
                loose_qty: 0,
            }],
            notes: Some("Route recovery isolation test".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet");

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:00:00".into()),
            opening_km: Some(45000),
            empty_crates_loaded: Some(0),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue loading sheet");

    // 3. Record ROUTE Cash Recovery: 20,000 PKR collected on route (delivery_sheet_id: Some(sheet.id))
    let route_rec = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 2000000, // 20,000 PKR
            payment_mode: "CASH".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some(date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Route collection on Beat 1".into()),
            user_id: Some(3),
            delivery_sheet_id: Some(sheet.id),
        },
    )
    .expect("Record route recovery");

    // Verify DTO reflects delivery_sheet_id
    assert_eq!(route_rec.delivery_sheet_id, Some(sheet.id));

    // Forensic DB checks on customer_recoveries
    let (saved_sheet_id, saved_cb_id, saved_jv_id): (Option<i64>, Option<i64>, i64) = conn
        .query_row(
            "SELECT delivery_sheet_id, cash_book_id, journal_entry_id FROM customer_recoveries WHERE id = ?1",
            params![route_rec.recovery_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .expect("Query customer recovery record");

    assert_eq!(saved_sheet_id, Some(sheet.id), "Recovery must store delivery_sheet_id");
    assert!(saved_cb_id.is_none(), "Route recovery MUST NOT link to a cash_book entry");

    // Forensic check on Cash Book: MUST BE UNTOUCHED!
    let current_cb_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .unwrap();
    let current_cb_bal: i64 = conn
        .query_row("SELECT COALESCE(SUM(cash_in_paisa - cash_out_paisa), 0) FROM cash_book", [], |r| r.get(0))
        .unwrap();
    assert_eq!(current_cb_count, initial_cb_count, "Cash book row count must not change on route recovery");
    assert_eq!(current_cb_bal, initial_cb_bal, "Cash book balance must not change on route recovery");

    // Forensic check on Journal Entry:
    // MUST Debit Account 4 (1030 Driver Floating Cash / Petty Cash)
    // MUST Credit Account 8 (1200 Accounts Receivable)
    let lines: Vec<(i64, i64, i64)> = {
        let mut stmt = conn
            .prepare("SELECT account_id, debit_paisa, credit_paisa FROM journal_lines WHERE entry_id = ?1 ORDER BY id ASC")
            .unwrap();
        stmt.query_map(params![saved_jv_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect()
    };

    assert_eq!(lines.len(), 2, "Journal Entry must contain exactly 2 lines");
    // Line 1: Debit Account 4 (1030 Driver Float)
    assert_eq!(lines[0].0, 4, "Debit account MUST be Account 4 (1030 Driver Floating Cash)");
    assert_eq!(lines[0].1, 2000000, "Debit amount must be 20,000 PKR");
    assert_eq!(lines[0].2, 0);

    // Line 2: Credit Account 8 (1200 Accounts Receivable)
    assert_eq!(lines[1].0, 8, "Credit account MUST be Account 8 (1200 Accounts Receivable)");
    assert_eq!(lines[1].1, 0);
    assert_eq!(lines[1].2, 2000000, "Credit amount must be 20,000 PKR");

    assert_all_journal_entries_balanced(&conn);
}

#[test]
fn test_depot_counter_recovery_debits_cash_on_hand_and_enters_cash_book() {
    let mut conn = setup_test_db();
    let date = "2026-11-11";

    // 1. Setup Customer with 30,000 PKR debt
    let _inv = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: None,
            invoice_date: Some(date.into()),
            due_date: Some(date.into()),
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 1,
                pack_qty: 15,
                loose_qty: 0,
                unit_price_paisa: None,
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Credit,
            paid_amount_paisa: Some(0),
            crates_issued: Some(15),
            crates_returned: Some(0),
            admin_override_pin: None,
            user_id: Some(1),
        },
    )
    .expect("Create customer invoice");

    let initial_cb_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .unwrap();
    let initial_cb_bal: i64 = conn
        .query_row("SELECT COALESCE(SUM(cash_in_paisa - cash_out_paisa), 0) FROM cash_book", [], |r| r.get(0))
        .unwrap();

    // 2. Record DEPOT COUNTER Recovery: 12,000 PKR collected at office (delivery_sheet_id: None)
    let depot_rec = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 2,
            amount_paisa: 1200000, // 12,000 PKR
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some(date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Walk-in counter payment".into()),
            user_id: Some(2),
            delivery_sheet_id: None,
        },
    )
    .expect("Record depot recovery");

    assert!(depot_rec.delivery_sheet_id.is_none());

    // Forensic DB checks on customer_recoveries
    let (saved_sheet_id, saved_cb_id, saved_jv_id): (Option<i64>, Option<i64>, i64) = conn
        .query_row(
            "SELECT delivery_sheet_id, cash_book_id, journal_entry_id FROM customer_recoveries WHERE id = ?1",
            params![depot_rec.recovery_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .expect("Query customer recovery record");

    assert!(saved_sheet_id.is_none());
    assert!(saved_cb_id.is_some(), "Depot recovery MUST link to a cash_book entry");

    // Forensic check on Cash Book: MUST BE INCREMENTED by 12,000 PKR!
    let current_cb_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book", [], |r| r.get(0))
        .unwrap();
    let current_cb_bal: i64 = conn
        .query_row("SELECT COALESCE(SUM(cash_in_paisa - cash_out_paisa), 0) FROM cash_book", [], |r| r.get(0))
        .unwrap();
    assert_eq!(current_cb_count, initial_cb_count + 1);
    assert_eq!(current_cb_bal, initial_cb_bal + 1200000);

    let (cb_type, cb_acct, cb_in): (String, i64, i64) = conn
        .query_row(
            "SELECT transaction_type, account_id, cash_in_paisa FROM cash_book WHERE id = ?1",
            params![saved_cb_id.unwrap()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .expect("Query cash book entry");
    assert_eq!(cb_type, "CUSTOMER_RECOVERY");
    assert_eq!(cb_acct, 2, "Account ID in cash book must be Account 2 (1010)");
    assert_eq!(cb_in, 1200000);

    // Forensic check on Journal Entry:
    // MUST Debit Account 2 (1010 Cash on Hand)
    // MUST Credit Account 8 (1200 Accounts Receivable)
    let lines: Vec<(i64, i64, i64)> = {
        let mut stmt = conn
            .prepare("SELECT account_id, debit_paisa, credit_paisa FROM journal_lines WHERE entry_id = ?1 ORDER BY id ASC")
            .unwrap();
        stmt.query_map(params![saved_jv_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect()
    };

    assert_eq!(lines.len(), 2);
    // Line 1: Debit Account 2 (1010 Cash on Hand)
    assert_eq!(lines[0].0, 2, "Debit account MUST be Account 2 (1010 Cash on Hand)");
    assert_eq!(lines[0].1, 1200000);
    assert_eq!(lines[0].2, 0);

    // Line 2: Credit Account 8 (1200 Accounts Receivable)
    assert_eq!(lines[1].0, 8, "Credit account MUST be Account 8 (1200 Accounts Receivable)");
    assert_eq!(lines[1].1, 0);
    assert_eq!(lines[1].2, 1200000);

    assert_all_journal_entries_balanced(&conn);
}

// ============================================================================
// EMPIRICAL TEST 2: VAN SETTLEMENT CASH HANDOVER & ZERO DOUBLE-COUNTING IN CLOSING
// ============================================================================

#[test]
fn test_van_settlement_cash_handover_daily_closing_cash_flow_invariants() {
    let mut conn = setup_test_db();
    let date = "2026-11-12";

    // 0. Establish initial cash book opening: 50,000 PKR (5,000,000 Paisas)
    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
            account_id, account_code, particulars, description,
            cash_in, cash_in_paisa, cash_out, cash_out_paisa,
            running_balance_paisa, running_cash_balance, created_by
         ) VALUES ('2026-11-11', 'CAPITAL_INJECTION', 'MANUAL', 'CAP-01', 2, '1010',
                  'Owner Capital', 'Opening Cash', 50000, 5000000, 0, 0, 5000000, 50000, 1)",
        [],
    )
    .unwrap();

    // 1. Depot Counter Activity:
    // A. Depot Counter Cash Recovery from Customer 1: 7,000 PKR (700,000 Paisas)
    let _depot_rec = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 700000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some(date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Counter payment from Customer 1".into()),
            user_id: Some(2),
            delivery_sheet_id: None,
        },
    )
    .expect("Record counter recovery");

    // B. Operating Expense at depot: 2,000 PKR (200,000 Paisas) for office utilities
    let _exp = AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            expense_date: Some(date.into()),
            account_id: 34, // 6050 Utilities
            amount_paisa: 200000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: Some("Electricity Board".into()),
            description: "Depot Electricity Bill".into(),
            reference_number: None,
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    )
    .expect("Record operating expense");

    // Cash Book balance before van settlement:
    // Opening 50,000 + Counter Recovery 7,000 - Expense 2,000 = 55,000 PKR
    let mid_cash: i64 = conn
        .query_row("SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(mid_cash, 5500000, "Depot cash book balance before van returns must be 55,000 PKR");

    // 2. Route Dispatch:
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(date.into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(45100),
            empty_crates_loaded: Some(0),
            items: vec![LoadingItemInput {
                product_id: 2, // 1.5L PET (6/pack)
                pack_qty: 20,  // 120 bottles
                loose_qty: 0,
            }],
            notes: Some("Route settlement invariant test".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet");

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:00:00".into()),
            opening_km: Some(45100),
            empty_crates_loaded: Some(0),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue loading sheet");

    // 3. Route Deliveries:
    // A. Signed Credit Slip Sale on Route to Customer 2: 5 packs = 5,250 PKR (due_amount: 5,250 PKR, paid: 0)
    let _sale_route = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: None,
            invoice_date: Some(date.into()),
            due_date: Some("2026-11-26".into()),
            delivery_sheet_id: Some(sheet.id),
            trip_id: Some(sheet.id),
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 2,
                pack_qty: 5,
                loose_qty: 0,
                unit_price_paisa: None,
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Credit,
            paid_amount_paisa: Some(0),
            crates_issued: Some(0),
            crates_returned: Some(0),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create route credit invoice");

    // B. Route Recovery from Customer 3: 15,000 PKR (1,500,000 Paisas) collected on route
    let _route_rec = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 3,
            amount_paisa: 1500000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some(date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Route recovery by driver".into()),
            user_id: Some(3),
            delivery_sheet_id: Some(sheet.id),
        },
    )
    .expect("Record route recovery");

    // C. Route Fuel Expense: 750 PKR (75,000 Paisas)
    let route_exp_paisa = 75000i64;

    // Expected cash with driver:
    // Route Recoveries (15,000) - Route Expense (750) = 14,250 PKR (1,425,000 Paisas)
    let actual_driver_handover = 1425000i64;

    // 4. Calculate Settlement Reconciliation
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some(date),
        &[VanSettlementReturnItemDto {
            product_id: 2,
            returned_packs: 15, // 20 loaded - 5 sold = 15 returned
            returned_loose: 0,
            breakage_base: 0,
            notes: None,
        }],
        actual_driver_handover,
        0,
        route_exp_paisa,
    )
    .expect("Calculate settlement reconciliation");

    assert_eq!(recon.route_cash_sales_paisa, 0);
    assert_eq!(recon.route_credit_sales_paisa, 525000);
    assert_eq!(recon.route_recoveries_collected_paisa, 1500000);
    assert_eq!(recon.route_expenses_deducted_paisa, 75000);
    assert_eq!(recon.expected_cash_paisa, 1425000);
    assert_eq!(recon.actual_cash_paisa, 1425000);
    assert_eq!(recon.cash_variance_paisa, 0);
    assert!(recon.is_balanced);

    // 5. Submit Van Settlement
    let sub_result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: date.into(),
            closing_km: Some(45180),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 2,
                returned_packs: 15,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa: actual_driver_handover,
            empty_crates_returned: 0,
            route_expenses_paisa: Some(route_exp_paisa),
            shortage_action: Some("BALANCED".into()),
            settlement_notes: Some("Balanced settlement".into()),
            user_id: Some(1),
        },
    )
    .expect("Submit settlement");

    assert_eq!(sub_result.status, "SETTLED");
    assert_eq!(sub_result.cash_variance_paisa, 0);

    // 6. Forensic Invariant: Verify Cash Book Handover Entry
    let (handover_cb_id, handover_in): (i64, i64) = conn
        .query_row(
            "SELECT id, cash_in_paisa FROM cash_book 
             WHERE transaction_type = 'ROUTE_CASH_HANDOVER' AND voucher_ref_id = ?1",
            params![sheet.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query ROUTE_CASH_HANDOVER cash book entry");
    assert!(handover_cb_id > 0);
    assert_eq!(handover_in, 1425000, "Handover in cash book must be exact physical cash handed over (14,250 PKR)");

    // 7. Verify Daily Closing Breakdown and Zero Double-Counting of Route Recoveries
    let closing_summary = ClosingService::get_daily_summary(&conn, Some(date)).expect("Get daily closing summary");

    // Inflow assertions:
    assert_eq!(closing_summary.opening_cash_paisa, 5000000, "Opening cash = 50,000 PKR");
    assert_eq!(closing_summary.cash_in.route_cash_collections_paisa, 1425000, "Route cash collections = 14,250 PKR");
    assert_eq!(
        closing_summary.cash_in.customer_recoveries_paisa, 700000,
        "Customer recoveries in closing must ONLY contain depot recoveries (7,000 PKR), NEVER route recoveries (15,000 PKR)!"
    );
    assert_eq!(closing_summary.cash_out.expenses_paid_paisa, 200000, "Depot expenses = 2,000 PKR");

    // Double-Counting Prevention Proof:
    // Physical cash in drawer = Opening (50,000) + Depot Recovery (7,000) - Depot Expense (2,000) + Driver Handover (14,250)
    // = 69,250 PKR (6,925,000 Paisas)
    // If route recovery (15,000) was double-counted, expected cash would falsely be 84,250 PKR.
    // Verify expected closing cash is EXACTLY 69,250 PKR:
    let expected_physical_cash_paisa = 5000000 + 700000 - 200000 + 1425000;
    assert_eq!(expected_physical_cash_paisa, 6925000);
    assert_eq!(
        closing_summary.expected_closing_cash_paisa, 6925000,
        "Expected closing cash must strictly reflect physical cash flow without double-counting!"
    );

    // 8. Submit Daily Closing with exact physical cash count and verify zero variance
    let closing_sub = ClosingService::submit_closing(
        &mut conn,
        SubmitClosingDto {
            closing_date: date.into(),
            physical_denominations: DenominationCountsDto {
                note_5000: 13, // 65,000
                note_1000: 4,  //  4,000
                note_500: 0,
                note_100: 2,   //    200
                note_50: 1,    //     50 -> total = 69,250 PKR
                note_20: 0,
                note_10: 0,
                coin_10: 0,
                coin_5: 0,
                coin_2: 0,
                coin_1: 0,
            },
            variance_reason: None,
            admin_pin: None,
            user_id: Some(1),
        },
    )
    .expect("Submit daily closing");

    assert_eq!(closing_sub.physical_closing_cash_paisa, 6925000);
    assert_eq!(closing_sub.expected_closing_cash_paisa, 6925000);
    assert_eq!(closing_sub.variance_paisa, 0);
    assert_eq!(closing_sub.variance_type, "BALANCED");

    // All journal vouchers across the entire ceremony must be balanced
    assert_all_journal_entries_balanced(&conn);
}

// ============================================================================
// EMPIRICAL TEST 3: MULTI-RECOVERY ROUTE & DRIVER SHORTAGE PENALTY RECONCILIATION
// ============================================================================

#[test]
fn test_multi_customer_route_recoveries_with_driver_cash_shortage() {
    let mut conn = setup_test_db();
    let date = "2026-11-13";

    // 1. Dispatch Van
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(date.into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(46000),
            empty_crates_loaded: Some(0),
            items: vec![LoadingItemInput {
                product_id: 2,
                pack_qty: 10,
                loose_qty: 0,
            }],
            notes: Some("Multi-recovery shortage test".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet");

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:00:00".into()),
            opening_km: Some(46000),
            empty_crates_loaded: Some(0),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue loading sheet");

    // 2. Collect 3 separate recoveries on route from 3 different retailers:
    // Retailer 1: 5,000 PKR
    let _r1 = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 500000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some(date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Route stop 1".into()),
            user_id: Some(3),
            delivery_sheet_id: Some(sheet.id),
        },
    )
    .expect("Record recovery 1");

    // Retailer 2: 8,000 PKR
    let _r2 = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 2,
            amount_paisa: 800000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some(date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Route stop 2".into()),
            user_id: Some(3),
            delivery_sheet_id: Some(sheet.id),
        },
    )
    .expect("Record recovery 2");

    // Retailer 3: 12,000 PKR
    let _r3 = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 3,
            amount_paisa: 1200000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some(date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Route stop 3".into()),
            user_id: Some(3),
            delivery_sheet_id: Some(sheet.id),
        },
    )
    .expect("Record recovery 3");

    // Total expected route collections = 5,000 + 8,000 + 12,000 = 25,000 PKR (2,500,000 Paisas)
    // Driver lost or misplaced 3,000 PKR, so hands over only 22,000 PKR (2,200,000 Paisas)
    let actual_cash_paisa = 2200000i64;

    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some(date),
        &[VanSettlementReturnItemDto {
            product_id: 2,
            returned_packs: 10,
            returned_loose: 0,
            breakage_base: 0,
            notes: None,
        }],
        actual_cash_paisa,
        0,
        0,
    )
    .expect("Calculate settlement reconciliation");

    assert_eq!(recon.route_recoveries_collected_paisa, 2500000);
    assert_eq!(recon.expected_cash_paisa, 2500000);
    assert_eq!(recon.actual_cash_paisa, 2200000);
    assert_eq!(recon.cash_variance_paisa, -300000, "Cash variance must be -3,000 PKR (shortage)");
    assert_eq!(recon.cash_variance_type, "SHORTAGE");
    assert_eq!(recon.total_driver_shortage_liability_paisa, 300000);

    // 3. Submit Settlement charging the shortage to driver liability (CHARGE_DRIVER)
    let result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: date.into(),
            closing_km: Some(46050),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 2,
                returned_packs: 10,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa,
            empty_crates_returned: 0,
            route_expenses_paisa: None,
            shortage_action: Some("CHARGE_DRIVER".into()),
            settlement_notes: Some("Route shortage 3,000 charged to driver Tariq".into()),
            user_id: Some(1),
        },
    )
    .expect("Submit settlement with shortage");

    assert_eq!(result.status, "SETTLED");
    assert_eq!(result.cash_variance_paisa, -300000);

    // 4. Forensic verification of Shortage Penalty Journal Entry:
    // Must Debit Account 9 (1250 Driver Shortage Receivables) 3,000 PKR
    // Must Credit Account 4 (1030 Driver Floating Cash) 3,000 PKR
    let shortage_lines: Vec<(i64, i64, i64)> = {
        let mut stmt = conn
            .prepare(
                "SELECT l.account_id, l.debit_paisa, l.credit_paisa 
                 FROM journal_lines l
                 JOIN journal_entries e ON l.entry_id = e.id
                 WHERE e.reference_doc_type = 'DELIVERY_SHEET' AND e.reference_doc_id = ?1
                   AND e.voucher_type = 'MANUAL'
                 ORDER BY l.id ASC",
            )
            .unwrap();
        stmt.query_map(params![sheet.id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect()
    };

    assert_eq!(shortage_lines.len(), 2, "Driver Shortage JV must have 2 lines");
    // Dr Account 9 (1250 Driver Shortage Receivables)
    assert_eq!(shortage_lines[0].0, 9, "Debit must be to Account 9 (1250 Driver Shortage Receivables)");
    assert_eq!(shortage_lines[0].1, 300000);
    assert_eq!(shortage_lines[0].2, 0);

    // Cr Account 4 (1030 Driver Floating Cash)
    assert_eq!(shortage_lines[1].0, 4, "Credit must be to Account 4 (1030 Driver Floating Cash)");
    assert_eq!(shortage_lines[1].1, 0);
    assert_eq!(shortage_lines[1].2, 300000);

    // 5. Verify Driver Float Account (Account 4) has zero lingering unallocated imbalance:
    // Total Debits on Account 4: 2,500,000 (from 3 recoveries)
    // Total Credits on Account 4: 2,200,000 (from cash handover) + 300,000 (from shortage JV) = 2,500,000!
    let (total_dr_float, total_cr_float): (i64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0), COALESCE(SUM(credit_paisa), 0)
             FROM journal_lines
             WHERE account_id = 4",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query Account 4 debit and credit totals");
    assert_eq!(total_dr_float, 2500000, "Account 4 total debits must equal 25,000 PKR");
    assert_eq!(total_cr_float, 2500000, "Account 4 total credits must equal 25,000 PKR");
    assert_eq!(total_dr_float - total_cr_float, 0, "Account 4 Driver Float must be perfectly balanced at zero net!");

    assert_all_journal_entries_balanced(&conn);
}
