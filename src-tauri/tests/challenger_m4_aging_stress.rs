//! Adversarial Stress Test Suite: Milestone 4 (Udhaar Aging, Knock-Off & Day-Lock Security)
//! File: src-tauri/tests/challenger_m4_aging_stress.rs
//!
//! EMPIRICAL CHALLENGER verification:
//! 1. Udhaar Aging Boundary Stress (exact day diffs, 5 discrete buckets, credit limit warnings/blocks)
//! 2. Customer Recovery Modes (FIFO knock-off across 5 bills, Specific Bill overpayment to unallocated advance, On-Account advance deposit)
//! 3. Day-Lock Security & SQLite Trigger Enforcement (Locked closing date aborts mutations on recoveries, expenses, and analyzes journal entries)

use chrono::NaiveDate;
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::dtos::*;
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::domain::models::PaymentType;
use logar_pos_lib::services::accounting::AccountingService;
use logar_pos_lib::services::sales::*;
use rusqlite::{params, Connection};

fn setup_stress_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations");
    conn
}

// ============================================================================
// STRESS TEST 1: UDHAAR AGING BOUNDARY STRESS & 5 DISCRETE BUCKETS
// ============================================================================
#[test]
fn test_stress_1_aging_exact_day_boundaries() {
    let conn = setup_stress_db();

    // Baseline test date
    let as_of_date_str = "2026-11-15";
    let as_of_date = NaiveDate::parse_from_str(as_of_date_str, "%Y-%m-%d").unwrap();

    // Clean existing invoices for customer 1
    conn.execute("DELETE FROM sales_invoices WHERE customer_id = 1", []).expect("Clean customer 1 invoices");

    // Invoices placed at exact day boundaries relative to 2026-11-15:
    // Day 0   : 2026-11-15 (0 days old)   -> Bucket 0_7    (10,000 paisa)
    // Day 7   : 2026-11-08 (7 days old)   -> Bucket 0_7    (20,000 paisa)
    // Day 8   : 2026-11-07 (8 days old)   -> Bucket 8_15   (30,000 paisa)
    // Day 15  : 2026-10-31 (15 days old)  -> Bucket 8_15   (40,000 paisa)
    // Day 16  : 2026-10-30 (16 days old)  -> Bucket 16_30  (50,000 paisa)
    // Day 30  : 2026-10-16 (30 days old)  -> Bucket 16_30  (60,000 paisa)
    // Day 31  : 2026-10-15 (31 days old)  -> Bucket 31_60  (70,000 paisa)
    // Day 60  : 2026-09-16 (60 days old)  -> Bucket 31_60  (80,000 paisa)
    // Day 61  : 2026-09-15 (61 days old)  -> Bucket 60_plus(90,000 paisa)
    // Day 120 : 2026-07-18 (120 days old) -> Bucket 60_plus(100,000 paisa)
    let boundary_invoices = vec![
        ("INV-B-D000", "2026-11-15", 0i64, 10000i64, "0_7"),
        ("INV-B-D007", "2026-11-08", 7i64, 20000i64, "0_7"),
        ("INV-B-D008", "2026-11-07", 8i64, 30000i64, "8_15"),
        ("INV-B-D015", "2026-10-31", 15i64, 40000i64, "8_15"),
        ("INV-B-D016", "2026-10-30", 16i64, 50000i64, "16_30"),
        ("INV-B-D030", "2026-10-16", 30i64, 60000i64, "16_30"),
        ("INV-B-D031", "2026-10-15", 31i64, 70000i64, "31_60"),
        ("INV-B-D060", "2026-09-16", 60i64, 80000i64, "31_60"),
        ("INV-B-D061", "2026-09-15", 61i64, 90000i64, "60_PLUS"),
        ("INV-B-D120", "2026-07-18", 120i64, 100000i64, "60_PLUS"),
    ];

    for (num, dt, expected_days, due, _expected_bucket) in &boundary_invoices {
        // Assert date arithmetic correctness before inserting
        let inv_date = NaiveDate::parse_from_str(dt, "%Y-%m-%d").unwrap();
        let actual_days = (as_of_date - inv_date).num_days();
        assert_eq!(actual_days, *expected_days, "Invoice {} date {} day diff mismatch", num, dt);

        conn.execute(
            "INSERT INTO sales_invoices (
                invoice_number, customer_id, invoice_date, due_date,
                subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
                status, is_cancelled, payment_type
             ) VALUES (?1, 1, ?2, ?2, ?3, ?3, 0, ?3, 'UNPAID', 0, 'CREDIT')",
            params![num, dt, due],
        ).expect("Insert boundary invoice");
    }

    // Execute aging calculation
    let aging = AccountingService::calculate_customer_aging(&conn, 1, Some(as_of_date_str))
        .expect("Calculate customer aging at exact boundaries");

    // Total outstanding sum
    let total_expected_paisa: i64 = boundary_invoices.iter().map(|(_, _, _, due, _)| due).sum();
    assert_eq!(aging.total_outstanding_paisa, total_expected_paisa);
    assert_eq!(aging.total_outstanding_paisa, 550000); // ₨ 5,500

    // Check individual bucket sums (no 1-day off-by-one errors)
    // Bucket 0-7: Day 0 (10,000) + Day 7 (20,000) = 30,000
    assert_eq!(aging.bucket_0_7_paisa, 30000, "Bucket 0-7 exact match");

    // Bucket 8-15: Day 8 (30,000) + Day 15 (40,000) = 70,000
    assert_eq!(aging.bucket_8_15_paisa, 70000, "Bucket 8-15 exact match");

    // Bucket 16-30: Day 16 (50,000) + Day 30 (60,000) = 110,000
    assert_eq!(aging.bucket_16_30_paisa, 110000, "Bucket 16-30 exact match");

    // Bucket 31-60: Day 31 (70,000) + Day 60 (80,000) = 150,000
    assert_eq!(aging.bucket_31_60_paisa, 150000, "Bucket 31-60 exact match");

    // Bucket 60+: Day 61 (90,000) + Day 120 (100,000) = 190,000
    assert_eq!(aging.bucket_60_plus_paisa, 190000, "Bucket 60+ exact match");

    // Verify all 10 individual invoice line items have correct bucket attribution
    assert_eq!(aging.invoices.len(), 10);
    for inv_item in &aging.invoices {
        let expected_match = boundary_invoices.iter().find(|(num, _, _, _, _)| *num == inv_item.invoice_number);
        assert!(expected_match.is_some(), "Invoice found in boundary list: {}", inv_item.invoice_number);
        let (_, _, exp_days, exp_due, exp_bucket) = expected_match.unwrap();
        assert_eq!(inv_item.age_days, *exp_days, "Age days mismatch on {}", inv_item.invoice_number);
        assert_eq!(inv_item.due_amount_paisa, *exp_due, "Due mismatch on {}", inv_item.invoice_number);
        assert_eq!(inv_item.bucket, *exp_bucket, "Bucket mismatch on {}", inv_item.invoice_number);
    }

    // Verify agency-wide aggregation
    let agency_report = AccountingService::calculate_agency_aging(&conn, Some(as_of_date_str), None)
        .expect("Agency aging calculation");
    assert_eq!(agency_report.total_bucket_0_7_paisa, 30000);
    assert_eq!(agency_report.total_bucket_8_15_paisa, 70000);
    assert_eq!(agency_report.total_bucket_16_30_paisa, 110000);
    assert_eq!(agency_report.total_bucket_31_60_paisa, 150000);
    assert_eq!(agency_report.total_bucket_60_plus_paisa, 190000);
    assert_eq!(agency_report.grand_total_outstanding_paisa, 550000);
}

