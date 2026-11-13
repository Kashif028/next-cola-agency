use rusqlite::{params, Connection};
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::dtos::*;
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::domain::rbac::{check_permission, has_permission, Action, Role};
use logar_pos_lib::services::auth::AuditService;
use logar_pos_lib::services::closing::{ClosingService, DenominationCountsDto, SubmitClosingDto};
use logar_pos_lib::services::logistics::LogisticsService;
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

    let mut entry_count = 0;
    for row in rows {
        let (id, num, vtype, dr, cr) = row.expect("Read journal entry row");
        entry_count += 1;
        assert_eq!(
            dr, cr,
            "Journal Entry #{} ({}, {}) is OUT OF BALANCE: Debit ({}) != Credit ({})",
            id, num, vtype, dr, cr
        );
        assert!(
            dr > 0,
            "Journal Entry #{} ({}, {}) has zero debit/credit total",
            id, num, vtype
        );
    }
    assert!(entry_count > 0, "Oracle requires at least one journal entry to be validated");
}

// ============================================================================
// TARGET 1: VAN SETTLEMENT FINANCIAL & SHORTAGE CALCULATIONS
// ============================================================================

#[test]
fn test_severe_cash_shortage_double_entry_balance_and_penalty() {
    let mut conn = setup_test_db();
    let date = "2026-11-06";

    // 1. Dispatch 10 packs (240 bottles) of Product 1 and 20 empty crates
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
            opening_km: Some(45200),
            empty_crates_loaded: Some(20),
            items: vec![LoadingItemInput {
                product_id: 1,
                pack_qty: 10,
                loose_qty: 0,
            }],
            notes: Some("Severe cash shortage test".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet");

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:00:00".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(20),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue loading sheet");

    // 2. Simulate Route Activity: Driver sold 8 packs (192 bottles) on cash for 17,280 PKR (1,728,000 Paisas)
    conn.execute(
        "UPDATE delivery_items SET sold_base = 192 WHERE sheet_id = ?1 AND product_id = 1",
        params![sheet.id],
    )
    .expect("Update delivery_items sold_base");

    conn.execute(
        "INSERT INTO sales_invoices (
            invoice_number, customer_id, delivery_sheet_id, invoice_date, due_date,
            subtotal_paisa, discount_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            crates_issued, crates_returned, payment_type, created_by
         ) VALUES ('INV-ROUTE-CSH-01', 1, ?1, ?2, ?2, 1728000, 0, 1728000, 1728000, 0, 8, 8, 'CASH', 3)",
        params![sheet.id, date],
    )
    .expect("Insert route cash sales invoice");

    // Route expense: 1,000 PKR (100,000 Paisas) fuel
    let route_expense_paisa = 100000i64;
    // Expected cash = 1,728,000 - 100,000 = 1,628,000 Paisas (16,280 PKR)
    // Driver hands over ONLY 200,000 Paisas (2,000 PKR)! Severe cash shortage of 1,428,000 Paisas (14,280 PKR)
    let actual_cash_paisa = 200000i64;

    // 3. Dry-run Reconciliation Calculation
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some(date),
        &[VanSettlementReturnItemDto {
            product_id: 1,
            returned_packs: 2,
            returned_loose: 0,
            breakage_base: 0,
            notes: None,
        }],
        actual_cash_paisa,
        20,
        route_expense_paisa,
    )
    .expect("Dry run reconciliation");

    assert!(!recon.is_balanced, "Trip has severe cash shortage");
    assert_eq!(recon.total_stock_variance_base, 0, "Stock is balanced");
    assert_eq!(recon.crates_variance, 0, "Crates are balanced");
    assert_eq!(recon.expected_cash_paisa, 1628000);
    assert_eq!(recon.actual_cash_paisa, 200000);
    assert_eq!(recon.cash_variance_paisa, -1428000);
    assert_eq!(recon.cash_variance_type, "SHORTAGE");
    assert_eq!(recon.total_driver_shortage_liability_paisa, 1428000);

    // 4. Submit Settlement with Shortage Penalty (CHARGE_DRIVER)
    let result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: date.into(),
            closing_km: Some(45290),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 2,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa,
            empty_crates_returned: 20,
            route_expenses_paisa: Some(route_expense_paisa),
            settlement_notes: Some("Driver reported losing cash envelope".into()),
            shortage_action: Some("CHARGE_DRIVER".into()),
            user_id: Some(2), // Accountant
        },
    )
    .expect("Submit settlement with cash shortage");

    assert_eq!(result.status, "SETTLED");
    assert!(result.shortage_journal_entry_id.is_some(), "Shortage JV must be posted");
    assert!(result.cashier_journal_entry_id.is_some(), "Cashier Handover JV must be posted");
    assert!(result.cash_book_entry_id.is_some(), "Cash book entry must be created");

    // 5. Verify Shortage JV lines
    let shortage_jv_id = result.shortage_journal_entry_id.unwrap();
    let (debit_acct, debit_paisa): (i64, i64) = conn
        .query_row(
            "SELECT account_id, debit_paisa FROM journal_lines WHERE entry_id = ?1 AND debit_paisa > 0",
            params![shortage_jv_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query shortage debit line");
    assert_eq!(debit_acct, 9, "Must debit Account 9 (1250 Driver Shortage Receivables)");
    assert_eq!(debit_paisa, 1428000, "Debit equals full shortage liability");

    let (credit_acct, credit_paisa): (i64, i64) = conn
        .query_row(
            "SELECT account_id, credit_paisa FROM journal_lines WHERE entry_id = ?1 AND credit_paisa > 0",
            params![shortage_jv_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query shortage credit line");
    assert_eq!(credit_acct, 4, "Must credit Account 4 (1030 Petty Cash / Driver Float)");
    assert_eq!(credit_paisa, 1428000, "Credit equals uncollected cash");

    // 6. Verify Cash Book Record matches actual cash handed over
    let cb_cash_in: i64 = conn
        .query_row(
            "SELECT cash_in_paisa FROM cash_book WHERE id = ?1",
            params![result.cash_book_entry_id.unwrap()],
            |r| r.get(0),
        )
        .expect("Query cash book entry");
    assert_eq!(cb_cash_in, 200000, "Cash book must strictly record 2,000 PKR handed over, never fictional expected cash");

    // 7. Verify Global Double-Entry Balance Oracle
    assert_all_journal_entries_balanced(&conn);
}

#[test]
fn test_crate_shortage_with_default_deposit_valuation_and_double_entry() {
    let mut conn = setup_test_db();
    let date = "2026-11-06";

    // 1. Dispatch 10 packs with 50 empty crates loaded
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
            opening_km: Some(45200),
            empty_crates_loaded: Some(50),
            items: vec![LoadingItemInput {
                product_id: 1,
                pack_qty: 10,
                loose_qty: 0,
            }],
            notes: Some("Crate shortage test".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet");

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: Some(50),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue loading sheet");

    // 2. Route activity: 25 crates issued to customers, 5 crates collected from customers
    // Expected empty crates remaining on van = 50 - 25 + 5 = 30 crates.
    // Driver sold 10 packs for 21,600 PKR (2,160,000 Paisas)
    conn.execute(
        "UPDATE delivery_items SET sold_base = 240 WHERE sheet_id = ?1 AND product_id = 1",
        params![sheet.id],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO sales_invoices (
            invoice_number, customer_id, delivery_sheet_id, invoice_date, due_date,
            subtotal_paisa, discount_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            crates_issued, crates_returned, payment_type, created_by
         ) VALUES ('INV-ROUTE-CRT-01', 1, ?1, ?2, ?2, 2160000, 0, 2160000, 2160000, 0, 25, 5, 'CASH', 3)",
        params![sheet.id, date],
    )
    .unwrap();

    // Driver returns with ONLY 10 empty crates (Missing 20 empty crates!)
    // Default crate deposit is 600 PKR (60,000 Paisas) per crate in app_settings.
    // Penalty = 20 * 60,000 = 1,200,000 Paisas (12,000 PKR).
    // Cash handed over is balanced (2,160,000 Paisas).
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some(date),
        &[VanSettlementReturnItemDto {
            product_id: 1,
            returned_packs: 0,
            returned_loose: 0,
            breakage_base: 0,
            notes: None,
        }],
        2160000,
        10,
        0,
    )
    .expect("Calculate crate shortage reconciliation");

    assert!(!recon.is_balanced);
    assert_eq!(recon.empty_crates_expected, 30);
    assert_eq!(recon.empty_crates_returned, 10);
    assert_eq!(recon.crates_variance, -20);
    assert_eq!(recon.crate_penalty_rate_paisa, 60000);
    assert_eq!(recon.crate_shortage_value_paisa, 1200000);
    assert_eq!(recon.cash_variance_paisa, 0);
    assert_eq!(recon.total_driver_shortage_liability_paisa, 1200000);

    // 3. Submit Settlement with Crate Shortage
    let result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: date.into(),
            closing_km: Some(45300),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 0,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa: 2160000,
            empty_crates_returned: 10,
            route_expenses_paisa: None,
            settlement_notes: Some("20 empty crates damaged/lost by retailer".into()),
            shortage_action: Some("CHARGE_DRIVER".into()),
            user_id: Some(2),
        },
    )
    .expect("Submit settlement with crate shortage");

    // 4. Verify Shortage JV credits Account 6 (1110 Empties Inventory)
    let shortage_jv = result.shortage_journal_entry_id.unwrap();
    let (dr_acct, dr_amt): (i64, i64) = conn
        .query_row(
            "SELECT account_id, debit_paisa FROM journal_lines WHERE entry_id = ?1 AND debit_paisa > 0",
            params![shortage_jv],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(dr_acct, 9, "Debit 1250 Driver Shortages");
    assert_eq!(dr_amt, 1200000);

    let (cr_acct, cr_amt): (i64, i64) = conn
        .query_row(
            "SELECT account_id, credit_paisa FROM journal_lines WHERE entry_id = ?1 AND credit_paisa > 0",
            params![shortage_jv],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(cr_acct, 6, "Credit Account 6 (1110 Empties Inventory) for missing crates");
    assert_eq!(cr_amt, 1200000);

    // 5. Verify Empties Ledger credited warehouse for 10 returned crates
    let crates_restocked: i32 = conn
        .query_row(
            "SELECT crates_in FROM empties_ledger WHERE entity_type = 'WAREHOUSE' AND voucher_type = 'VAN_SETTLEMENT' ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(crates_restocked, 10, "Empties ledger credited exactly 10 physical crates");

    // 6. Verify Global Double-Entry Balance Oracle
    assert_all_journal_entries_balanced(&conn);
}

#[test]
fn test_transit_breakage_company_absorption_vs_driver_penalty() {
    let mut conn = setup_test_db();
    let date = "2026-11-06";

    // Scenario: Transit road damage of 12 bottles plus an unexcused shortage of 6 bottles
    // Dispatch 10 packs (240 bottles)
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
            opening_km: Some(45200),
            empty_crates_loaded: Some(20),
            items: vec![LoadingItemInput {
                product_id: 1,
                pack_qty: 10,
                loose_qty: 0,
            }],
            notes: Some("Breakage with company absorption".into()),
            created_by: Some(4),
        },
    )
    .unwrap();

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: Some(20),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // Driver sold 6 packs (144 bottles)
    conn.execute(
        "UPDATE delivery_items SET sold_base = 144 WHERE sheet_id = ?1 AND product_id = 1",
        params![sheet.id],
    )
    .unwrap();

    // Driver reports:
    // - 12 bottles broken on rough road (transit breakage)
    // - Expected return = 240 - 144 - 12 = 84 bottles (3 packs + 12 loose)
    // - Driver physically returns only 78 bottles (3 packs + 6 loose) -> UNEXCUSED SHORTAGE OF 6 BOTTLES!
    // Unit price = 90 PKR/bottle (9,000 Paisas). Shortage value = 6 * 9,000 = 54,000 Paisas (540 PKR).
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some(date),
        &[VanSettlementReturnItemDto {
            product_id: 1,
            returned_packs: 3,
            returned_loose: 6,
            breakage_base: 12,
            notes: Some("12 bottles crushed under fallen crate".into()),
        }],
        0,
        20,
        0,
    )
    .unwrap();

    assert_eq!(recon.stock_items[0].expected_return_base, 84);
    assert_eq!(recon.stock_items[0].total_returned_base, 78);
    assert_eq!(recon.stock_items[0].variance_base, -6);
    assert_eq!(recon.stock_items[0].shortage_value_paisa, 54000);
    assert_eq!(recon.total_driver_shortage_liability_paisa, 54000);

    // Submit Settlement with Company Absorption: EXPENSE_WAIVER
    let result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: date.into(),
            closing_km: Some(45290),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 3,
                returned_loose: 6,
                breakage_base: 12,
                notes: Some("Breakage approved by depot supervisor".into()),
            }],
            actual_cash_paisa: 0,
            empty_crates_returned: 20,
            route_expenses_paisa: None,
            settlement_notes: Some("Supervisor waived remaining 6 bottles as vibration loss".into()),
            shortage_action: Some("EXPENSE_WAIVER".into()),
            user_id: Some(1), // Admin approves waiver
        },
    )
    .expect("Submit settlement with company absorption");

    // Verify Breakage Log Created
    let (broken_count, action_taken): (i64, String) = conn
        .query_row(
            "SELECT broken_base_units, action_taken FROM breakage_logs WHERE product_id = 1 ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(broken_count, 12, "Transit breakage of 12 bottles logged");
    assert_eq!(action_taken, "EXPENSE");

    // Verify Shortage JV debited Account 38 (Account 6090 - Variance Expense) instead of Driver Receivables (Account 9)
    let shortage_jv = result.shortage_journal_entry_id.unwrap();
    let (debit_acct, debit_paisa): (i64, i64) = conn
        .query_row(
            "SELECT account_id, debit_paisa FROM journal_lines WHERE entry_id = ?1 AND debit_paisa > 0",
            params![shortage_jv],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(debit_acct, 38, "Must debit Account 38 (6090 Variance Expense) on EXPENSE_WAIVER");
    assert_eq!(debit_paisa, 54000);

    let (credit_acct, credit_paisa): (i64, i64) = conn
        .query_row(
            "SELECT account_id, credit_paisa FROM journal_lines WHERE entry_id = ?1 AND credit_paisa > 0",
            params![shortage_jv],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(credit_acct, 5, "Must credit Account 5 (1100 Liquid Inventory)");
    assert_eq!(credit_paisa, 54000);

    // Verify Global Double-Entry Balance Oracle
    assert_all_journal_entries_balanced(&conn);
}

#[test]
fn test_excess_returns_and_multi_sku_isolated_shortages() {
    let mut conn = setup_test_db();
    let date = "2026-11-06";

    // 1. Dispatch multi-SKU load:
    // Product 1: 10 packs (240 units)
    // Product 2: 8 packs (192 units)
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
            opening_km: Some(45200),
            empty_crates_loaded: Some(25),
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 10,
                    loose_qty: 0,
                },
                LoadingItemInput {
                    product_id: 5,
                    pack_qty: 8,
                    loose_qty: 0,
                },
            ],
            notes: Some("Multi-SKU mixed variance test".into()),
            created_by: Some(4),
        },
    )
    .unwrap();

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: Some(25),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // 2. Sales activity:
    // Product 1: Sold 5 packs (120 units) -> Expected return: 120 units
    // Product 5: Sold 4 packs (96 units)  -> Expected return: 96 units
    conn.execute(
        "UPDATE delivery_items SET sold_base = 120 WHERE sheet_id = ?1 AND product_id = 1",
        params![sheet.id],
    )
    .unwrap();
    conn.execute(
        "UPDATE delivery_items SET sold_base = 96 WHERE sheet_id = ?1 AND product_id = 5",
        params![sheet.id],
    )
    .unwrap();

    // 3. Driver returns:
    // - Product 1: Returns 5 packs + 12 loose (132 units) -> EXCESS RETURN OF +12 UNITS!
    // - Product 5: Returns 3 packs + 12 loose (84 units)  -> SHORTAGE OF -12 UNITS!
    // - Empty crates: Returns 30 empty crates (Expected was 25) -> EXCESS OF +5 CRATES!
    // - Cash: Expected 0 (no invoices inserted in this scenario), Driver hands over 10,000 PKR (1,000,000 Paisas) -> EXCESS CASH!
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some(date),
        &[
            VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 5,
                returned_loose: 12,
                breakage_base: 0,
                notes: None,
            },
            VanSettlementReturnItemDto {
                product_id: 5,
                returned_packs: 3,
                returned_loose: 12,
                breakage_base: 0,
                notes: None,
            },
        ],
        1000000,
        30,
        0,
    )
    .unwrap();

    // Check Product 1 excess
    let p1_line = recon.stock_items.iter().find(|i| i.product_id == 1).unwrap();
    assert_eq!(p1_line.variance_base, 12);
    assert_eq!(p1_line.status, "EXCESS");
    assert_eq!(p1_line.shortage_value_paisa, 0, "Excess returns do NOT produce negative shortage");

    // Check Product 5 shortage
    let p5_line = recon.stock_items.iter().find(|i| i.product_id == 5).unwrap();
    assert_eq!(p5_line.variance_base, -12);
    assert_eq!(p5_line.status, "SHORTAGE");
    assert!(p5_line.shortage_value_paisa > 0, "Product 5 shortage must be valued");

    // Total stock variance is 0 base units (+12 - 12), BUT shortage liability is strictly Product 5
    assert_eq!(recon.total_stock_variance_base, 0);
    assert_eq!(recon.total_stock_shortage_value_paisa, p5_line.shortage_value_paisa);
    assert_eq!(recon.total_driver_shortage_liability_paisa, p5_line.shortage_value_paisa);

    // Excess crates check
    assert_eq!(recon.crates_variance, 5);
    assert_eq!(recon.crate_shortage_value_paisa, 0);

    // Excess cash check
    assert_eq!(recon.cash_variance_paisa, 1000000);
    assert_eq!(recon.cash_variance_type, "EXCESS");

    // 4. Submit Settlement
    let initial_wh_p1: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    let initial_wh_p5: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 5", [], |r| r.get(0))
        .unwrap();

    let result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: date.into(),
            closing_km: Some(45310),
            returns: vec![
                VanSettlementReturnItemDto {
                    product_id: 1,
                    returned_packs: 5,
                    returned_loose: 12,
                    breakage_base: 0,
                    notes: None,
                },
                VanSettlementReturnItemDto {
                    product_id: 5,
                    returned_packs: 3,
                    returned_loose: 12,
                    breakage_base: 0,
                    notes: None,
                },
            ],
            actual_cash_paisa: 1000000,
            empty_crates_returned: 30,
            route_expenses_paisa: None,
            settlement_notes: Some("Mixed excess and shortage run".into()),
            shortage_action: Some("CHARGE_DRIVER".into()),
            user_id: Some(2),
        },
    )
    .expect("Submit settlement with mixed variances");

    // 5. Verify Warehouse Stock increments match actual physical returns
    let final_wh_p1: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    let final_wh_p5: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 5", [], |r| r.get(0))
        .unwrap();

    assert_eq!(final_wh_p1, initial_wh_p1 + 132, "Product 1 restocked by full 132 physical return");
    assert_eq!(final_wh_p5, initial_wh_p5 + 84, "Product 5 restocked by 84 physical return");

    // 6. Verify Shortage JV only credits Product 5 shortage value
    let shortage_jv = result.shortage_journal_entry_id.unwrap();
    let (jv_dr, jv_cr): (i64, i64) = conn
        .query_row(
            "SELECT SUM(debit_paisa), SUM(credit_paisa) FROM journal_lines WHERE entry_id = ?1",
            params![shortage_jv],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(jv_dr, p5_line.shortage_value_paisa);
    assert_eq!(jv_cr, p5_line.shortage_value_paisa);

    // 7. Verify Cashier Handover JV is fully balanced
    let cashier_jv = result.cashier_journal_entry_id.unwrap();
    let (csh_dr, csh_cr): (i64, i64) = conn
        .query_row(
            "SELECT SUM(debit_paisa), SUM(credit_paisa) FROM journal_lines WHERE entry_id = ?1",
            params![cashier_jv],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(csh_dr, 1000000);
    assert_eq!(csh_cr, 1000000);

    // 8. Verify Global Double-Entry Balance Oracle
    assert_all_journal_entries_balanced(&conn);
}

#[test]
fn test_van_settlement_zero_cash_total_shortage() {
    let mut conn = setup_test_db();
    let date = "2026-11-06";

    // Scenario: Driver sells stock on cash for 10,800 PKR (1,080,000 Paisas) but hands over 0 PKR cash
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
            opening_km: Some(45200),
            empty_crates_loaded: Some(10),
            items: vec![LoadingItemInput {
                product_id: 1,
                pack_qty: 5,
                loose_qty: 0,
            }],
            notes: Some("Zero cash handover test".into()),
            created_by: Some(4),
        },
    )
    .unwrap();

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: Some(10),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    conn.execute(
        "UPDATE delivery_items SET sold_base = 120 WHERE sheet_id = ?1 AND product_id = 1",
        params![sheet.id],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO sales_invoices (
            invoice_number, customer_id, delivery_sheet_id, invoice_date, due_date,
            subtotal_paisa, discount_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            crates_issued, crates_returned, payment_type, created_by
         ) VALUES ('INV-ROUTE-ZERO-01', 1, ?1, ?2, ?2, 1080000, 0, 1080000, 1080000, 0, 5, 5, 'CASH', 3)",
        params![sheet.id, date],
    )
    .unwrap();

    // Actual cash handed over is 0
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some(date),
        &[VanSettlementReturnItemDto {
            product_id: 1,
            returned_packs: 0,
            returned_loose: 0,
            breakage_base: 0,
            notes: None,
        }],
        0,
        10,
        0,
    )
    .unwrap();

    assert_eq!(recon.expected_cash_paisa, 1080000);
    assert_eq!(recon.actual_cash_paisa, 0);
    assert_eq!(recon.cash_variance_paisa, -1080000);
    assert_eq!(recon.total_driver_shortage_liability_paisa, 1080000);

    let result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: date.into(),
            closing_km: Some(45260),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 0,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa: 0,
            empty_crates_returned: 10,
            route_expenses_paisa: None,
            settlement_notes: Some("Driver route cash stolen".into()),
            shortage_action: Some("CHARGE_DRIVER".into()),
            user_id: Some(2),
        },
    )
    .expect("Submit settlement with zero cash handover");

    assert!(result.cash_book_entry_id.is_none(), "No cash book entry when 0 cash is handed over");
    assert!(result.cashier_journal_entry_id.is_none(), "No cashier handover JV when 0 cash received");
    assert!(result.shortage_journal_entry_id.is_some(), "Must create shortage JV for uncollected cash");

    let shortage_jv = result.shortage_journal_entry_id.unwrap();
    let (dr, cr): (i64, i64) = conn
        .query_row(
            "SELECT SUM(debit_paisa), SUM(credit_paisa) FROM journal_lines WHERE entry_id = ?1",
            params![shortage_jv],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(dr, 1080000);
    assert_eq!(cr, 1080000);

    assert_all_journal_entries_balanced(&conn);
}

