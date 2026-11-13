use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::domain::models::PaymentType;
use logar_pos_lib::services::cancellations::*;
use logar_pos_lib::services::closing::*;
use logar_pos_lib::services::purchases::*;
use logar_pos_lib::services::sales::*;
use rusqlite::{params, Connection};

fn setup_test_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations");
    conn
}

// ============================================================================
// STRESS TEST 1: Daily Closing Expected Cash Formula (6-Term Stress Test)
// Expected Cash = Opening Cash + POS Cash Sales + Cash Recoveries 
//               - Cash Purchases - Cash Expenses - Bank Deposits
// ============================================================================
#[test]
fn challenge_daily_closing_expected_cash_formula_exact_paisa() {
    let mut conn = setup_test_db();
    let day1 = "2026-11-01";
    let day2 = "2026-11-02";

    // Step 1: Establish Day 1 baseline closing with opening float of 50,000 PKR (5,000,000 Paisas)
    // Seed an initial cash entry prior to day 1 to act as opening cash
    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, particulars, cash_in, cash_in_paisa,
            running_balance_paisa, running_cash_balance
         ) VALUES ('2026-10-31', 'OPENING_FLOAT', 'Prior float', 50000, 5000000, 5000000, 50000)",
        [],
    ).expect("Insert prior day cash");

    // Close Day 1 with exact physical match 50,000 PKR (5,000,000 Paisas)
    let denoms_day1 = DenominationCountsDto {
        note_5000: 10,
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
    assert_eq!(denoms_day1.calculate_total_paisa(), 5000000);

    let submit_d1 = SubmitClosingDto {
        closing_date: day1.into(),
        physical_denominations: denoms_day1,
        variance_reason: Some("Day 1 baseline".into()),
        admin_pin: Some("1234".into()),
        user_id: Some(1),
    };
    let res_d1 = ClosingService::submit_closing(&mut conn, submit_d1).expect("Close Day 1");
    assert_eq!(res_d1.opening_cash_paisa, 5000000);
    assert_eq!(res_d1.physical_closing_cash_paisa, 5000000);

    // Step 2: Day 2 transactions across all 6 formula components:
    // Opening Cash for Day 2 = Day 1 physical closing = 5,000,000 Paisas (50,000 PKR)

    // A. POS Cash Sales:
    // Sale 1: 10 cartons of P1 @ 2,160 PKR = 21,600 PKR (2,160,000 Paisas)
    SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: Some("INV-D2-CASH-1".into()),
            invoice_date: Some(day2.into()),
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
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: None,
            crates_issued: None,
            crates_returned: None,
            admin_override_pin: None,
            user_id: Some(1),
        },
    ).expect("POS Cash Sale 1");

    // Sale 2 (Split payment): Net 10,000 PKR, paid 4,500 PKR cash (450,000 Paisas), 5,500 PKR credit
    SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: Some("INV-D2-SPLIT-2".into()),
            invoice_date: Some(day2.into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 2,
                pack_qty: 10,
                loose_qty: 0,
                unit_price_paisa: Some(100000), // 10,000 PKR total
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Split,
            paid_amount_paisa: Some(450000), // 4,500 PKR cash
            crates_issued: None,
            crates_returned: None,
            admin_override_pin: None,
            user_id: Some(1),
        },
    ).expect("POS Split Sale 2");

    // Sale 3: 100% Credit Sale of 30,000 PKR -> Must have ZERO effect on cash!
    SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: Some("INV-D2-CREDIT-3".into()),
            invoice_date: Some(day2.into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 3,
                pack_qty: 25,
                loose_qty: 0,
                unit_price_paisa: Some(120000), // 30,000 PKR credit
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
    ).expect("Credit Sale 3");

    // Total POS Cash Sales = 2,160,000 + 450,000 = 2,610,000 Paisas

    // B. Customer Cash Recoveries (posted to Cash Book)
    // Recovery 1: Haji Bismillah Khan pays 15,500 PKR (1,550,000 Paisas) cash recovery
    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, particulars, cash_in, cash_in_paisa,
            running_balance_paisa, running_cash_balance, created_by
         ) VALUES (?1, 'CUSTOMER_RECOVERY', 'Udhaar recovery CUST-101', 15500, 1550000, 0, 0, 1)",
        params![day2],
    ).expect("Customer recovery 1");

    // Recovery 2: Al-Madina Super Mart pays 8,750.50 PKR (875,050 Paisas) cash payment
    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, particulars, cash_in, cash_in_paisa,
            running_balance_paisa, running_cash_balance, created_by
         ) VALUES (?1, 'CUSTOMER_PAYMENT', 'Cheque-cleared cash CUST-102', 8750, 875050, 0, 0, 1)",
        params![day2],
    ).expect("Customer recovery 2");

    // Total Cash Recoveries = 1,550,000 + 875,050 = 2,425,050 Paisas

    // C. Cash Purchases (Supplier Consignment Payments)
    // Purchase 1: Recorded purchase with 12,000 PKR cash paid (1,200,000 Paisas)
    PurchaseService::record_purchase(
        &mut conn,
        RecordPurchaseDto {
            supplier_id: 1,
            invoice_no: "PUR-D2-CASH-1".into(),
            supplier_invoice_no: Some("SUPP-INV-8891".into()),
            purchase_date: day2.into(),
            items: vec![PurchaseItemInputDto {
                product_id: 1,
                pack_qty: 10,
                loose_qty: 0,
                unit_cost_paisa: 150000, // 15,000 PKR base goods
            }],
            freight_paisa: Some(100000), // 1,000 PKR freight
            unloading_labor_paisa: Some(50000), // 500 PKR labor
            transit_tax_paisa: None,
            payment_status: "PARTIAL".into(),
            payment_mode: Some("CASH".into()),
            paid_amount_paisa: Some(1200000), // 12,000 PKR paid cash
            empty_crates_returned_to_factory: None,
            notes: Some("Inward stock partial cash".into()),
            user_id: Some(1),
        },
    ).expect("Cash purchase 1");

    // Total Cash Purchases = 1,200,000 Paisas

    // D. Operating Cash Expenses
    // Expense 1: Delivery van fuel 3,500 PKR (350,000 Paisas)
    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, particulars, cash_out, cash_out_paisa,
            running_balance_paisa, running_cash_balance, created_by
         ) VALUES (?1, 'EXPENSE', 'Delivery Van Fuel', 3500, 350000, 0, 0, 1)",
        params![day2],
    ).expect("Expense 1");

    // Expense 2: Warehouse staff tea & khurak 1,250.50 PKR (125,050 Paisas)
    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, particulars, cash_out, cash_out_paisa,
            running_balance_paisa, running_cash_balance, created_by
         ) VALUES (?1, 'EXPENSE', 'Warehouse tea and meals', 1250, 125050, 0, 0, 1)",
        params![day2],
    ).expect("Expense 2");

    // Total Cash Expenses = 350,000 + 125,050 = 475,050 Paisas

    // E. Bank Deposits (Cash banked during midday)
    // Bank deposit of 20,000 PKR (2,000,000 Paisas)
    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, particulars, cash_out, cash_out_paisa,
            running_balance_paisa, running_cash_balance, created_by
         ) VALUES (?1, 'BANK_DEPOSIT', 'Cash deposit to Habib Bank', 20000, 2000000, 0, 0, 1)",
        params![day2],
    ).expect("Bank deposit");

    // Total Bank Deposits = 2,000,000 Paisas

    // Step 3: Exact Integer Paisa Formula Verification
    // Expected Cash = Opening Cash + POS Cash Sales + Cash Recoveries - Cash Purchases - Cash Expenses - Bank Deposits
    // Expected Cash = 5,000,000 + 2,610,000 + 2,425,050 - 1,200,000 - 475,050 - 2,000,000
    // Expected Cash = 10,035,050 - 3,675,050 = 6,360,000 Paisas (63,600 PKR)

    let summary = ClosingService::get_daily_summary(&conn, Some(day2)).expect("Get day 2 summary");

    assert_eq!(summary.opening_cash_paisa, 5000000, "Opening cash must be exactly 5,000,000 Paisas");
    assert_eq!(summary.cash_in.pos_cash_sales_paisa, 2610000, "POS cash sales must be 2,610,000 Paisas");
    assert_eq!(summary.cash_in.customer_recoveries_paisa, 2425050, "Recoveries must be 2,425,050 Paisas");
    assert_eq!(summary.cash_out.supplier_payments_paisa, 1200000, "Supplier payments must be 1,200,000 Paisas");
    assert_eq!(summary.cash_out.expenses_paid_paisa, 475050, "Expenses paid must be 475,050 Paisas");
    assert_eq!(summary.cash_out.bank_deposits_paisa, 2000000, "Bank deposits must be 2,000,000 Paisas");

    assert_eq!(summary.expected_closing_cash_paisa, 6360000, "Expected cash must match exact Paisa calculation 6,360,000");
}