// ============================================================================
// STRESS TEST 1 (PART B): CREDIT LIMIT WARNING (80%) AND BLOCKING (>=100%)
// ============================================================================
#[test]
fn test_stress_1_credit_limit_utilization_warning_and_blocking() {
    let mut conn = setup_stress_db();

    // Customer 3 (Subhanallah Cold Corner) has credit_limit_paisa = 10,000,000 (₨ 100,000)
    conn.execute("UPDATE customers SET current_balance_paisa = 0, current_balance = 0, credit_status = 'ACTIVE' WHERE id = 3", [])
        .expect("Reset customer 3 balance");

    // Case 1: Utilization at 79.9% (7,990,000 paisa) -> Below warning threshold (ACTIVE)
    let check_79 = SalesService::check_credit_status(&conn, 3, 7990000).expect("Check credit at 79.9%");
    assert_eq!(check_79.utilization_percentage, 79);
    assert_eq!(check_79.is_warning, false, "79% must NOT trigger warning");
    assert_eq!(check_79.is_breached, false);
    assert_eq!(check_79.status, "ACTIVE");

    // Case 2: Utilization at EXACTLY 80.0% (8,000,000 paisa) -> WARNING threshold triggered
    let check_80 = SalesService::check_credit_status(&conn, 3, 8000000).expect("Check credit at exactly 80.0%");
    assert_eq!(check_80.utilization_percentage, 80);
    assert_eq!(check_80.is_warning, true, "Exactly 80.0% MUST trigger warning");
    assert_eq!(check_80.is_breached, false);
    assert_eq!(check_80.status, "WARNING");

    // Case 3: Utilization at 99.9% (9,990,000 paisa) -> Still in WARNING band
    let check_99 = SalesService::check_credit_status(&conn, 3, 9990000).expect("Check credit at 99.9%");
    assert_eq!(check_99.utilization_percentage, 99);
    assert_eq!(check_99.is_warning, true);
    assert_eq!(check_99.is_breached, false);
    assert_eq!(check_99.status, "WARNING");

    // Case 4: Utilization at > 100.0% (10,500,000 paisa) -> BLOCKED threshold triggered
    let check_105 = SalesService::check_credit_status(&conn, 3, 10500000).expect("Check credit at 105%");
    assert_eq!(check_105.utilization_percentage, 105);
    assert_eq!(check_105.is_breached, true, "Over 100% MUST be breached");
    assert_eq!(check_105.status, "BLOCKED");

    // Attempting credit sale without admin PIN when blocked MUST return CreditLimitExceeded error
    let invoice_res = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 3,
            invoice_number: Some("INV-STRESS-BREACH".into()),
            invoice_date: Some("2026-11-05".into()),
            due_date: None,
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 2,
                pack_qty: 100, // 100 packs @ 1,050 PKR = 105,000 PKR (10,500,000 paisa)
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
        },
    );
    assert!(invoice_res.is_err(), "Invoice exceeding credit limit without PIN must be rejected");
    match invoice_res.unwrap_err() {
        AppError::CreditLimitExceeded { customer_id, limit_paisa, attempted_paisa, .. } => {
            assert_eq!(customer_id, 3);
            assert_eq!(limit_paisa, 10000000);
            assert_eq!(attempted_paisa, 10500000);
        }
        other => panic!("Expected CreditLimitExceeded, got: {:?}", other),
    }

    // Case 5: Verify recovery status transitions in AccountingService
    // Set customer balance to 12,000,000 (120% -> BLOCKED)
    conn.execute("UPDATE customers SET current_balance_paisa = 12000000, current_balance = 120000, credit_status = 'BLOCKED' WHERE id = 3", [])
        .expect("Set customer 3 to 120% debt");

    // Recover 3,500,000 paisa (35,000 PKR) -> New balance: 8,500,000 (85% -> WARNING)
    let rec1 = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 3,
            amount_paisa: 3500000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some("2026-11-05".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Transition to warning".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record recovery 1");
    assert_eq!(rec1.new_balance_paisa, 8500000);

    let status1: String = conn.query_row("SELECT credit_status FROM customers WHERE id = 3", [], |r| r.get(0)).unwrap();
    assert_eq!(status1, "WARNING", "85% utilization must transition to WARNING");

    // Recover 1,600,000 paisa (16,000 PKR) -> New balance: 6,900,000 (69% -> ACTIVE)
    let rec2 = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 3,
            amount_paisa: 1600000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some("2026-11-06".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Transition to active".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record recovery 2");
    assert_eq!(rec2.new_balance_paisa, 6900000);

    let status2: String = conn.query_row("SELECT credit_status FROM customers WHERE id = 3", [], |r| r.get(0)).unwrap();
    assert_eq!(status2, "ACTIVE", "69% utilization must transition to ACTIVE");
}