// ============================================================================
// TARGET 2: DAY-LOCKING IMMUTABILITY UNDER ADVERSARIAL ATTACKS
// ============================================================================

#[test]
fn test_day_locking_service_level_attacks_rejected() {
    let mut conn = setup_test_db();
    let locked_date = "2026-11-04";

    // 1. Finalize and Lock Daily Closing for 2026-11-04
    let _ = ClosingService::get_daily_summary(&conn, Some(locked_date)).unwrap();
    ClosingService::submit_closing(
        &mut conn,
        SubmitClosingDto {
            closing_date: locked_date.into(),
            physical_denominations: DenominationCountsDto {
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
            },
            variance_reason: None,
            admin_pin: None,
            user_id: Some(1),
        },
    )
    .expect("Submit daily closing");

    // Attack A: Attempt LogisticsService::create_loading_sheet on locked date
    let err_create = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(locked_date.into()),
            vehicle_id: Some(1),
            vehicle_number: None,
            driver_id: None,
            driver_name: None,
            helper_name: None,
            opening_km: None,
            empty_crates_loaded: None,
            items: vec![LoadingItemInput {
                product_id: 1,
                pack_qty: 2,
                loose_qty: 0,
            }],
            notes: None,
            created_by: Some(4),
        },
    )
    .expect_err("create_loading_sheet must fail on locked date");

    match err_create {
        AppError::DayLocked(d) => assert_eq!(d, locked_date),
        other => panic!("Expected DayLocked, got {:?}", other),
    }

    // Attack B: Attempt LogisticsService::issue_loading_sheet on a sheet dated on locked date
    // Insert a draft directly bypass or prior
    conn.execute(
        "INSERT INTO delivery_sheets (sheet_number, sheet_date, route_id, status) VALUES ('LOAD-PRE-LOCK', '2026-11-03', 1, 'DRAFT')",
        [],
    )
    .unwrap();
    let draft_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO delivery_items (sheet_id, product_id, loaded_packs, loaded_loose, total_loaded_base) VALUES (?1, 1, 1, 0, 24)",
        params![draft_id],
    )
    .unwrap();

    // Lock date 2026-11-03
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked, closed_at, closed_by) VALUES ('2026-11-03', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1)",
        [],
    )
    .unwrap();

    let err_issue = LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: draft_id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: None,
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect_err("issue_loading_sheet must fail on locked date");

    match err_issue {
        AppError::DayLocked(d) => assert_eq!(d, "2026-11-03"),
        other => panic!("Expected DayLocked, got {:?}", other),
    }

    // Attack C: Attempt SettlementService::submit_van_settlement on locked date
    let err_settle = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: draft_id,
            settlement_date: locked_date.into(),
            closing_km: None,
            returns: vec![],
            actual_cash_paisa: 0,
            empty_crates_returned: 0,
            route_expenses_paisa: None,
            settlement_notes: None,
            shortage_action: None,
            user_id: Some(2),
        },
    )
    .expect_err("submit_van_settlement must fail on locked date");

    match err_settle {
        AppError::DayLocked(msg) => assert!(msg.contains("locked accounting date")),
        other => panic!("Expected DayLocked, got {:?}", other),
    }
}

