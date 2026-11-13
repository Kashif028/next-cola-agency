//! Empirical Challenger Test Suite: Milestone 4 Udhaar Aging & FIFO Knock-off
//! File: src-tauri/tests/challenger_m4_aging_empirical.rs
//!
//! EMPIRICAL CHALLENGER verification:
//! 1. Future Invoices relative to as_of_date are NEVER included in aging or clamped to 0-7 days.
//! 2. Multi-step FIFO knock-off allocation stress with same-day ties, partials, exacts, and overpayments.
//! 3. 80mm Wasooli Raseed 48-column thermal alignment across boundary lengths.

use chrono::{Duration, NaiveDate};
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::dtos::*;
use logar_pos_lib::services::accounting::{format_recovery_receipt, AccountingService};
use rusqlite::{params, Connection};

fn setup_test_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations");
    conn
}

// ============================================================================
// EMPIRICAL CHALLENGE 1: FUTURE INVOICES RELATIVE TO AS_OF_DATE
// ============================================================================
#[test]
fn test_empirical_future_invoices_never_in_aging() {
    let conn = setup_test_db();
    let as_of_date_str = "2026-11-15";
    let as_of_date = NaiveDate::parse_from_str(as_of_date_str, "%Y-%m-%d").unwrap();

    // Clean invoices for customers 1 and 2
    conn.execute("DELETE FROM sales_invoices WHERE customer_id IN (1, 2)", []).unwrap();

    // Customer 1: Mixed Past and Future Invoices
    // Past Invoices:
    // - INV-PAST-00 (0 days old: 2026-11-15) -> 10,000 paisa (Bucket 0_7)
    // - INV-PAST-07 (7 days old: 2026-11-08) -> 20,000 paisa (Bucket 0_7)
    // - INV-PAST-14 (14 days old: 2026-11-01) -> 30,000 paisa (Bucket 8_15)
    // - INV-PAST-25 (25 days old: 2026-10-21) -> 40,000 paisa (Bucket 16_30)
    // - INV-PAST-45 (45 days old: 2026-10-01) -> 50,000 paisa (Bucket 31_60)
    // - INV-PAST-75 (75 days old: 2026-09-01) -> 60,000 paisa (Bucket 60_PLUS)
    // Sum of past invoices = 210,000 paisa (₨ 2,100)
    let past_invoices = vec![
        ("INV-PAST-00", as_of_date.format("%Y-%m-%d").to_string(), 10000i64),
        ("INV-PAST-07", (as_of_date - Duration::days(7)).format("%Y-%m-%d").to_string(), 20000i64),
        ("INV-PAST-14", (as_of_date - Duration::days(14)).format("%Y-%m-%d").to_string(), 30000i64),
        ("INV-PAST-25", (as_of_date - Duration::days(25)).format("%Y-%m-%d").to_string(), 40000i64),
        ("INV-PAST-45", (as_of_date - Duration::days(45)).format("%Y-%m-%d").to_string(), 50000i64),
        ("INV-PAST-75", (as_of_date - Duration::days(75)).format("%Y-%m-%d").to_string(), 60000i64),
    ];

    for (num, dt, due) in &past_invoices {
        conn.execute(
            "INSERT INTO sales_invoices (
                invoice_number, customer_id, invoice_date, due_date,
                subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
                status, is_cancelled, payment_type
             ) VALUES (?1, 1, ?2, ?2, ?3, ?3, 0, ?3, 'UNPAID', 0, 'CREDIT')",
            params![num, dt, due],
        ).unwrap();
    }

    // Future Invoices for Customer 1:
    // - INV-FUT-01 (+1 day: 2026-11-16)  -> 70,000 paisa
    // - INV-FUT-05 (+5 days: 2026-11-20) -> 80,000 paisa
    // - INV-FUT-15 (+15 days: 2026-11-30) -> 90,000 paisa
    // - INV-FUT-60 (+60 days: 2027-01-14) -> 100,000 paisa
    // - INV-FUT-365 (+365 days: 2027-11-15) -> 200,000 paisa
    let future_invoices = vec![
        ("INV-FUT-01", (as_of_date + Duration::days(1)).format("%Y-%m-%d").to_string(), 70000i64),
        ("INV-FUT-05", (as_of_date + Duration::days(5)).format("%Y-%m-%d").to_string(), 80000i64),
        ("INV-FUT-15", (as_of_date + Duration::days(15)).format("%Y-%m-%d").to_string(), 90000i64),
        ("INV-FUT-60", (as_of_date + Duration::days(60)).format("%Y-%m-%d").to_string(), 100000i64),
        ("INV-FUT-365", (as_of_date + Duration::days(365)).format("%Y-%m-%d").to_string(), 200000i64),
    ];

    for (num, dt, due) in &future_invoices {
        conn.execute(
            "INSERT INTO sales_invoices (
                invoice_number, customer_id, invoice_date, due_date,
                subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
                status, is_cancelled, payment_type
             ) VALUES (?1, 1, ?2, ?2, ?3, ?3, 0, ?3, 'UNPAID', 0, 'CREDIT')",
            params![num, dt, due],
        ).unwrap();
    }

    // Customer 2: SOLELY Future Invoices
    conn.execute(
        "INSERT INTO sales_invoices (
            invoice_number, customer_id, invoice_date, due_date,
            subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            status, is_cancelled, payment_type
         ) VALUES ('INV-CUST2-FUT', 2, '2026-11-20', '2026-11-20', 500000, 500000, 0, 500000, 'UNPAID', 0, 'CREDIT')",
        [],
    ).unwrap();

    // 1. Calculate aging for Customer 1 as of 2026-11-15
    let aging_c1 = AccountingService::calculate_customer_aging(&conn, 1, Some(as_of_date_str)).unwrap();

    // Verify buckets strictly match past invoices only:
    // Bucket 0_7: Day 0 (10,000) + Day 7 (20,000) = 30,000 paisa
    assert_eq!(aging_c1.bucket_0_7_paisa, 30000, "Bucket 0-7 must NOT contain any future invoices");
    // Bucket 8_15: Day 14 (30,000)
    assert_eq!(aging_c1.bucket_8_15_paisa, 30000);
    // Bucket 16_30: Day 25 (40,000)
    assert_eq!(aging_c1.bucket_16_30_paisa, 40000);
    // Bucket 31_60: Day 45 (50,000)
    assert_eq!(aging_c1.bucket_31_60_paisa, 50000);
    // Bucket 60_plus: Day 75 (60,000)
    assert_eq!(aging_c1.bucket_60_plus_paisa, 60000);

    // Total outstanding must equal 210,000 paisa, NOT including the 540,000 future invoices!
    assert_eq!(aging_c1.total_outstanding_paisa, 210000);
    assert_eq!(aging_c1.invoices.len(), 6, "Must contain exactly the 6 past invoices");

    for inv in &aging_c1.invoices {
        assert!(
            inv.invoice_number.starts_with("INV-PAST-"),
            "Future invoice leaked into aging items: {}",
            inv.invoice_number
        );
        assert!(inv.age_days >= 0, "Negative age days detected: {}", inv.age_days);
    }

    // 2. Calculate aging for Customer 2 (only future invoices)
    let aging_c2 = AccountingService::calculate_customer_aging(&conn, 2, Some(as_of_date_str)).unwrap();
    assert_eq!(aging_c2.total_outstanding_paisa, 0, "Customer with only future invoices must have 0 debt as of date");
    assert_eq!(aging_c2.bucket_0_7_paisa, 0);
    assert_eq!(aging_c2.bucket_8_15_paisa, 0);
    assert_eq!(aging_c2.bucket_16_30_paisa, 0);
    assert_eq!(aging_c2.bucket_31_60_paisa, 0);
    assert_eq!(aging_c2.bucket_60_plus_paisa, 0);
    assert!(aging_c2.invoices.is_empty(), "Invoices list must be empty for Customer 2");

    // 3. Agency-wide Aging Summary
    let agency_report = AccountingService::calculate_agency_aging(&conn, Some(as_of_date_str), None).unwrap();
    // Customer 2 must not be counted in customers_with_debt
    assert_eq!(
        agency_report.customer_agings.iter().any(|c| c.customer_id == 2),
        false,
        "Customer 2 must not appear in agency agings list"
    );
    assert_eq!(agency_report.total_bucket_0_7_paisa, 30000);
    assert_eq!(agency_report.grand_total_outstanding_paisa, 210000);

    // 4. Temporal Progression: Advance as_of_date to 2026-11-21 (+6 days)
    // Now:
    // - INV-FUT-01 (dated 2026-11-16) is 5 days old -> enters Bucket 0_7 (70,000)
    // - INV-FUT-05 (dated 2026-11-20) is 1 day old  -> enters Bucket 0_7 (80,000)
    // - INV-PAST-00 (dated 2026-11-15) is 6 days old -> still in Bucket 0_7 (10,000)
    // - INV-PAST-07 (dated 2026-11-08) is 13 days old -> transitioned to Bucket 8_15 (20,000)
    // Customer 2:
    // - INV-CUST2-FUT (dated 2026-11-20) is 1 day old -> enters Bucket 0_7 (500,000)
    let advanced_as_of = "2026-11-21";
    let aging_c1_adv = AccountingService::calculate_customer_aging(&conn, 1, Some(advanced_as_of)).unwrap();
    // Bucket 0_7: INV-FUT-01 (70,000) + INV-FUT-05 (80,000) + INV-PAST-00 (10,000) = 160,000
    assert_eq!(aging_c1_adv.bucket_0_7_paisa, 160000);
    // Total for C1 includes past (210,000) + 2 graduated future (150,000) = 360,000
    assert_eq!(aging_c1_adv.total_outstanding_paisa, 360000);
    assert_eq!(aging_c1_adv.invoices.len(), 8);

    // Customer 2 now has debt
    let aging_c2_adv = AccountingService::calculate_customer_aging(&conn, 2, Some(advanced_as_of)).unwrap();
    assert_eq!(aging_c2_adv.total_outstanding_paisa, 500000);
    assert_eq!(aging_c2_adv.bucket_0_7_paisa, 500000);
    assert_eq!(aging_c2_adv.invoices.len(), 1);
}

