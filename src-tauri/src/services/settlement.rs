use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::domain::dtos::*;
use crate::domain::errors::AppError;

pub struct SettlementService;

impl SettlementService {
    // ========================================================================
    // 1. CALCULATE RECONCILIATION (DRY-RUN / PRE-COMMIT VERIFICATION)
    // ========================================================================
    pub fn calculate_settlement_reconciliation(
        conn: &Connection,
        sheet_id: i64,
        settlement_date: Option<&str>,
        returns: &[VanSettlementReturnItemDto],
        actual_cash_paisa: i64,
        empty_crates_returned: i32,
        route_expenses_paisa: i64,
    ) -> Result<SettlementReconciliationDto, AppError> {
        let set_date = settlement_date
            .map(|s| s.to_string())
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());

        // Fetch sheet details
        let (sheet_number, route_id, route_name, driver_id, driver_name, vehicle_no, morning_crates): (
            String, i64, String, Option<i64>, String, String, i32,
        ) = conn
            .query_row(
                "SELECT s.sheet_number, s.route_id, r.route_name, s.driver_id, s.driver_name, s.vehicle_number, s.empty_crates_loaded
                 FROM delivery_sheets s
                 JOIN delivery_routes r ON s.route_id = r.id
                 WHERE s.id = ?1",

                params![sheet_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "DeliverySheet".into(),
                id: sheet_id.to_string(),
            })?;

        // 1. Stock Reconciliation per SKU
        let mut stock_lines = Vec::new();
        let mut total_stock_variance_base: i64 = 0;
        let mut total_stock_shortage_value_paisa: i64 = 0;

        // Fetch loaded items
        let mut stmt = conn.prepare(
            "SELECT di.product_id, p.name, p.sku_code, p.units_per_pack,
                    di.loaded_packs, di.loaded_loose, di.total_loaded_base,
                    di.sold_base, p.wholesale_price_pack_paisa
             FROM delivery_items di
             JOIN products p ON di.product_id = p.id
             WHERE di.sheet_id = ?1",
        )?;