#[test]
fn test_day_locking_direct_sqlite_trigger_abort_on_closed_dates() {
    let conn = setup_test_db();
    let locked_date = "2026-11-02";

    // Lock 2026-11-02
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked, closed_at, closed_by) VALUES (?1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1)",
        params![locked_date],
    )
    .unwrap();

    // Attack 1: Direct SQL INSERT into delivery_sheets on locked date
    let res_insert = conn.execute(
        "INSERT INTO delivery_sheets (sheet_number, sheet_date, route_id, status) VALUES ('LOAD-ATTACK-01', ?1, 1, 'DRAFT')",
        params![locked_date],
    );
    assert!(res_insert.is_err(), "trg_prevent_insert_locked_delivery_sheet must abort");
    let err_msg = res_insert.unwrap_err().to_string();
    assert!(err_msg.contains("Access Denied: Cannot create a loading sheet on a locked accounting date"));

    // Attack 2: Pre-existing sheet on open date, then lock that date, then attempt direct SQL UPDATE
    conn.execute(
        "INSERT INTO delivery_sheets (sheet_number, sheet_date, route_id, status) VALUES ('LOAD-ATTACK-02', '2026-11-01', 1, 'DRAFT')",
        [],
    )
    .unwrap();
    let sheet_id = conn.last_insert_rowid();

    // Lock 2026-11-01
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked, closed_at, closed_by) VALUES ('2026-11-01', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1)",
        [],
    )
    .unwrap();

    let res_update = conn.execute(
        "UPDATE delivery_sheets SET notes = 'tampered' WHERE id = ?1",
        params![sheet_id],
    );
    assert!(res_update.is_err(), "trg_prevent_update_locked_delivery_sheet must abort");
    assert!(res_update.unwrap_err().to_string().contains("Access Denied: Cannot modify a delivery sheet on a locked accounting date"));

    // Attack 3: Direct SQL UPDATE status = 'SETTLED' on locked date
    let res_settle = conn.execute(
        "UPDATE delivery_sheets SET status = 'SETTLED' WHERE id = ?1",
        params![sheet_id],
    );
    assert!(res_settle.is_err(), "trg_prevent_settle_locked_delivery_sheet or update trigger must abort");

    // Attack 4: Direct SQL DELETE on delivery_sheets on locked date
    let res_delete = conn.execute(
        "DELETE FROM delivery_sheets WHERE id = ?1",
        params![sheet_id],
    );
    assert!(res_delete.is_err(), "trg_prevent_delete_locked_delivery_sheet must abort");
    assert!(res_delete.unwrap_err().to_string().contains("Access Denied: Cannot delete a delivery sheet on a locked accounting date"));

    // Attack 5: Direct SQL INSERT into trip_settlements on locked date
    let res_trip_settle = conn.execute(
        "INSERT INTO trip_settlements (trip_id, sheet_id, settlement_date) VALUES (9999, ?1, ?2)",
        params![sheet_id, locked_date],
    );
    assert!(res_trip_settle.is_err(), "trg_prevent_insert_locked_trip_settlement must abort");
    assert!(res_trip_settle.unwrap_err().to_string().contains("Access Denied: Cannot create trip settlement on a locked accounting date"));
}