// ============================================================================
// EMPIRICAL CHALLENGE 2: FIFO KNOCK-OFF ALLOCATION STRESS HARNESS
// ============================================================================
#[test]
fn test_empirical_fifo_knock_off_multi_round_and_tie_breaking() {
    let mut conn = setup_test_db();

    // Clean invoices for customer 1
    conn.execute("DELETE FROM sales_invoices WHERE customer_id = 1", []).unwrap();
    conn.execute("UPDATE customers SET current_balance_paisa = 18000000, current_balance = 180000 WHERE id = 1", []).unwrap();

    // Seed 6 invoices:
    // Note: Invoices 702 and 703 have the SAME invoice_date ("2026-11-02")
    // FIFO must break ties deterministically by `id ASC`.
    // - Inv 701: 2026-11-01, 20,000 PKR (2,000,000 paisa)
    // - Inv 702: 2026-11-02, 30,000 PKR (3,000,000 paisa)  [Tie date]
    // - Inv 703: 2026-11-02, 25,000 PKR (2,500,000 paisa)  [Tie date]
    // - Inv 704: 2026-11-03, 35,000 PKR (3,500,000 paisa)
    // - Inv 705: 2026-11-04, 40,000 PKR (4,000,000 paisa)
    // - Inv 706: 2026-11-05, 30,000 PKR (3,000,000 paisa)
    // Total debt: 180,000 PKR (18,000,000 paisa)
    let invoices = vec![
        (701i64, "INV-701", "2026-11-01", 2000000i64),
        (702i64, "INV-702", "2026-11-02", 3000000i64),
        (703i64, "INV-703", "2026-11-02", 2500000i64),
        (704i64, "INV-704", "2026-11-03", 3500000i64),
        (705i64, "INV-705", "2026-11-04", 4000000i64),
        (706i64, "INV-706", "2026-11-05", 3000000i64),
    ];

    for (id, num, dt, due) in &invoices {
        conn.execute(
            "INSERT INTO sales_invoices (
                id, invoice_number, customer_id, invoice_date, due_date,
                payment_type, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
                status, is_cancelled
             ) VALUES (?1, ?2, 1, ?3, ?3, 'CREDIT', ?4, ?4, 0, ?4, 'UNPAID', 0)",
            params![id, num, dt, due],
        ).unwrap();
    }

    // ------------------------------------------------------------------------
    // ROUND 1: Partial payment of 12,000 PKR (1,200,000 paisa)
    // Inv 701 has 20,000 PKR due.
    // Result: Inv 701 paid 12,000, remaining due 8,000 (status: PARTIAL)
    // ------------------------------------------------------------------------
    let r1 = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 1200000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some("2026-11-06".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("R1 partial payment".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).unwrap();

    assert_eq!(r1.allocations.len(), 1);
    assert_eq!(r1.allocations[0].invoice_id, 701);
    assert_eq!(r1.allocations[0].allocated_paisa, 1200000);
    assert_eq!(r1.allocations[0].remaining_due_paisa, 800000);
    assert_eq!(r1.allocations[0].new_status, "PARTIAL");
    assert_eq!(r1.new_balance_paisa, 16800000);

    // ------------------------------------------------------------------------
    // ROUND 2: Payment of 28,000 PKR (2,800,000 paisa)
    // Expected:
    // - Inv 701: clears remaining 8,000 PKR (800,000 paisa) -> PAID
    // - Inv 702 (first of same-day tie): receives remaining 20,000 PKR (2,000,000 paisa) -> PARTIAL (10,000 PKR rem)
    // - Inv 703 (second of same-day tie): untouched!
    // ------------------------------------------------------------------------
    let r2 = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 2800000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some("2026-11-07".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("R2 tie break test".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).unwrap();

    assert_eq!(r2.allocations.len(), 2);
    assert_eq!(r2.allocations[0].invoice_id, 701);
    assert_eq!(r2.allocations[0].allocated_paisa, 800000);
    assert_eq!(r2.allocations[0].remaining_due_paisa, 0);
    assert_eq!(r2.allocations[0].new_status, "PAID");

    assert_eq!(r2.allocations[1].invoice_id, 702);
    assert_eq!(r2.allocations[1].allocated_paisa, 2000000);
    assert_eq!(r2.allocations[1].remaining_due_paisa, 1000000);
    assert_eq!(r2.allocations[1].new_status, "PARTIAL");
    assert_eq!(r2.new_balance_paisa, 14000000);

    // Verify Inv 703 is completely UNPAID
    let (due_703, stat_703): (i64, String) = conn
        .query_row("SELECT due_amount_paisa, status FROM sales_invoices WHERE id = 703", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();
    assert_eq!(due_703, 2500000);
    assert_eq!(stat_703, "UNPAID");

    // ------------------------------------------------------------------------
    // ROUND 3: Multi-Bill Clearing of 70,000 PKR (7,000,000 paisa)
    // Expected:
    // - Inv 702 (rem 10,000 PKR): receives 10,000 -> PAID (rem: 0)
    // - Inv 703 (25,000 PKR): receives 25,000 -> PAID (rem: 0)
    // - Inv 704 (35,000 PKR): receives 35,000 -> PAID (rem: 0)
    // Total knocked off = 10k + 25k + 35k = 70,000 PKR exactly!
    // ------------------------------------------------------------------------
    let r3 = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 7000000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some("2026-11-08".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("R3 multi bill clear".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).unwrap();

    assert_eq!(r3.allocations.len(), 3);
    assert_eq!(r3.allocations[0].invoice_id, 702);
    assert_eq!(r3.allocations[0].remaining_due_paisa, 0);
    assert_eq!(r3.allocations[0].new_status, "PAID");

    assert_eq!(r3.allocations[1].invoice_id, 703);
    assert_eq!(r3.allocations[1].remaining_due_paisa, 0);
    assert_eq!(r3.allocations[1].new_status, "PAID");

    assert_eq!(r3.allocations[2].invoice_id, 704);
    assert_eq!(r3.allocations[2].remaining_due_paisa, 0);
    assert_eq!(r3.allocations[2].new_status, "PAID");
    assert_eq!(r3.new_balance_paisa, 7000000); // 140,000 - 70,000 = 70,000

    // ------------------------------------------------------------------------
    // ROUND 4: Complete Clearing + Overpayment (Advance Credit)
    // Remaining open bills: Inv 705 (40,000) + Inv 706 (30,000) = 70,000 PKR
    // Customer deposits 100,000 PKR (10,000,000 paisa)
    // Expected:
    // - Inv 705: receives 40,000 -> PAID
    // - Inv 706: receives 30,000 -> PAID
    // - Unallocated remainder: 30,000 PKR (3,000,000 paisa)
    // - Customer new balance: -30,000 PKR (advance credit)
    // ------------------------------------------------------------------------
    let r4 = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 10000000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some("2026-11-09".into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("R4 overpayment advance".into()),
            user_id: Some(1),
            delivery_sheet_id: None,
        },
    ).unwrap();

    assert_eq!(r4.allocations.len(), 2);
    assert_eq!(r4.allocations[0].invoice_id, 705);
    assert_eq!(r4.allocations[0].remaining_due_paisa, 0);
    assert_eq!(r4.allocations[0].new_status, "PAID");

    assert_eq!(r4.allocations[1].invoice_id, 706);
    assert_eq!(r4.allocations[1].remaining_due_paisa, 0);
    assert_eq!(r4.allocations[1].new_status, "PAID");

    assert_eq!(r4.unallocated_remainder_paisa, 3000000, "Unallocated advance must be 30,000 PKR");
    assert_eq!(r4.new_balance_paisa, -3000000, "Customer balance must be -30,000 PKR");

    // All 6 invoices now have due_amount_paisa == 0
    let total_remaining_due: i64 = conn
        .query_row("SELECT SUM(due_amount_paisa) FROM sales_invoices WHERE customer_id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(total_remaining_due, 0);
}

// ============================================================================
// EMPIRICAL CHALLENGE 3: 80MM WASOOLI RASEED 48-COLUMN ALIGNMENT STRESS
// ============================================================================
#[test]
fn test_empirical_wasooli_raseed_strict_48_columns() {
    let test_allocations = vec![
        InvoiceAllocationDetailDto {
            invoice_id: 101,
            invoice_number: "INV-101".into(), // short (7 chars)
            invoice_date: "2026-11-01".into(),
            previous_due_paisa: 1500000,
            allocated_paisa: 1500000,
            remaining_due_paisa: 0,
            new_status: "PAID".into(),
        },
        InvoiceAllocationDetailDto {
            invoice_id: 102,
            invoice_number: "INV-EXACT-15CHR".into(), // exactly 15 chars
            invoice_date: "2026-11-02".into(),
            previous_due_paisa: 2500000,
            allocated_paisa: 1000000,
            remaining_due_paisa: 1500000,
            new_status: "PARTIAL".into(),
        },
        InvoiceAllocationDetailDto {
            invoice_id: 103,
            invoice_number: "INV-LONG-OVERFLOW-NUMBER-999".into(), // long (>15 chars)
            invoice_date: "2026-11-03".into(),
            previous_due_paisa: 500000,
            allocated_paisa: 500000,
            remaining_due_paisa: 0,
            new_status: "PAID".into(),
        },
    ];

    let receipt = format_recovery_receipt(
        "REC-STRESS-48",
        "2026-11-06",
        "Bismillah Super Mart",
        "Haji Muhammad Ali",
        "+92 300 9876543",
        "CASH",
        "FIFO",
        3000000,  // 30,000.00
        5000000,  // 50,000.00
        2000000,  // 20,000.00
        0,
        &test_allocations,
    );

    // 1. Verify Header line length
    let header_line = "Invoice No        Previous   Adjusted    Rem Due";
    assert_eq!(header_line.len(), 48, "Header line must be exactly 48 characters");
    assert!(receipt.contains(header_line));

    // 2. Verify all allocation rows are EXACTLY 48 characters
    let rows: Vec<&str> = receipt
        .lines()
        .filter(|l| l.starts_with("INV-"))
        .collect();
    assert_eq!(rows.len(), 3, "Must have 3 invoice breakdown rows");

    for (idx, row) in rows.iter().enumerate() {
        assert_eq!(
            row.len(),
            48,
            "Row {} ('{}') has length {} (expected exactly 48 chars)",
            idx,
            row,
            row.len()
        );
    }

    // 3. Verify truncated invoice number row (15 chars)
    let truncated_row = rows.iter().find(|l| l.starts_with("INV-LONG-OVERFL")).unwrap();
    assert_eq!(truncated_row.len(), 48);

    // 4. Verify horizontal borders are EXACTLY 48 characters
    let equals_border = "================================================";
    let dash_border = "------------------------------------------------";
    assert_eq!(equals_border.len(), 48);
    assert_eq!(dash_border.len(), 48);

    for line in receipt.lines() {
        if line.starts_with("=") {
            assert_eq!(line.len(), 48, "Border line must be 48 chars: {}", line);
        } else if line.starts_with("-") {
            assert_eq!(line.len(), 48, "Separator line must be 48 chars: {}", line);
        }
    }

    // 5. Test with advance credit remainder
    let receipt_with_advance = format_recovery_receipt(
        "REC-STRESS-ADV",
        "2026-11-06",
        "Shop A",
        "Customer A",
        "03001234567",
        "CASH",
        "FIFO",
        10000000,
        7000000,
        -3000000,
        3000000, // 30,000 advance
        &test_allocations,
    );

    assert!(receipt_with_advance.contains("Advance Credit Remainder:"));
    assert!(receipt_with_advance.contains("30000.00"));
}