// ============================================================================
// STRESS TEST 2: Physical Denomination Counter across 11 SBP Notes & Coins
// Rs 5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1
// Tests: Balanced (0), Shortage (Account 1250 / 1010), Excess (Account 1010 / 4090)
// ============================================================================
#[test]
fn challenge_physical_denomination_counter_11_sbp_units_and_variances() {
    let mut conn = setup_test_db();
    let day = "2026-11-03";

    // Sub-case 2A: Verify denomination counter mathematics across all 11 fields
    let full_denoms = DenominationCountsDto {
        note_5000: 5,   // 5 * 5000 PKR = 25,000 PKR = 2,500,000 Paisas
        note_1000: 8,   // 8 * 1000 PKR =  8,000 PKR =   800,000 Paisas
        note_500: 6,    // 6 *  500 PKR =  3,000 PKR =   300,000 Paisas
        note_100: 15,   // 15 * 100 PKR =  1,500 PKR =   150,000 Paisas
        note_50: 20,    // 20 *  50 PKR =  1,000 PKR =   100,000 Paisas
        note_20: 35,    // 35 *  20 PKR =    700 PKR =    70,000 Paisas
        note_10: 45,    // 45 *  10 PKR =    450 PKR =    45,000 Paisas
        coin_10: 25,    // 25 *  10 PKR =    250 PKR =    25,000 Paisas
        coin_5: 50,     // 50 *   5 PKR =    250 PKR =    25,000 Paisas
        coin_2: 100,    // 100 *  2 PKR =    200 PKR =    20,000 Paisas
        coin_1: 150,    // 150 *  1 PKR =    150 PKR =    15,000 Paisas
    };
    // Total = 2500000 + 800000 + 300000 + 150000 + 100000 + 70000 + 45000 + 25000 + 25000 + 20000 + 15000
    // Total = 4,050,000 Paisas (40,500 PKR)
    let total_calculated = full_denoms.calculate_total_paisa();
    assert_eq!(total_calculated, 4050000, "All 11 denominations must sum to exactly 4,050,000 Paisas");

    // Sub-case 2B: Exact Match (Variance = 0, Status = BALANCED)
    // Seed exactly 4,050,000 Paisas in cash book
    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, particulars, cash_in, cash_in_paisa,
            running_balance_paisa, running_cash_balance
         ) VALUES (?1, 'CASH_SALE', 'Sales', 40500, 4050000, 4050000, 40500)",
        params![day],
    ).expect("Seed cash sale");

    let submit_balanced = SubmitClosingDto {
        closing_date: day.into(),
        physical_denominations: full_denoms.clone(),
        variance_reason: None,
        admin_pin: Some("1234".into()),
        user_id: Some(1),
    };

    let res_balanced = ClosingService::submit_closing(&mut conn, submit_balanced).expect("Balanced closing");
    assert_eq!(res_balanced.variance_paisa, 0);
    assert_eq!(res_balanced.variance_type, "BALANCED");
    assert_eq!(res_balanced.variance_journal_entry_id, None, "No journal entry needed for balanced closing");

    // Sub-case 2C: Cash Shortage (Actual < Expected)
    // Test on day 2026-11-04
    let day_shortage = "2026-11-04";
    // Day 3 closed with 4,050,000 Paisas physical cash -> Becomes Day 4 opening cash!
    // Expected cash = 4,050,000 opening + 1,000,000 sales = 5,050,000 Paisas
    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, particulars, cash_in, cash_in_paisa,
            running_balance_paisa, running_cash_balance
         ) VALUES (?1, 'CASH_SALE', 'Day 4 Sales', 10000, 1000000, 5050000, 50500)",
        params![day_shortage],
    ).expect("Seed day 4 cash");

    // Count physical cash: 4,900,000 Paisas -> Shortage of 150,000 Paisas (1,500 PKR)
    let denoms_shortage = DenominationCountsDto {
        note_5000: 9, // 9 * 500,000 = 4,500,000
        note_1000: 4, // 4 * 100,000 =   400,000
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
    assert_eq!(denoms_shortage.calculate_total_paisa(), 4900000);

    let submit_shortage = SubmitClosingDto {
        closing_date: day_shortage.into(),
        physical_denominations: denoms_shortage,
        variance_reason: Some("Cash drawer shortage note".into()),
        admin_pin: Some("1234".into()),
        user_id: Some(1),
    };

    let res_shortage = ClosingService::submit_closing(&mut conn, submit_shortage).expect("Shortage closing");
    assert_eq!(res_shortage.variance_paisa, -150000);
    assert_eq!(res_shortage.variance_type, "SHORTAGE");
    let shortage_jv_id = res_shortage.variance_journal_entry_id.expect("Shortage JV must exist");

    // Verify Shortage Accounting:
    // Debit Account 1250 (Driver/Cashier Shortage Receivables, id: 9)
    // Credit Account 1010 (Cash on Hand, id: 2)
    let (dr_acct, dr_paisa): (i64, i64) = conn.query_row(
        "SELECT account_id, debit_paisa FROM journal_lines WHERE entry_id = ?1 AND debit_paisa > 0",
        params![shortage_jv_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).expect("Shortage debit line");
    assert_eq!(dr_acct, 9, "Shortage must debit Account 1250 (id 9)");
    assert_eq!(dr_paisa, 150000, "Shortage debit must equal 150,000 Paisas");

    let (cr_acct, cr_paisa): (i64, i64) = conn.query_row(
        "SELECT account_id, credit_paisa FROM journal_lines WHERE entry_id = ?1 AND credit_paisa > 0",
        params![shortage_jv_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).expect("Shortage credit line");
    assert_eq!(cr_acct, 2, "Shortage must credit Account 1010 Cash on Hand (id 2)");
    assert_eq!(cr_paisa, 150000, "Shortage credit must equal 150,000 Paisas");

    // Verify Cash Book records shortage outflow to reconcile drawer
    let (cb_type, cb_out, cb_run): (String, i64, i64) = conn.query_row(
        "SELECT transaction_type, cash_out_paisa, running_balance_paisa 
         FROM cash_book WHERE entry_date = ?1 AND transaction_type = 'CASH_SHORTAGE'",
        params![day_shortage],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).expect("Cash book shortage entry");
    assert_eq!(cb_type, "CASH_SHORTAGE");
    assert_eq!(cb_out, 150000);
    assert_eq!(cb_run, 4900000, "Cash book running balance must reconcile to physical cash 4,900,000");

    // Sub-case 2D: Cash Excess / Overage (Actual > Expected)
    // Test on day 2026-11-05
    let day_excess = "2026-11-05";
    // Day 4 closed with 4,900,000 Paisas physical cash -> Becomes Day 5 opening cash!
    // Expected cash = 4,900,000 opening + 1,000,000 sales = 5,900,000 Paisas
    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, particulars, cash_in, cash_in_paisa,
            running_balance_paisa, running_cash_balance
         ) VALUES (?1, 'CASH_SALE', 'Day 5 Sales', 10000, 1000000, 5900000, 59000)",
        params![day_excess],
    ).expect("Seed day 5 cash");

    // Count physical cash: 6,150,000 Paisas -> Excess of 250,000 Paisas (2,500 PKR)
    let denoms_excess = DenominationCountsDto {
        note_5000: 12, // 12 * 500,000 = 6,000,000
        note_1000: 1,  //  1 * 100,000 =   100,000
        note_500: 1,   //  1 *  50,000 =    50,000
        note_100: 0,
        note_50: 0,
        note_20: 0,
        note_10: 0,
        coin_10: 0,
        coin_5: 0,
        coin_2: 0,
        coin_1: 0,
    };
    assert_eq!(denoms_excess.calculate_total_paisa(), 6150000);

    let submit_excess = SubmitClosingDto {
        closing_date: day_excess.into(),
        physical_denominations: denoms_excess,
        variance_reason: Some("Cash excess overage in drawer".into()),
        admin_pin: Some("1234".into()),
        user_id: Some(1),
    };

    let res_excess = ClosingService::submit_closing(&mut conn, submit_excess).expect("Excess closing");
    assert_eq!(res_excess.variance_paisa, 250000);
    assert_eq!(res_excess.variance_type, "EXCESS");
    let excess_jv_id = res_excess.variance_journal_entry_id.expect("Excess JV must exist");

    // Verify Excess Accounting:
    // Debit Account 1010 (Cash on Hand, id: 2)
    // Credit Account 4090 (Miscellaneous Income / Cash Excess, id: 39)
    let (dr_acct, dr_paisa): (i64, i64) = conn.query_row(
        "SELECT account_id, debit_paisa FROM journal_lines WHERE entry_id = ?1 AND debit_paisa > 0",
        params![excess_jv_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).expect("Excess debit line");
    assert_eq!(dr_acct, 2, "Excess must debit Account 1010 Cash on Hand (id 2)");
    assert_eq!(dr_paisa, 250000, "Excess debit must equal 250,000 Paisas");

    let (cr_acct, cr_paisa): (i64, i64) = conn.query_row(
        "SELECT account_id, credit_paisa FROM journal_lines WHERE entry_id = ?1 AND credit_paisa > 0",
        params![excess_jv_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).expect("Excess credit line");
    assert_eq!(cr_acct, 39, "Excess must credit Account 4090 Miscellaneous Income / Cash Excess (id 39)");
    assert_eq!(cr_paisa, 250000, "Excess credit must equal 250,000 Paisas");

    // Verify Cash Book records excess inflow to reconcile drawer
    let (cb_type, cb_in, cb_run): (String, i64, i64) = conn.query_row(
        "SELECT transaction_type, cash_in_paisa, running_balance_paisa 
         FROM cash_book WHERE entry_date = ?1 AND transaction_type = 'CASH_EXCESS'",
        params![day_excess],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).expect("Cash book excess entry");
    assert_eq!(cb_type, "CASH_EXCESS");
    assert_eq!(cb_in, 250000);
    assert_eq!(cb_run, 6150000, "Cash book running balance must reconcile to physical cash 6,150,000");
}

// ============================================================================
// STRESS TEST 3: Day-Locking Immutability Defense & Rejection Tests
// ============================================================================
#[test]
fn challenge_day_locking_immutability_and_tamper_defense() {
    let mut conn = setup_test_db();
    let closed_date = "2026-11-06";

    // 1. Create a sale on the day
    let sale_res = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: Some("INV-LOCK-TEST-1".into()),
            invoice_date: Some(closed_date.into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 1,
                pack_qty: 2,
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
        },
    ).expect("Create sale before closing");

    // 2. Submit Daily Closing for the date -> is_locked = 1
    let denoms = DenominationCountsDto {
        note_5000: 0,
        note_1000: 4,
        note_500: 0,
        note_100: 3,
        note_50: 0,
        note_20: 1,
        note_10: 0,
        coin_10: 0,
        coin_5: 0,
        coin_2: 0,
        coin_1: 0,
    }; // 4000 + 300 + 20 = 4,320 PKR (432,000 Paisas)
    assert_eq!(denoms.calculate_total_paisa(), 432000);

    let closing_res = ClosingService::submit_closing(
        &mut conn,
        SubmitClosingDto {
            closing_date: closed_date.into(),
            physical_denominations: denoms,
            variance_reason: None,
            admin_pin: Some("1234".into()),
            user_id: Some(1),
        },
    ).expect("Submit closing");
    assert_eq!(closing_res.status, "LOCKED");

    // Sub-case 3A: Cancelling an invoice on that closed date must be REJECTED!
    let cancel_res = CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: sale_res.invoice_id,
            reason: "Trying to cancel on locked day".into(),
            cancelled_by: 1,
            admin_pin: Some("1234".into()),
        },
    );
    assert!(cancel_res.is_err(), "Cancelling invoice on locked day must be rejected!");
    match cancel_res.unwrap_err() {
        AppError::DayLocked(msg) => {
            assert!(msg.contains("locked daily closing"), "Expected DayLocked error message, got: {}", msg);
        }
        other => panic!("Expected AppError::DayLocked, got: {:?}", other),
    }

    // Sub-case 3B: Modifying or deleting daily closing record triggers SQLite trigger error
    let del_closing_err = conn.execute(
        "DELETE FROM daily_closings WHERE id = ?1",
        params![closing_res.closing_id],
    );
    assert!(del_closing_err.is_err(), "Deleting daily closing record must trigger SQLite error");
    let err_str = del_closing_err.unwrap_err().to_string();
    assert!(
        err_str.contains("Cannot delete a finalized daily closing record")
            || err_str.contains("Access Denied"),
        "Trigger trg_prevent_delete_daily_closing must fire: {}",
        err_str
    );

    let upd_closing_err = conn.execute(
        "UPDATE daily_closings SET variance_paisa = 9999 WHERE id = ?1",
        params![closing_res.closing_id],
    );
    assert!(upd_closing_err.is_err(), "Updating daily closing record must trigger SQLite error");
    let err_upd_str = upd_closing_err.unwrap_err().to_string();
    assert!(
        err_upd_str.contains("Cannot modify a finalized daily closing record")
            || err_upd_str.contains("Access Denied"),
        "Trigger trg_prevent_update_daily_closing must fire: {}",
        err_upd_str
    );

    // Sub-case 3C: Modifying or deleting locked sales invoice triggers SQLite trigger error
    let upd_inv_err = conn.execute(
        "UPDATE sales_invoices SET discount_paisa = 100 WHERE id = ?1",
        params![sale_res.invoice_id],
    );
    assert!(upd_inv_err.is_err(), "Updating locked sales invoice must trigger SQLite error");
    let err_inv_str = upd_inv_err.unwrap_err().to_string();
    assert!(
        err_inv_str.contains("Cannot modify a sales invoice on a locked accounting date"),
        "Trigger trg_prevent_update_locked_sales_invoice must fire: {}",
        err_inv_str
    );

    let del_inv_err = conn.execute(
        "DELETE FROM sales_invoices WHERE id = ?1",
        params![sale_res.invoice_id],
    );
    assert!(del_inv_err.is_err(), "Deleting locked sales invoice must trigger SQLite error");
    let err_del_inv_str = del_inv_err.unwrap_err().to_string();
    assert!(
        err_del_inv_str.contains("Cannot delete a sales invoice on a locked accounting date"),
        "Trigger trg_prevent_delete_locked_sales_invoice must fire: {}",
        err_del_inv_str
    );

    // Sub-case 3D: Creating a sales invoice on that closed date
    // SPEC REQUIREMENT: Once submit_daily_closing executes (is_locked = 1),
    // creating a sales invoice on that closed date must fail or be rejected!
    let create_on_locked = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: Some("INV-ILLEGAL-POST-LOCK".into()),
            invoice_date: Some(closed_date.into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 1,
                pack_qty: 1,
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
        },
    );

    assert!(
        create_on_locked.is_err(),
        "CRITICAL INVARIANT VIOLATION: Creating a sales invoice on locked date {} must be rejected, but succeeded with {:?}",
        closed_date,
        create_on_locked.as_ref().map(|r| &r.invoice_number)
    );
}