#[test]
fn test_settled_records_immutability_triggers() {
    let mut conn = setup_test_db();
    let open_date = "2026-11-08";

    // 1. Create, issue and settle a delivery sheet
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(open_date.into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(10),
            items: vec![LoadingItemInput {
                product_id: 1,
                pack_qty: 2,
                loose_qty: 0,
            }],
            notes: Some("Settled immutability check".into()),
            created_by: Some(4),
        },
    )
    .unwrap();

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: Some(10),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: open_date.into(),
            closing_km: Some(45220),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 2,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa: 0,
            empty_crates_returned: 10,
            route_expenses_paisa: None,
            settlement_notes: Some("Clean run".into()),
            shortage_action: None,
            user_id: Some(2),
        },
    )
    .unwrap();

    // Verify status is SETTLED
    let status: String = conn
        .query_row("SELECT status FROM delivery_sheets WHERE id = ?1", params![sheet.id], |r| r.get(0))
        .unwrap();
    assert_eq!(status, "SETTLED");

    // Attack 1: Even on an UNLOCKED date, settled delivery sheet CANNOT BE DELETED
    let res_delete_open = conn.execute(
        "DELETE FROM delivery_sheets WHERE id = ?1",
        params![sheet.id],
    );
    assert!(res_delete_open.is_err(), "Settled sheet deletion must be blocked unconditionally");
    assert!(res_delete_open.unwrap_err().to_string().contains("Deletion Forbidden: Settled delivery sheets are permanent audit records"));

    // 2. Lock accounting date open_date
    conn.execute(
        "INSERT INTO daily_closings (closing_date, is_locked, closed_at, closed_by) VALUES (?1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1)",
        params![open_date],
    )
    .unwrap();

    // Attack 2: Attempt UPDATE on settled delivery sheet on locked date
    let res_update_locked = conn.execute(
        "UPDATE delivery_sheets SET notes = 'tampered' WHERE id = ?1",
        params![sheet.id],
    );
    assert!(res_update_locked.is_err(), "trg_prevent_modify_settled_delivery_sheet must abort");
}