        let loaded_rows = stmt.query_map(params![sheet_id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, i64>(7)?,
                r.get::<_, i64>(8)?,
            ))
        })?;

        for row in loaded_rows {
            let (prod_id, p_name, sku, units_per_pack, l_packs, l_loose, total_loaded, mut sold_base, pack_price) = row?;

            // If sold_base is 0 on delivery_items, also check if invoices exist for this sheet
            if sold_base == 0 {
                let invoiced_units: i64 = conn
                    .query_row(
                        "SELECT COALESCE(SUM(sii.total_base_units), 0)
                         FROM sales_invoice_items sii
                         JOIN sales_invoices si ON sii.invoice_id = si.id
                         WHERE (si.delivery_sheet_id = ?1 OR si.trip_id = ?1) AND si.is_cancelled = 0 AND si.status != 'CANCELLED' AND sii.product_id = ?2",
                        params![sheet_id, prod_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                if invoiced_units > 0 {
                    sold_base = invoiced_units;
                }
            }

            // Find matching return entry
            let ret_entry = returns.iter().find(|r| r.product_id == prod_id);
            let ret_packs = ret_entry.map(|r| r.returned_packs).unwrap_or(0);
            let ret_loose = ret_entry.map(|r| r.returned_loose).unwrap_or(0);
            let breakage = ret_entry.map(|r| r.breakage_base).unwrap_or(0);
            let total_returned_base = (ret_packs * units_per_pack) + ret_loose;

            let expected_return_base = total_loaded - sold_base - breakage;
            let variance_base = total_returned_base - expected_return_base;

            total_stock_variance_base += variance_base;

            let unit_rate_paisa = if units_per_pack > 0 { pack_price / units_per_pack } else { 0 };
            let shortage_val = if variance_base < 0 {
                (-variance_base) * unit_rate_paisa
            } else {
                0
            };
            total_stock_shortage_value_paisa += shortage_val;

            let status_str = if variance_base == 0 {
                "BALANCED"
            } else if variance_base < 0 {
                "SHORTAGE"
            } else {
                "EXCESS"
            };

            stock_lines.push(StockReconciliationLineDto {
                product_id: prod_id,
                product_name: p_name,
                sku_code: sku,
                units_per_pack,
                loaded_packs: l_packs,
                loaded_loose: l_loose,
                total_loaded_base: total_loaded,
                sold_base,
                returned_packs: ret_packs,
                returned_loose: ret_loose,
                total_returned_base,
                breakage_base: breakage,
                expected_return_base,
                variance_base,
                unit_rate_paisa,
                shortage_value_paisa: shortage_val,
                status: status_str.to_string(),
            });
        }

        // 2. Financial Collections from Invoices linked to this sheet
        let (route_cash_sales, route_credit_sales, crates_issued_sum, crates_returned_sum): (i64, i64, i32, i32) = conn
            .query_row(
                "SELECT 
                    COALESCE(SUM(paid_amount_paisa), 0),
                    COALESCE(SUM(due_amount_paisa), 0),
                    COALESCE(SUM(crates_issued), 0),
                    COALESCE(SUM(crates_returned), 0)
                 FROM sales_invoices
                 WHERE (delivery_sheet_id = ?1 OR trip_id = ?1) AND is_cancelled = 0 AND status != 'CANCELLED'",
                params![sheet_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap_or((0, 0, 0, 0));

        let route_recoveries: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount_paisa), 0) FROM customer_recoveries 
                 WHERE delivery_sheet_id = ?1",
                params![sheet_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let expected_cash_paisa = route_cash_sales + route_recoveries - route_expenses_paisa;
        let cash_variance_paisa = actual_cash_paisa - expected_cash_paisa;
        let cash_variance_type = if cash_variance_paisa == 0 {
            "BALANCED"
        } else if cash_variance_paisa < 0 {
            "SHORTAGE"
        } else {
            "EXCESS"
        };

        // 3. Crate Reconciliation
        let default_deposit_paisa: i64 = conn
            .query_row("SELECT default_crate_deposit FROM app_settings WHERE id = 1", [], |r| r.get(0))
            .unwrap_or(60000);

        let expected_empty_crates = morning_crates - crates_issued_sum + crates_returned_sum;
        let crates_variance = empty_crates_returned - expected_empty_crates;
        let crate_shortage_val = if crates_variance < 0 {
            (-crates_variance as i64) * default_deposit_paisa
        } else {
            0
        };

        // Consolidated driver liability
        let cash_shortage_amount = if cash_variance_paisa < 0 { -cash_variance_paisa } else { 0 };
        let total_driver_shortage = cash_shortage_amount + total_stock_shortage_value_paisa + crate_shortage_val;
        let is_balanced = total_stock_variance_base == 0 && cash_variance_paisa == 0 && crates_variance == 0;

        Ok(SettlementReconciliationDto {
            sheet_id,
            sheet_number,
            route_id,
            route_name,
            driver_id: driver_id.unwrap_or(3),
            driver_name,
            vehicle_number: vehicle_no,
            settlement_date: set_date,
            stock_items: stock_lines,
            total_stock_variance_base,
            total_stock_shortage_value_paisa,
            route_cash_sales_paisa: route_cash_sales,
            route_credit_sales_paisa: route_credit_sales,
            route_recoveries_collected_paisa: route_recoveries,
            route_crate_deposits_collected_paisa: 0,
            route_expenses_deducted_paisa: route_expenses_paisa,
            expected_cash_paisa,
            actual_cash_paisa,
            cash_variance_paisa,
            cash_variance_type: cash_variance_type.to_string(),
            empty_crates_expected: expected_empty_crates,
            empty_crates_returned,
            crates_variance,
            crate_penalty_rate_paisa: default_deposit_paisa,
            crate_shortage_value_paisa: crate_shortage_val,
            total_driver_shortage_liability_paisa: total_driver_shortage,
            is_balanced,
        })
    }

    // ========================================================================
    // 2. SUBMIT VAN SETTLEMENT (ATOMIC DATABASE TRANSACTION EXECUTION)
    // ========================================================================
    pub fn submit_van_settlement(
        conn: &mut Connection,
        req: SubmitVanSettlementDto,
    ) -> Result<VanSettlementResultDto, AppError> {
        let user_id = req.user_id.unwrap_or(1);
        let settlement_date = req.settlement_date.clone();

        // 1. Day-Locking Guard Check
        let is_date_locked: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                params![settlement_date],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);

        if is_date_locked {
            return Err(AppError::DayLocked(format!(
                "Cannot settle van on locked accounting date {}",
                settlement_date
            )));
        }

        // 2. Verify Delivery Sheet Status & Vehicle location
        let (current_status, vehicle_id): (String, Option<i64>) = conn
            .query_row(
                "SELECT status, vehicle_id FROM delivery_sheets WHERE id = ?1",
                params![req.sheet_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "DeliverySheet".into(),
                id: req.sheet_id.to_string(),
            })?;

        if current_status == "SETTLED" || current_status == "AUDITED" {
            return Err(AppError::Validation(format!(
                "Delivery Sheet #{} is already settled (status: {})",
                req.sheet_id, current_status
            )));
        }

        // Resolve vehicle location
        let vehicle_loc_id: i64 = if let Some(v_id) = vehicle_id {
            conn.query_row(
                "SELECT stock_location_id FROM vehicles WHERE id = ?1",
                params![v_id],
                |r| r.get(0),
            )
            .optional()?
            .flatten()
            .unwrap_or(2)
        } else {
            2
        };

        // 3. Run Pre-Settlement Reconciliation Calculation
        let route_expenses = req.route_expenses_paisa.unwrap_or(0);
        let recon = Self::calculate_settlement_reconciliation(
            conn,
            req.sheet_id,
            Some(&settlement_date),
            &req.returns,
            req.actual_cash_paisa,
            req.empty_crates_returned,
            route_expenses,
        )?;

        // 4. Begin Atomic SQLite Transaction
        let tx = conn.transaction()?;

        // Step A: Update delivery_items with verified returns, breakage & variance
        for item in &recon.stock_items {
            tx.execute(
                "UPDATE delivery_items SET
                    returned_packs = ?1,
                    returned_loose = ?2,
                    total_returned_base = ?3,
                    breakage_base = ?4,
                    variance_base = ?5,
                    sold_base = ?6
                 WHERE sheet_id = ?7 AND product_id = ?8",
                params![
                    item.returned_packs,
                    item.returned_loose,
                    item.total_returned_base,
                    item.breakage_base,
                    item.variance_base,
                    item.sold_base,
                    req.sheet_id,
                    item.product_id,
                ],
            )?;

            // Restock returned good liquid units from Vehicle to Main Warehouse (Location 1)
            if item.total_returned_base > 0 {
                // Increment Master Product Inventory
                tx.execute(
                    "UPDATE products SET 
                        current_stock_base_units = current_stock_base_units + ?1,
                        stock_base_units = stock_base_units + ?1,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                     WHERE id = ?2",
                    params![item.total_returned_base, item.product_id],
                )?;

                // Increment Main Depot Warehouse balance
                tx.execute(
                    "INSERT INTO product_location_balances (product_id, location_id, balance_base_units, updated_at)
                     VALUES (?1, 1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                     ON CONFLICT(product_id, location_id) DO UPDATE SET
                        balance_base_units = balance_base_units + ?2,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                    params![item.product_id, item.total_returned_base],
                )?;

                // Decrement Vehicle location balance
                tx.execute(
                    "UPDATE product_location_balances SET
                        balance_base_units = balance_base_units - ?1,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                     WHERE product_id = ?2 AND location_id = ?3",
                    params![item.total_returned_base, item.product_id, vehicle_loc_id],
                )?;

                // Record VAN_RETURN stock movement
                let mov_code = format!("MOV-RET-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
                tx.execute(
                    "INSERT INTO stock_movements (
                        movement_code, product_id, movement_type, from_location_id, to_location_id,
                        delta_base_units, quantity_base_units, pack_qty, loose_qty,
                        unit_cost_paisa, total_cost_paisa, reference_doc_type, reference_doc_id,
                        reference_doc_number, notes, created_by
                     ) VALUES (?1, ?2, 'VAN_RETURN', ?3, 1, ?4, ?4, ?5, ?6, ?7, ?8, 'DELIVERY_SHEET', ?9, ?10, 'Van evening unsold return', ?11)",
                    params![
                        mov_code,
                        item.product_id,
                        vehicle_loc_id,
                        item.total_returned_base,
                        item.returned_packs,
                        item.returned_loose,
                        item.unit_rate_paisa,
                        item.total_returned_base * item.unit_rate_paisa,
                        req.sheet_id,
                        recon.sheet_number,
                        user_id
                    ],
                )?;
            }

            // Log Breakage if present
            if item.breakage_base > 0 {
                let breakage_cost = item.breakage_base * item.unit_rate_paisa;
                tx.execute(
                    "INSERT INTO breakage_logs (
                        log_date, product_id, broken_base_units, unit_cost_paisa,
                        total_loss_paisa, cause, incident_location, responsible_person,
                        action_taken, notes, created_by
                     ) VALUES (?1, ?2, ?3, ?4, ?5, 'Transit Road Damage', 'Van In-Transit', ?6, 'EXPENSE', 'Breakage logged at evening settlement', ?7)",
                    params![
                        settlement_date,
                        item.product_id,
                        item.breakage_base,
                        item.unit_rate_paisa,
                        breakage_cost,
                        recon.driver_name,
                        user_id
                    ],
                )?;
            }
        }

        // Step B: Restock Empty Crates to Warehouse
        if req.empty_crates_returned > 0 {
            tx.execute(
                "UPDATE products SET empty_crates_stock = empty_crates_stock + ?1 WHERE packaging_type = 'RGB_GLASS'",
                params![req.empty_crates_returned],
            )?;

            // Deduct crates from VAN_ROUTE entity balance
            tx.execute(
                "UPDATE entity_crate_balances SET
                    current_crates_balance = current_crates_balance - ?1,
                    last_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE entity_type = 'VAN_ROUTE' AND entity_id = ?2",
                params![req.empty_crates_returned, recon.route_id],
            )?;

            // Credit empties ledger for warehouse
            tx.execute(
                "INSERT INTO empties_ledger (
                    entity_type, entity_id, entry_date, voucher_type, voucher_number,
                    crates_out, crates_in, running_crates_balance, notes, created_by
                 ) VALUES ('WAREHOUSE', 1, ?1, 'VAN_SETTLEMENT', ?2, 0, ?3, 
                          (SELECT COALESCE(SUM(crates_in - crates_out), 0) + ?3 FROM empties_ledger WHERE entity_type = 'WAREHOUSE' AND entity_id = 1),
                          'Empty crates returned from route delivery', ?4)",
                params![settlement_date, recon.sheet_number, req.empty_crates_returned, user_id],
            )?;
        }

        // Step C: Route Cash Handover into Cashier Drawer (Cash Book Dr 1010)
        let mut cash_book_id = None;
        if req.actual_cash_paisa > 0 {
            let prev_cash: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let new_cash = prev_cash + req.actual_cash_paisa;

            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_id,
                    voucher_ref_number, account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'ROUTE_CASH_HANDOVER', 'DELIVERY_SHEET', ?2, ?3, 2, '1010', ?4, ?5, ?6, ?7, 0, 0, ?8, ?9, ?10)",
                params![
                    settlement_date,
                    req.sheet_id,
                    recon.sheet_number,
                    format!("Route Cash Handover - {}", recon.sheet_number),
                    format!("Driver {} route cash handed over to cashier safe", recon.driver_name),
                    req.actual_cash_paisa / 100,
                    req.actual_cash_paisa,
                    new_cash,
                    new_cash / 100,
                    user_id
                ],
            )?;
            cash_book_id = Some(tx.last_insert_rowid());
        }

        // Step D: Journal Voucher Posting
        let mut shortage_jv_id = None;
        let mut cashier_jv_id = None;

        // Cashier Handover JV: Dr 1010 Cash on Hand / Cr 1030 Driver Float
        if req.actual_cash_paisa > 0 {
            let jv_code = format!("JV-CSH-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
            tx.execute(
                "INSERT INTO journal_entries (
                    entry_number, entry_date, voucher_type, reference_doc_type,
                    reference_doc_id, narration, is_balanced, created_by
                 ) VALUES (?1, ?2, 'RECEIPT', 'DELIVERY_SHEET', ?3, ?4, 1, ?5)",
                params![
                    jv_code,
                    settlement_date,
                    req.sheet_id,
                    format!("Route Cash Handover from Driver {} for Sheet {}", recon.driver_name, recon.sheet_number),
                    user_id
                ],
            )?;
            let jv_id = tx.last_insert_rowid();

            // Dr 1010 Cash in Hand
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 2, ?2, 0, 'Cash Handover to Drawer')",
                params![jv_id, req.actual_cash_paisa],
            )?;
            // Cr 1030 Driver Floating Cash
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 4, 0, ?2, 'Clearing Driver Float')",
                params![jv_id, req.actual_cash_paisa],
            )?;

            cashier_jv_id = Some(jv_id);
        }

        // Driver Shortage Penalty JV: Dr 1250 Driver Shortage Receivables / Cr Accounts
        if recon.total_driver_shortage_liability_paisa > 0 {
            let jv_code = format!("JV-SHT-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
            let action = req.shortage_action.as_deref().unwrap_or("CHARGE_DRIVER");
            let debit_account_id = if action == "EXPENSE_WAIVER" { 38 } else { 9 }; // 38 = 6090 Expense, 9 = 1250 Receivables

            tx.execute(
                "INSERT INTO journal_entries (
                    entry_number, entry_date, voucher_type, reference_doc_type,
                    reference_doc_id, narration, is_balanced, created_by
                 ) VALUES (?1, ?2, 'MANUAL', 'DELIVERY_SHEET', ?3, ?4, 1, ?5)",
                params![
                    jv_code,
                    settlement_date,
                    req.sheet_id,
                    format!("Driver Shortage Penalty for Sheet {}: Driver {}", recon.sheet_number, recon.driver_name),
                    user_id
                ],
            )?;
            let jv_id = tx.last_insert_rowid();

            // Debit Driver Shortage Receivable (1250) or Variance Expense (6090)
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, ?2, ?3, 0, 'Shortage penalty assigned to driver')",
                params![jv_id, debit_account_id, recon.total_driver_shortage_liability_paisa],
            )?;

            // Credit Cash Float (1030) if cash was short
            let cash_short = if recon.cash_variance_paisa < 0 { -recon.cash_variance_paisa } else { 0 };
            if cash_short > 0 {
                tx.execute(
                    "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                     VALUES (?1, 4, 0, ?2, 'Uncollected Route Cash Offset')",
                    params![jv_id, cash_short],
                )?;
            }

            // Credit Liquid Inventory (1100) if stock was short
            if recon.total_stock_shortage_value_paisa > 0 {
                tx.execute(
                    "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                     VALUES (?1, 5, 0, ?2, 'Missing Liquid Stock Offset')",
                    params![jv_id, recon.total_stock_shortage_value_paisa],
                )?;
            }

            // Credit Empties Inventory (1110) if crates were missing
            if recon.crate_shortage_value_paisa > 0 {
                tx.execute(
                    "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                     VALUES (?1, 6, 0, ?2, 'Missing Empty Crates Offset')",
                    params![jv_id, recon.crate_shortage_value_paisa],
                )?;
            }

            shortage_jv_id = Some(jv_id);
        }

        // Step E: Update delivery_sheets Header Status to SETTLED
        let now_iso = Utc::now().to_rfc3339();
        tx.execute(
            "UPDATE delivery_sheets SET
                status = 'SETTLED',
                returned_at = ?1,
                closing_km = ?2,
                expected_cash_paisa = ?3,
                actual_cash_paisa = ?4,
                cash_variance_paisa = ?5,
                empty_crates_returned = ?6,
                crates_variance = ?7,
                total_credit_sales_paisa = ?8,
                total_recoveries_paisa = ?9,
                total_route_expenses_paisa = ?10,
                shortage_journal_entry_id = ?11,
                cash_book_entry_id = ?12,
                settlement_notes = ?13,
                settled_by = ?14,
                updated_at = ?1
             WHERE id = ?15",
            params![
                now_iso,
                req.closing_km,
                recon.expected_cash_paisa,
                req.actual_cash_paisa,
                recon.cash_variance_paisa,
                req.empty_crates_returned,
                recon.crates_variance,
                recon.route_credit_sales_paisa,
                recon.route_recoveries_collected_paisa,
                route_expenses,
                shortage_jv_id,
                cash_book_id,
                req.settlement_notes,
                user_id,
                req.sheet_id,
            ],
        )?;

        // Update compatibility delivery_trips
        let _ = tx.execute(
            "UPDATE delivery_trips SET status = 'SETTLED', returned_at = ?1, closing_km = ?2 WHERE id = ?3 OR trip_code = (SELECT trip_code FROM delivery_sheets WHERE id = ?3)",
            params![now_iso, req.closing_km, req.sheet_id],
        );

        // Record in trip_settlements table (E2E compatibility)
        let _ = tx.execute(
            "INSERT INTO trip_settlements (
                trip_id, sheet_id, settlement_date, total_cash_sales_paisa, total_cash_sales,
                total_credit_sales_paisa, total_credit_sales, total_udhaar_recoveries_paisa, total_udhaar_recoveries,
                total_route_expenses_paisa, total_route_expenses, expected_cash_paisa, expected_cash_deposit,
                actual_cash_paisa, actual_cash_handed_over, cash_variance_paisa, cash_variance,
                driver_shortage_action, empty_crates_expected, empty_crates_returned, crates_variance,
                settled_by, journal_entry_id
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)",
            params![
                req.sheet_id,
                req.sheet_id,
                settlement_date,
                recon.route_cash_sales_paisa,
                recon.route_cash_sales_paisa as f64 / 100.0,
                recon.route_credit_sales_paisa,
                recon.route_credit_sales_paisa as f64 / 100.0,
                recon.route_recoveries_collected_paisa,
                recon.route_recoveries_collected_paisa as f64 / 100.0,
                route_expenses,
                route_expenses as f64 / 100.0,
                recon.expected_cash_paisa,
                recon.expected_cash_paisa as f64 / 100.0,
                req.actual_cash_paisa,
                req.actual_cash_paisa as f64 / 100.0,
                recon.cash_variance_paisa,
                recon.cash_variance_paisa as f64 / 100.0,
                req.shortage_action.as_deref().unwrap_or("CHARGE_DRIVER"),
                recon.empty_crates_expected,
                req.empty_crates_returned,
                recon.crates_variance,
                user_id,
                shortage_jv_id
            ],
        );

        // Audit Trail Entry
        let _ = tx.execute(
            "INSERT INTO audit_logs (
                user_id, username, action, entity_type, entity_id, reason, ip_address
             ) VALUES (?1, 'system', 'VAN_SETTLEMENT_SUBMITTED', 'delivery_sheets', ?2, ?3, '127.0.0.1')",
            params![
                user_id,
                req.sheet_id.to_string(),
                format!("Settled sheet {} with cash handover {} and variance {}", recon.sheet_number, req.actual_cash_paisa, recon.cash_variance_paisa),
            ],
        );

        // Step F: Commit Transaction Atomically
        tx.commit()?;

        Ok(VanSettlementResultDto {
            sheet_id: req.sheet_id,
            sheet_number: recon.sheet_number,
            settlement_id: req.sheet_id,
            status: "SETTLED".to_string(),
            settled_at: now_iso,
            cash_book_entry_id: cash_book_id,
            shortage_journal_entry_id: shortage_jv_id,
            cashier_journal_entry_id: cashier_jv_id,
            restocked_items_count: recon.stock_items.len(),
            empty_crates_restocked: req.empty_crates_returned,
            cash_variance_paisa: recon.cash_variance_paisa,
            total_stock_variance_base: recon.total_stock_variance_base,
            total_shortage_paisa: recon.total_driver_shortage_liability_paisa,
        })
    }

    // ========================================================================
    // 3. GET SETTLEMENT SUMMARY (REPORTING & REPRINTING)
    // ========================================================================
    pub fn get_settlement_summary(
        conn: &Connection,
        sheet_id: i64,
    ) -> Result<SettlementReconciliationDto, AppError> {
        let (settlement_date, actual_cash, empty_crates, route_expenses): (String, i64, i32, i64) = conn
            .query_row(
                "SELECT sheet_date, actual_cash_paisa, empty_crates_returned, total_route_expenses_paisa
                 FROM delivery_sheets WHERE id = ?1",
                params![sheet_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "DeliverySheet".into(),
                id: sheet_id.to_string(),
            })?;

        let mut stmt = conn.prepare(
            "SELECT product_id, returned_packs, returned_loose, breakage_base FROM delivery_items WHERE sheet_id = ?1",
        )?;
        let returns: Vec<VanSettlementReturnItemDto> = stmt
            .query_map(params![sheet_id], |r| {
                Ok(VanSettlementReturnItemDto {
                    product_id: r.get(0)?,
                    returned_packs: r.get(1)?,
                    returned_loose: r.get(2)?,
                    breakage_base: r.get(3)?,
                    notes: None,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Self::calculate_settlement_reconciliation(
            conn,
            sheet_id,
            Some(&settlement_date),
            &returns,
            actual_cash,
            empty_crates,
            route_expenses,
        )
    }
}