// ============================================================================
// STRESS TEST 4: Landed Cost Zero-Drift Remainder Allocation
// Freight (e.g. 1000 Paisas) across 3 items leaves remainders (333, 333, 334).
// Verify sum of allocated unit landed costs equals exact total landed cost with ZERO Paisa drift!
// ============================================================================
#[test]
fn challenge_landed_cost_zero_drift_remainder_allocation() {
    let mut conn = setup_test_db();

    // Scenario 4A: Exact 3-line problem from challenge mission
    // 3 items with equal base cost (e.g. 1 pack each @ 10,000 Paisas, total base = 30,000 Paisas)
    // Freight = 1,000 Paisas.
    // 1000 / 3 = 333.333333...
    // Item 1 allocated: 333 Paisas
    // Item 2 allocated: 333 Paisas
    // Item 3 allocated: 334 Paisas (remainder catch-up)
    // Sum = 1,000 Paisas exact! Zero drift!
    let purchase_req = RecordPurchaseDto {
        supplier_id: 1,
        invoice_no: "PUR-ZERO-DRIFT-3LINE".into(),
        supplier_invoice_no: Some("SUPP-ZD-01".into()),
        purchase_date: "2026-11-07".into(),
        items: vec![
            PurchaseItemInputDto {
                product_id: 1,
                pack_qty: 1,
                loose_qty: 0,
                unit_cost_paisa: 10000,
            },
            PurchaseItemInputDto {
                product_id: 2,
                pack_qty: 1,
                loose_qty: 0,
                unit_cost_paisa: 10000,
            },
            PurchaseItemInputDto {
                product_id: 3,
                pack_qty: 1,
                loose_qty: 0,
                unit_cost_paisa: 10000,
            },
        ],
        freight_paisa: Some(1000), // 1,000 Paisas freight
        unloading_labor_paisa: Some(0),
        transit_tax_paisa: Some(0),
        payment_status: "UNPAID".into(),
        payment_mode: Some("CREDIT".into()),
        paid_amount_paisa: Some(0),
        empty_crates_returned_to_factory: None,
        notes: Some("3-item landed cost stress test".into()),
        user_id: Some(1),
    };

    let result = PurchaseService::record_purchase(&mut conn, purchase_req).expect("Record 3-item purchase");

    assert_eq!(result.base_invoice_cost_paisa, 30000, "Base goods must be 30,000 Paisas");
    assert_eq!(result.total_landed_cost_paisa, 31000, "Total landed cost must be 31,000 Paisas");

    // Inspect individual purchase invoice items
    let mut stmt = conn.prepare(
        "SELECT product_id, pack_purchase_rate_paisa, landed_cost_allocated_paisa, line_total_paisa
         FROM purchase_invoice_items WHERE purchase_id = ?1 ORDER BY id ASC",
    ).expect("Prepare stmt");

    let rows: Vec<(i64, i64, i64, i64)> = stmt.query_map(params![result.purchase_id], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
    }).expect("Query map").collect::<Result<Vec<_>, _>>().expect("Collect rows");

    assert_eq!(rows.len(), 3, "Must have exactly 3 item lines");

    let alloc_0 = rows[0].2;
    let alloc_1 = rows[1].2;
    let alloc_2 = rows[2].2;

    assert_eq!(alloc_0, 333, "Line 1 allocated freight must be 333 Paisas");
    assert_eq!(alloc_1, 333, "Line 2 allocated freight must be 333 Paisas");
    assert_eq!(alloc_2, 334, "Line 3 allocated freight must be 334 Paisas (catch-up)");

    let total_allocated = alloc_0 + alloc_1 + alloc_2;
    assert_eq!(total_allocated, 1000, "Sum of allocated direct expenses must equal EXACT total freight 1000 Paisas");

    let sum_line_totals: i64 = rows.iter().map(|r| r.3).sum();
    assert_eq!(sum_line_totals, 31000, "Sum of line totals must equal EXACT total landed cost 31,000 Paisas with ZERO Paisa drift");

    // Verify preview matches record_purchase exactly
    let preview = PurchaseService::calculate_landed_cost_preview(
        &conn,
        &[
            PurchaseItemInputDto { product_id: 1, pack_qty: 1, loose_qty: 0, unit_cost_paisa: 10000 },
            PurchaseItemInputDto { product_id: 2, pack_qty: 1, loose_qty: 0, unit_cost_paisa: 10000 },
            PurchaseItemInputDto { product_id: 3, pack_qty: 1, loose_qty: 0, unit_cost_paisa: 10000 },
        ],
        1000,
        0,
        0,
    ).expect("Preview landed cost");

    assert_eq!(preview.items[0].allocated_landed_cost_paisa, 333);
    assert_eq!(preview.items[1].allocated_landed_cost_paisa, 333);
    assert_eq!(preview.items[2].allocated_landed_cost_paisa, 334);
    assert_eq!(preview.total_landed_cost_paisa, 31000);

    // Scenario 4B: High-variance multi-line prime number remainder allocation
    // 4 items with non-uniform values and prime number freight
    let preview_complex = PurchaseService::calculate_landed_cost_preview(
        &conn,
        &[
            PurchaseItemInputDto { product_id: 1, pack_qty: 7, loose_qty: 0, unit_cost_paisa: 123456 },
            PurchaseItemInputDto { product_id: 2, pack_qty: 13, loose_qty: 0, unit_cost_paisa: 78910 },
            PurchaseItemInputDto { product_id: 3, pack_qty: 29, loose_qty: 0, unit_cost_paisa: 34567 },
            PurchaseItemInputDto { product_id: 4, pack_qty: 3, loose_qty: 0, unit_cost_paisa: 45678 },
        ],
        77777, // Freight
        33333, // Unloading
        11111, // Transit tax
    ).expect("Preview complex");

    let expected_additional = 77777 + 33333 + 11111; // 122,221 Paisas
    let allocated_sum_complex: i64 = preview_complex.items.iter().map(|it| it.allocated_landed_cost_paisa).sum();
    assert_eq!(allocated_sum_complex, expected_additional, "Sum of allocated expenses must equal 122,221 Paisas");

    let line_total_sum_complex: i64 = preview_complex.items.iter().map(|it| it.line_total_paisa).sum();
    assert_eq!(line_total_sum_complex, preview_complex.total_landed_cost_paisa, "Line totals sum must match total landed cost exactly with ZERO Paisa drift");
}