// ============================================================================
// TARGET 3: RBAC MATRIX & AUDIT LOG TAMPER RESISTANCE
// ============================================================================

#[test]
fn test_adversarial_rbac_forbidden_matrix_for_all_non_admin_roles() {
    // 1. Salesman Forbidden Actions Check
    let salesman_forbidden = [
        Action::PosCancelInvoice,
        Action::PosOverrideCreditLimit,
        Action::InventoryAdjustStock,
        Action::InventoryReceivePurchase,
        Action::InventoryIssueVehicleStock,
        Action::InventoryRecordBreakage,
        Action::InventoryManageEmpties,
        Action::InventoryModifyPricing,
        Action::LogisticsManageRoutes,
        Action::LogisticsManageVehicles,
        Action::LogisticsCreateLoadingSheet,
        Action::LogisticsIssueLoadingSheet,
        Action::LogisticsAuditSettlement,
        Action::AccountingViewLedgers,
        Action::AccountingRecordSupplierPayment,
        Action::AccountingRecordExpense,
        Action::AccountingViewCashBook,
        Action::AccountingViewBankBook,
        Action::AccountingBankTransfer,
        Action::AccountingViewFinancialReports,
        Action::AccountingDailyClosing,
        Action::AdminManageUsers,
        Action::AdminManageSettings,
        Action::AdminViewAuditLogs,
        Action::AdminDatabaseBackup,
        Action::AdminDatabaseRestore,
    ];

    for action in salesman_forbidden {
        assert!(!has_permission(Role::Salesman, action), "Salesman MUST NOT have permission for {:?}", action);
        assert!(check_permission(Role::Salesman, action).is_err(), "check_permission must return Err for Salesman on {:?}", action);
    }

    // 2. Warehouse Operator Forbidden Actions Check
    let warehouse_forbidden = [
        Action::PosCreateInvoice,
        Action::PosCancelInvoice,
        Action::PosOverrideCreditLimit,
        Action::InventoryModifyPricing,
        Action::LogisticsManageRoutes,
        Action::LogisticsManageVehicles,
        Action::LogisticsSubmitSettlement,
        Action::LogisticsAuditSettlement,
        Action::AccountingViewLedgers,
        Action::AccountingRecordRecovery,
        Action::AccountingRecordSupplierPayment,
        Action::AccountingRecordExpense,
        Action::AccountingViewCashBook,
        Action::AccountingViewBankBook,
        Action::AccountingBankTransfer,
        Action::AccountingViewFinancialReports,
        Action::AccountingDailyClosing,
        Action::AdminManageUsers,
        Action::AdminManageSettings,
        Action::AdminViewAuditLogs,
        Action::AdminDatabaseBackup,
        Action::AdminDatabaseRestore,
    ];

    for action in warehouse_forbidden {
        assert!(!has_permission(Role::Warehouse, action), "Warehouse MUST NOT have permission for {:?}", action);
        assert!(check_permission(Role::Warehouse, action).is_err(), "check_permission must return Err for Warehouse on {:?}", action);
    }

    // 3. Accountant Forbidden Actions Check
    let accountant_forbidden = [
        Action::PosCreateInvoice,
        Action::PosCancelInvoice,
        Action::PosOverrideCreditLimit,
        Action::InventoryAdjustStock,
        Action::InventoryIssueVehicleStock,
        Action::InventoryModifyPricing,
        Action::LogisticsIssueLoadingSheet,
        Action::LogisticsSubmitSettlement,
        Action::AdminManageUsers,
        Action::AdminManageSettings,
        Action::AdminViewAuditLogs,
        Action::AdminDatabaseRestore,
    ];

    for action in accountant_forbidden {
        assert!(!has_permission(Role::Accountant, action), "Accountant MUST NOT have permission for {:?}", action);
        assert!(check_permission(Role::Accountant, action).is_err(), "check_permission must return Err for Accountant on {:?}", action);
    }

    // 4. Admin Omnipotence Check: All actions must be permitted
    let all_test_actions = [
        Action::PosCreateInvoice,
        Action::PosViewInvoice,
        Action::PosCancelInvoice,
        Action::PosRecordReturn,
        Action::PosOverrideCreditLimit,
        Action::InventoryViewStock,
        Action::InventoryAdjustStock,
        Action::InventoryReceivePurchase,
        Action::InventoryIssueVehicleStock,
        Action::InventoryRecordBreakage,
        Action::InventoryManageEmpties,
        Action::InventoryModifyPricing,
        Action::LogisticsViewRoutes,
        Action::LogisticsManageRoutes,
        Action::LogisticsViewVehicles,
        Action::LogisticsManageVehicles,
        Action::LogisticsCreateLoadingSheet,
        Action::LogisticsIssueLoadingSheet,
        Action::LogisticsSubmitSettlement,
        Action::LogisticsAuditSettlement,
        Action::AccountingViewLedgers,
        Action::AccountingRecordRecovery,
        Action::AccountingRecordSupplierPayment,
        Action::AccountingRecordExpense,
        Action::AccountingViewCashBook,
        Action::AccountingViewBankBook,
        Action::AccountingBankTransfer,
        Action::AccountingViewFinancialReports,
        Action::AccountingDailyClosing,
        Action::AdminManageUsers,
        Action::AdminManageSettings,
        Action::AdminViewAuditLogs,
        Action::AdminDatabaseBackup,
        Action::AdminDatabaseRestore,
    ];

    for action in all_test_actions {
        assert!(has_permission(Role::Admin, action), "Admin must have permission for {:?}", action);
        assert!(check_permission(Role::Admin, action).is_ok());
    }
}