// ============================================================================
// STRESS TEST 2: RECOVERY ALLOCATION STRESS (FIFO KNOCK-OFF ACROSS 5 INVOICES)
// ============================================================================
#[test]
fn test_stress_2_fifo_knock_off_5_invoices_partial_exact_overpay() {
    let mut conn = setup_stress_db();

    // Customer 1: Seed 5 sequential unpaid invoices with different dates and amounts
    // Inv 1: 2026-11-01, 10,000 PKR (1,000,000 paisa)
    // Inv 2: 2026-11-02, 15,000 PKR (1,500,000 paisa)
    // Inv 3: 2026-11-03, 20,000 PKR (2,000,000 paisa)
    // Inv 4: 2026-11-04, 25,000 PKR (2,500,000 paisa)
    // Inv 5: 2026-11-05, 30,000 PKR (3,000,000 paisa)
    // Total debt: 100,000 PKR (10,000,000 paisa)
    conn.execute("DELETE FROM sales_invoices WHERE customer_id = 1", []).expect("Clean customer 1 invoices");
    conn.execute("UPDATE customers SET current_balance_paisa = 10000000, current_balance = 100000 WHERE id = 1", [])
        .expect("Set customer 1 balance");

    let test_invoices = vec![
        (501i64, "INV-FIFO-01", "2026-11-01", 1000000i64),
        (502i64, "INV-FIFO-02", "2026-11-02", 1500000i64),
        (503i64, "INV-FIFO-03", "2026-11-03", 2000000i64),
        (504i64, "INV-FIFO-04", "2026-11-04", 2500000i64),
        (505i64, "INV-FIFO-05", "2026-11-05", 3000000i64),
    ];

    for (id, num, dt, due) in &test_invoices {
        conn.execute(
            "INSERT INTO sales_invoices (
                id, invoice_number, customer_id, invoice_date, due_date,
                payment_type, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
                status, is_cancelled
             ) VALUES (?1, ?2, 1, ?3, ?3, 'CREDIT', ?4, ?4, 0, ?4, 'UNPAID', 0)",
            params![id, num, dt, due],
        ).expect("Insert test FIFO invoice");
    }

    // Step A: Partial Recovery Knock-Off
    // Customer pays 20,000 PKR (2,000,000 paisa) via CASH
    // Expected knock-off:
    // - Inv 501 (10,000 PKR): 100% paid (due = 0, status = PAID)
    // - Inv 502 (15,000 PKR): 10,000 PKR paid, 5,000 PKR remaining (due = 500,000, status = PARTIAL)
    // - Inv 503, 504, 505: untouched (status = UNPAID)
    let rec_a = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 2000000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some("2026-11-06".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Partial FIFO recovery".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record FIFO partial recovery");

    assert_eq!(rec_a.previous_balance_paisa, 10000000);
    assert_eq!(rec_a.new_balance_paisa, 8000000); // 100,000 - 20,000 = 80,000
    assert_eq!(rec_a.unallocated_remainder_paisa, 0);
    assert_eq!(rec_a.allocations.len(), 2);

    assert_eq!(rec_a.allocations[0].invoice_id, 501);
    assert_eq!(rec_a.allocations[0].allocated_paisa, 1000000);
    assert_eq!(rec_a.allocations[0].remaining_due_paisa, 0);
    assert_eq!(rec_a.allocations[0].new_status, "PAID");

    assert_eq!(rec_a.allocations[1].invoice_id, 502);
    assert_eq!(rec_a.allocations[1].allocated_paisa, 1000000);
    assert_eq!(rec_a.allocations[1].remaining_due_paisa, 500000);
    assert_eq!(rec_a.allocations[1].new_status, "PARTIAL");

    // Verify Inv 503, 504, 505 in database remain UNPAID
    let (due_503, status_503): (i64, String) = conn
        .query_row("SELECT due_amount_paisa, status FROM sales_invoices WHERE id = 503", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();
    assert_eq!(due_503, 2000000);
    assert_eq!(status_503, "UNPAID");

    // Step B: Exact Recovery Knock-Off
    // Customer pays exactly 5,000 PKR (500,000 paisa) via BANK
    // Expected knock-off:
    // - Inv 502 (remaining 5,000 PKR) is now 100% paid (due = 0, status = PAID)
    // - Invoices 503, 504, 505 untouched
    let prev_bank: i64 = conn.query_row("SELECT current_balance_paisa FROM bank_accounts WHERE id = 1", [], |r| r.get(0)).unwrap();

    let rec_b = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 500000,
            payment_mode: "BANK".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some("2026-11-07".into()),
            target_invoice_ids: None,
            bank_account_id: Some(1),
            bank_name: Some("Meezan Bank".into()),
            instrument_number: Some("RAAST-502-EXACT".into()),
            instrument_date: None,
            notes: Some("Exact bill knock-off".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record FIFO exact recovery");

    assert_eq!(rec_b.previous_balance_paisa, 8000000);
    assert_eq!(rec_b.new_balance_paisa, 7500000);
    assert_eq!(rec_b.unallocated_remainder_paisa, 0);
    assert_eq!(rec_b.allocations.len(), 1);
    assert_eq!(rec_b.allocations[0].invoice_id, 502);
    assert_eq!(rec_b.allocations[0].allocated_paisa, 500000);
    assert_eq!(rec_b.allocations[0].remaining_due_paisa, 0);
    assert_eq!(rec_b.allocations[0].new_status, "PAID");

    let new_bank: i64 = conn.query_row("SELECT current_balance_paisa FROM bank_accounts WHERE id = 1", [], |r| r.get(0)).unwrap();
    assert_eq!(new_bank, prev_bank + 500000);

    // Step C: Overpayment Recovery Knock-Off
    // Remaining open invoices: Inv 503 (20k), Inv 504 (25k), Inv 505 (30k) = 75,000 PKR (7,500,000 paisa)
    // Customer pays 85,000 PKR (8,500,000 paisa) via CASH (overpayment of 10,000 PKR / 1,000,000 paisa)
    // Expected:
    // - Inv 503, 504, 505 are ALL marked PAID with due = 0
    // - Unallocated remainder = 1,000,000 paisa
    // - Customer balance becomes -1,000,000 paisa (Retailer Advance Credit)
    let rec_c = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 8500000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some("2026-11-08".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Overpayment across all remaining bills".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record FIFO overpayment recovery");

    assert_eq!(rec_c.previous_balance_paisa, 7500000);
    assert_eq!(rec_c.new_balance_paisa, -1000000, "Balance must become negative advance credit");
    assert_eq!(rec_c.unallocated_remainder_paisa, 1000000, "Unallocated remainder must be 10,000 PKR");
    assert_eq!(rec_c.allocations.len(), 3);

    assert_eq!(rec_c.allocations[0].invoice_id, 503);
    assert_eq!(rec_c.allocations[0].allocated_paisa, 2000000);
    assert_eq!(rec_c.allocations[0].remaining_due_paisa, 0);
    assert_eq!(rec_c.allocations[0].new_status, "PAID");

    assert_eq!(rec_c.allocations[1].invoice_id, 504);
    assert_eq!(rec_c.allocations[1].allocated_paisa, 2500000);
    assert_eq!(rec_c.allocations[1].remaining_due_paisa, 0);
    assert_eq!(rec_c.allocations[1].new_status, "PAID");

    assert_eq!(rec_c.allocations[2].invoice_id, 505);
    assert_eq!(rec_c.allocations[2].allocated_paisa, 3000000);
    assert_eq!(rec_c.allocations[2].remaining_due_paisa, 0);
    assert_eq!(rec_c.allocations[2].new_status, "PAID");

    // Verify all 5 invoices in database are now PAID with due = 0
    let total_remaining_due: i64 = conn
        .query_row("SELECT SUM(due_amount_paisa) FROM sales_invoices WHERE customer_id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(total_remaining_due, 0, "All 5 invoices must have 0 remaining due");

    // Verify customer_recoveries record in DB stores unallocated remainder
    let db_remainder: i64 = conn
        .query_row("SELECT unallocated_remainder_paisa FROM customer_recoveries WHERE id = ?1", params![rec_c.recovery_id], |r| r.get(0))
        .unwrap();
    assert_eq!(db_remainder, 1000000);
}

// ============================================================================
// STRESS TEST 2 (PART B): SPECIFIC BILL ALLOCATION OVERPAYMENT ADVANCE CREDIT
// ============================================================================
#[test]
fn test_stress_2_specific_bill_overpayment_advance_credit() {
    let mut conn = setup_stress_db();

    // Customer 2: Setup 2 open invoices
    // Inv A (id 601): 25,000 PKR (2,500,000 paisa)
    // Inv B (id 602): 40,000 PKR (4,000,000 paisa)
    // Total debt: 65,000 PKR (6,500,000 paisa)
    conn.execute("DELETE FROM sales_invoices WHERE customer_id = 2", []).expect("Clean customer 2 invoices");
    conn.execute("UPDATE customers SET current_balance_paisa = 6500000, current_balance = 65000 WHERE id = 2", [])
        .expect("Set customer 2 balance");

    conn.execute(
        "INSERT INTO sales_invoices (id, invoice_number, customer_id, invoice_date, due_date, payment_type, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa, status, is_cancelled)
         VALUES (601, 'INV-SPEC-A', 2, '2026-11-01', '2026-11-01', 'CREDIT', 2500000, 2500000, 0, 2500000, 'UNPAID', 0)",
        [],
    ).expect("Insert Inv Spec A");

    conn.execute(
        "INSERT INTO sales_invoices (id, invoice_number, customer_id, invoice_date, due_date, payment_type, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa, status, is_cancelled)
         VALUES (602, 'INV-SPEC-B', 2, '2026-11-02', '2026-11-02', 'CREDIT', 4000000, 4000000, 0, 4000000, 'UNPAID', 0)",
        [],
    ).expect("Insert Inv Spec B");

    // Retailer deposits 35,000 PKR (3,500,000 paisa) against Inv A ONLY (target_invoice_ids: [601])
    // Inv A due is 25,000 PKR, so this overpays Inv A by 10,000 PKR (1,000,000 paisa).
    // Inv B MUST NOT be touched because this is Mode A (SPECIFIC).
    let rec = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 2,
            amount_paisa: 3500000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("SPECIFIC".into()),
            payment_date: Some("2026-11-06".into()),
            target_invoice_ids: Some(vec![601]),
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Specific bill overpayment".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record specific bill overpayment");

    assert_eq!(rec.previous_balance_paisa, 6500000);
    assert_eq!(rec.new_balance_paisa, 3000000); // 65,000 - 35,000 = 30,000
    assert_eq!(rec.unallocated_remainder_paisa, 1000000, "10,000 PKR unallocated advance remainder");
    assert_eq!(rec.allocations.len(), 1, "Only targeted invoice must receive allocation");

    assert_eq!(rec.allocations[0].invoice_id, 601);
    assert_eq!(rec.allocations[0].allocated_paisa, 2500000);
    assert_eq!(rec.allocations[0].remaining_due_paisa, 0);
    assert_eq!(rec.allocations[0].new_status, "PAID");

    // Verify Inv B is completely untouched in DB
    let (due_b, status_b): (i64, String) = conn
        .query_row("SELECT due_amount_paisa, status FROM sales_invoices WHERE id = 602", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();
    assert_eq!(due_b, 4000000, "Untargeted invoice B must remain with full 40,000 PKR due");
    assert_eq!(status_b, "UNPAID", "Untargeted invoice B must remain UNPAID");

    // Verify thermal receipt displays advance credit remainder
    assert!(rec.formatted_thermal_receipt.contains("WASOOLI RASEED"));
    assert!(rec.formatted_thermal_receipt.contains("INV-SPEC-A"));
    assert!(rec.formatted_thermal_receipt.contains("Advance Credit Remainder"));
    assert!(rec.formatted_thermal_receipt.contains("10000.00"));
}

// ============================================================================
// STRESS TEST 2 (PART C): ON-ACCOUNT PAYMENT WHEN CUSTOMER HAS 0 OUTSTANDING
// ============================================================================
#[test]
fn test_stress_2_on_account_advance_deposit() {
    let mut conn = setup_stress_db();

    // Customer 1: Set balance to 0 and verify no open invoices
    conn.execute("DELETE FROM sales_invoices WHERE customer_id = 1", []).expect("Clean customer 1 invoices");
    conn.execute("UPDATE customers SET current_balance_paisa = 0, current_balance = 0 WHERE id = 1", []).expect("Zero customer 1");

    let prev_cash: i64 = conn
        .query_row("SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .unwrap_or(0);

    // Retailer deposits 50,000 PKR (5,000,000 paisa) purely on-account
    let rec = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 5000000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some("2026-11-07".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Pre-season advance credit deposit".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).expect("Record on-account advance deposit");

    assert_eq!(rec.previous_balance_paisa, 0);
    assert_eq!(rec.new_balance_paisa, -5000000, "Customer balance must become -50,000 PKR (Advance credit)");
    assert_eq!(rec.unallocated_remainder_paisa, 5000000, "All 50,000 PKR is unallocated remainder");
    assert!(rec.allocations.is_empty(), "On-account mode must not generate bill allocations");

    // Verify Cash Book increased
    let new_cash: i64 = conn
        .query_row("SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(new_cash, prev_cash + 5000000);

    // Verify Customer Ledger statement
    let statement = AccountingService::get_customer_ledger(&conn, 1, None, None).expect("Customer statement");
    assert_eq!(statement.closing_balance_paisa, -5000000);
    assert_eq!(statement.total_credit_paisa, 5000000);
    assert_eq!(statement.total_debit_paisa, 0);

    // Verify Balanced Journal Entry: Dr Cash 1010 (50k), Cr Accounts Receivable 1200 (50k)
    let (dr_acct, cr_acct): (i64, i64) = conn
        .query_row(
            "SELECT 
                (SELECT account_id FROM journal_lines WHERE entry_id = ?1 AND debit_paisa > 0),
                (SELECT account_id FROM journal_lines WHERE entry_id = ?1 AND credit_paisa > 0)",
            params![rec.journal_entry_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query JV accounts");
    assert_eq!(dr_acct, 2); // 1010 Cash
    assert_eq!(cr_acct, 8); // 1200 Accounts Receivable
}

// ============================================================================
// STRESS TEST 3: DAY-LOCK SECURITY & SQLITE TRIGGER ENFORCEMENT
// ============================================================================
#[test]
fn test_stress_3_day_lock_security_and_trigger_enforcement() {
    let mut conn = setup_stress_db();
    let locked_date = "2026-11-02";

    // Step 1: Establish locked day in daily_closings
    conn.execute(
        "INSERT INTO daily_closings (
            closing_date, opening_cash_paisa, total_cash_in_paisa, total_cash_out_paisa,
            expected_closing_cash_paisa, physical_closing_cash_paisa, variance_paisa,
            status, is_locked, closed_by
         ) VALUES (?1, 1000000, 500000, 200000, 1300000, 1300000, 0, 'LOCKED', 1, 1)",
        params![locked_date],
    ).expect("Insert locked daily closing record");

    // Verify locked date exists
    let is_locked: bool = conn
        .query_row("SELECT is_locked FROM daily_closings WHERE closing_date = ?1", params![locked_date], |r| r.get(0))
        .unwrap();
    assert!(is_locked, "Date 2026-11-02 must be locked");

    // ------------------------------------------------------------------------
    // SUB-CASE 3A: Customer Recovery on Locked Date
    // ------------------------------------------------------------------------
    // 1. Application-level guard in AccountingService
    let rec_app_err = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 100000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some(locked_date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Illegal locked date recovery".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).unwrap_err();

    match rec_app_err {
        AppError::DayLocked(msg) => {
            assert!(msg.contains("locked"), "Expected day-locked error, got: {}", msg);
        }
        other => panic!("Expected DayLocked error, got: {:?}", other),
    }

    // 2. Database Engine Trigger trg_prevent_insert_locked_recovery Enforcement
    // Bypassing Rust service and executing raw SQL INSERT must trigger SQLite ABORT
    let raw_rec_err = conn.execute(
        "INSERT INTO customer_recoveries (
            recovery_number, customer_id, recovery_date, amount_paisa, amount,
            payment_mode, allocation_mode, previous_balance_paisa, new_balance_paisa
         ) VALUES ('REC-TRIGGER-ABORT', 1, ?1, 100000, 1000.0, 'CASH', 'FIFO', 100000, 0)",
        params![locked_date],
    ).unwrap_err();

    let rec_err_str = raw_rec_err.to_string();
    assert!(
        rec_err_str.contains("Access Denied: Cannot record recovery on a locked accounting date."),
        "SQLite trigger trg_prevent_insert_locked_recovery must fire verbatim! Got: {}",
        rec_err_str
    );

    // ------------------------------------------------------------------------
    // SUB-CASE 3B: Operating Expense on Locked Date
    // ------------------------------------------------------------------------
    // 1. Application-level guard in AccountingService
    let exp_app_err = AccountingService::record_expense(
        &mut conn,
        RecordExpenseDto {
            expense_date: Some(locked_date.into()),
            account_id: 30, // 6010 Fuel
            amount_paisa: 50000,
            payment_mode: "CASH".into(),
            bank_account_id: None,
            recipient_name: None,
            description: "Illegal locked date expense".into(),
            reference_number: None,
            receipt_ref_no: None,
            trip_id: None,
            user_id: Some(1),
        },
    ).unwrap_err();

    match exp_app_err {
        AppError::DayLocked(msg) => {
            assert!(msg.contains("locked"), "Expected day-locked error, got: {}", msg);
        }
        other => panic!("Expected DayLocked error, got: {:?}", other),
    }

    // 2. Database Engine Trigger trg_prevent_insert_locked_operating_expense Enforcement
    let raw_exp_err = conn.execute(
        "INSERT INTO operating_expenses (
            expense_number, expense_date, account_id, amount, amount_paisa, payment_mode, description
         ) VALUES ('EXP-TRIGGER-ABORT', ?1, 30, 500.0, 50000, 'CASH', 'Illegal raw expense')",
        params![locked_date],
    ).unwrap_err();

    let exp_err_str = raw_exp_err.to_string();
    assert!(
        exp_err_str.contains("Access Denied: Cannot record an operating expense on a locked accounting date."),
        "SQLite trigger trg_prevent_insert_locked_operating_expense must fire verbatim! Got: {}",
        exp_err_str
    );

    // ------------------------------------------------------------------------
    // SUB-CASE 3C: Tamper-Resistance: Update / Delete on Locked Recoveries & Expenses
    // ------------------------------------------------------------------------
    // Seed an unlocked record then mark is_locked = 1
    conn.execute(
        "INSERT INTO operating_expenses (id, expense_number, expense_date, account_id, amount, amount_paisa, payment_mode, description, is_locked)
         VALUES (999, 'EXP-LOCKED-01', '2026-11-01', 30, 100.0, 10000, 'CASH', 'Locked test expense', 0)",
        [],
    ).expect("Seed unlocked expense");
    conn.execute("UPDATE operating_expenses SET is_locked = 1 WHERE id = 999", []).expect("Lock expense 999");

    let upd_exp_err = conn.execute("UPDATE operating_expenses SET amount_paisa = 20000 WHERE id = 999", []).unwrap_err();
    assert!(
        upd_exp_err.to_string().contains("Access Denied: Cannot modify an expense on a locked accounting date."),
        "trg_prevent_update_locked_operating_expense must fire"
    );

    let del_exp_err = conn.execute("DELETE FROM operating_expenses WHERE id = 999", []).unwrap_err();
    assert!(
        del_exp_err.to_string().contains("Access Denied: Operating expenses cannot be deleted on a locked accounting date."),
        "trg_prevent_delete_operating_expense must fire"
    );

    conn.execute(
        "INSERT INTO customer_recoveries (id, recovery_number, customer_id, recovery_date, amount_paisa, amount, payment_mode, allocation_mode, previous_balance_paisa, new_balance_paisa, is_locked)
         VALUES (888, 'REC-LOCKED-01', 1, '2026-11-01', 10000, 100.0, 'CASH', 'FIFO', 10000, 0, 0)",
        [],
    ).expect("Seed unlocked recovery");
    conn.execute("UPDATE customer_recoveries SET is_locked = 1 WHERE id = 888", []).expect("Lock recovery 888");

    let upd_rec_err = conn.execute("UPDATE customer_recoveries SET amount_paisa = 20000 WHERE id = 888", []).unwrap_err();
    assert!(
        upd_rec_err.to_string().contains("Access Denied: Cannot modify a recovery on a locked accounting date."),
        "trg_prevent_update_locked_recovery must fire"
    );

    let del_rec_err = conn.execute("DELETE FROM customer_recoveries WHERE id = 888", []).unwrap_err();
    assert!(
        del_rec_err.to_string().contains("Access Denied: Cannot delete a recovery on a locked accounting date."),
        "trg_prevent_delete_locked_recovery must fire"
    );

    // ------------------------------------------------------------------------
    // SUB-CASE 3D: Empirical Audit of Journal Entry Mutations on Locked Dates
    // ------------------------------------------------------------------------
    // Challenge question: Does journal_entries have a BEFORE INSERT trigger matching
    // daily_closings like customer_recoveries and operating_expenses?
    let raw_jv_res = conn.execute(
        "INSERT INTO journal_entries (entry_number, entry_date, voucher_type, narration, is_balanced)
         VALUES ('JE-AUDIT-LOCKED', ?1, 'MANUAL', 'Audit check on locked date', 1)",
        params![locked_date],
    );

    // Note the empirical result:
    // If SQLite does NOT have a trigger on journal_entries, this raw insert succeeds,
    // exposing a missing trigger defense in schema/migration 6.
    if raw_jv_res.is_ok() {
        println!("[CHALLENGER AUDIT] Notice: journal_entries table lacks a BEFORE INSERT day-lock trigger on daily_closings! Direct SQL inserted id={}", conn.last_insert_rowid());
    }

    // Also test service-level post_journal_entry on locked date
    let tx = conn.transaction().expect("Start transaction for JV test");
    let manual_jv = CreateJournalEntryInput {
        entry_date: locked_date.into(),
        voucher_type: "MANUAL".into(),
        reference_doc_type: None,
        reference_doc_id: None,
        narration: "Attempted manual JV on locked date".into(),
        lines: vec![
            JournalLineInput {
                account_id: 2, // 1010 Cash
                debit_paisa: 100000,
                credit_paisa: 0,
                line_narration: None,
                customer_id: None,
                supplier_id: None,
            },
            JournalLineInput {
                account_id: 8, // 1200 Accounts Receivable
                debit_paisa: 0,
                credit_paisa: 100000,
                line_narration: None,
                customer_id: Some(1),
                supplier_id: None,
            },
        ],
        created_by: Some(1),
    };
    let service_jv_res = AccountingService::post_journal_entry(&tx, manual_jv);
    if service_jv_res.is_ok() {
        println!("[CHALLENGER AUDIT] Notice: AccountingService::post_journal_entry also lacks day-lock check against daily_closings! JV posted id={}", service_jv_res.unwrap());
    }
}