#[test]
fn test_audit_logs_tamper_resistance_under_adversarial_sqlite_attacks() {
    let conn = setup_test_db();

    // 1. Seed audit logs via service
    let log_id_1 = AuditService::log_audit_action(
        &conn,
        Some(1),
        Some("admin"),
        "CRITICAL_RATE_OVERRIDE",
        "products",
        Some(1),
        "Wholesale crate price adjusted from 2100 to 2160",
    )
    .expect("Log action 1");

    let old_v = serde_json::json!({"status": "COMPLETED"});
    let new_v = serde_json::json!({"status": "CANCELLED"});
    let log_id_2 = AuditService::log_audit_diff(
        &conn,
        Some(2),
        Some("accountant"),
        "BILL_CANCELLATION",
        "sales_invoices",
        "105",
        Some(&old_v),
        Some(&new_v),
        Some("Customer returned wrong order"),
        None,
    )
    .expect("Log action 2");

    assert!(log_id_1 > 0);
    assert!(log_id_2 > log_id_1);

    // Initial audit log count
    let initial_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM audit_logs", [], |r| r.get(0))
        .unwrap();
    assert!(initial_count >= 2);

    // Attack 1: Targeted UPDATE on action/reason of specific log
    let res_update_action = conn.execute(
        "UPDATE audit_logs SET action = 'HACKED_ACTION' WHERE id = ?1",
        params![log_id_1],
    );
    assert!(res_update_action.is_err(), "Targeted UPDATE on action must be aborted by trigger");
    assert!(res_update_action.unwrap_err().to_string().contains("Tamper Protection: Audit logs cannot be updated"));

    // Attack 2: Targeted UPDATE on username / timestamp / details
    let res_update_user = conn.execute(
        "UPDATE audit_logs SET username = 'ghost_user', timestamp = '2000-01-01' WHERE id = ?1",
        params![log_id_2],
    );
    assert!(res_update_user.is_err(), "Targeted UPDATE on username/timestamp must be aborted by trigger");

    // Attack 3: Targeted DELETE of specific log ID
    let res_delete_one = conn.execute(
        "DELETE FROM audit_logs WHERE id = ?1",
        params![log_id_1],
    );
    assert!(res_delete_one.is_err(), "Targeted DELETE must be aborted by trigger");
    assert!(res_delete_one.unwrap_err().to_string().contains("Tamper Protection: Audit logs cannot be deleted"));

    // Attack 4: Mass / Bulk UPDATE across entire audit_logs table
    let res_bulk_update = conn.execute(
        "UPDATE audit_logs SET details = 'REDACTED'",
        [],
    );
    assert!(res_bulk_update.is_err(), "Bulk UPDATE must be aborted by trigger");

    // Attack 5: Mass / Bulk DELETE across entire audit_logs table
    let res_bulk_delete = conn.execute(
        "DELETE FROM audit_logs",
        [],
    );
    assert!(res_bulk_delete.is_err(), "Bulk DELETE must be aborted by trigger");

    // Verify 100% data integrity after all attack attempts
    let final_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM audit_logs", [], |r| r.get(0))
        .unwrap();
    assert_eq!(final_count, initial_count, "Audit log count must remain 100% intact");

    let action_1: String = conn
        .query_row("SELECT action FROM audit_logs WHERE id = ?1", params![log_id_1], |r| r.get(0))
        .unwrap();
    assert_eq!(action_1, "CRITICAL_RATE_OVERRIDE", "Audit log content must remain completely unmodified");
}
