use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordBreakageDto {
    pub product_id: i64,
    pub broken_base_units: i64,
    pub cause: String,
    pub incident_location: String,
    pub responsible_person: Option<String>,
    pub action_taken: String, // "EXPENSE", "STAFF_RECOVERY", "COMPANY_CLAIM"
    pub notes: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakageResult {
    pub log_id: i64,
    pub product_id: i64,
    pub broken_base_units: i64,
    pub unit_cost_paisa: i64,
    pub total_loss_paisa: i64,
    pub remaining_stock_base_units: i64,
    pub action_taken: String,
    pub journal_entry_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakageLogDto {
    pub id: i64,
    pub log_date: String,
    pub product_id: i64,
    pub product_name: String,
    pub broken_base_units: i64,
    pub unit_cost_paisa: i64,
    pub total_loss_paisa: i64,
    pub cause: String,
    pub incident_location: String,
    pub responsible_person: Option<String>,
    pub action_taken: String,
    pub notes: Option<String>,
    pub created_at: String,
}

pub struct BreakageService;

impl BreakageService {
    pub fn record_breakage(
        conn: &mut Connection,
        req: RecordBreakageDto,
    ) -> Result<BreakageResult, AppError> {
        if req.broken_base_units <= 0 {
            return Err(AppError::Validation(
                "Broken base units must be positive".to_string(),
            ));
        }

        let entry_date = Utc::now().format("%Y-%m-%d").to_string();

        let tx = conn.transaction()?;

        // 1. Fetch product stock and landed cost
        let (name, units_per_pack, purchase_price_pack_paisa, current_stock_base_units): (
            String,
            i64,
            i64,
            i64,
        ) = tx
            .query_row(
                "SELECT name, units_per_pack, purchase_price_pack_paisa, current_stock_base_units 
                 FROM products WHERE id = ?1",
                params![req.product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Product".to_string(),
                id: req.product_id.to_string(),
            })?;

        // 2. Validate sufficient stock
        if current_stock_base_units < req.broken_base_units {
            return Err(AppError::InsufficientStock {
                product_id: req.product_id,
                requested_base: req.broken_base_units,
                available_base: current_stock_base_units,
            });
        }

        let unit_cost_paisa = if units_per_pack > 0 {
            purchase_price_pack_paisa / units_per_pack
        } else {
            0
        };
        let total_loss_paisa = req.broken_base_units * unit_cost_paisa;
        let remaining_stock_base_units = current_stock_base_units - req.broken_base_units;

        // 3. Atomically decrement stock from product
        tx.execute(
            "UPDATE products SET 
                current_stock_base_units = ?1,
                stock_base_units = ?1,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?2",
            params![remaining_stock_base_units, req.product_id],
        )?;

        // 4. Record immutable stock movement
        let movement_code = format!("MOV-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
        let pack_qty = if units_per_pack > 0 { req.broken_base_units / units_per_pack } else { 0 };
        let loose_qty = if units_per_pack > 0 { req.broken_base_units % units_per_pack } else { 0 };

        tx.execute(
            "INSERT INTO stock_movements (
                movement_code, product_id, movement_type, from_location_id, to_location_id,
                delta_base_units, quantity_base_units, pack_qty, loose_qty, unit_cost_paisa, total_cost_paisa,
                previous_stock_base_units, new_stock_base_units, reference_type, reference_doc_type,
                notes, created_by
             ) VALUES (?1, ?2, 'BREAKAGE', 1, 5, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'BREAKAGE', 'BREAKAGE', ?11, ?12)",
            params![
                movement_code,
                req.product_id,
                -req.broken_base_units,
                req.broken_base_units,
                pack_qty,
                loose_qty,
                unit_cost_paisa,
                total_loss_paisa,
                current_stock_base_units,
                remaining_stock_base_units,
                req.notes,
                req.user_id
            ],
        )?;

        // 5. Post double-entry journal voucher
        let je_num = format!("JE-BRK-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
        tx.execute(
            "INSERT INTO journal_entries (entry_number, entry_date, voucher_type, reference_doc_type, narration, is_balanced, created_by)
             VALUES (?1, ?2, 'EXPENSE', 'BREAKAGE', ?3, 1, ?4)",
            params![
                je_num,
                entry_date,
                format!("Breakage write-off: {} units of {}", req.broken_base_units, name),
                req.user_id
            ],
        )?;
        let je_id = tx.last_insert_rowid();

        // Target debit account: 6050 (Acct ID 34) for EXPENSE, 1250 (Acct ID 9) for STAFF_RECOVERY, 1150 (Acct ID 7) for COMPANY_CLAIM
        let debit_account_id: i64 = match req.action_taken.as_str() {
            "EXPENSE" => 34,
            "STAFF_RECOVERY" => 9,
            "COMPANY_CLAIM" => 7,
            _ => 34,
        };

        // Line 1: Debit loss/expense or receivable account
        tx.execute(
            "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
             VALUES (?1, ?2, ?3, 0, ?4)",
            params![
                je_id,
                debit_account_id,
                total_loss_paisa,
                format!("Breakage loss allocation ({})", req.action_taken)
            ],
        )?;

        // Line 2: Credit 1100 Inventory - Liquid Beverages (Acct ID 5)
        tx.execute(
            "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
             VALUES (?1, 5, 0, ?2, 'Inventory stock write-off')",
            params![je_id, total_loss_paisa],
        )?;

        // 6. Record in breakage_logs table
        tx.execute(
            "INSERT INTO breakage_logs (
                log_date, product_id, broken_base_units, unit_cost, unit_cost_paisa,
                total_loss_amount, total_loss_paisa, cause, incident_location,
                responsible_person, action_taken, notes, journal_entry_id, created_by
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                entry_date,
                req.product_id,
                req.broken_base_units,
                (unit_cost_paisa as f64) / 100.0,
                unit_cost_paisa,
                (total_loss_paisa as f64) / 100.0,
                total_loss_paisa,
                req.cause,
                req.incident_location,
                req.responsible_person,
                req.action_taken,
                req.notes,
                je_id,
                req.user_id
            ],
        )?;
        let log_id = tx.last_insert_rowid();

        tx.commit()?;

        Ok(BreakageResult {
            log_id,
            product_id: req.product_id,
            broken_base_units: req.broken_base_units,
            unit_cost_paisa,
            total_loss_paisa,
            remaining_stock_base_units,
            action_taken: req.action_taken,
            journal_entry_id: Some(je_id),
        })
    }

    pub fn get_breakage_logs(
        conn: &Connection,
        product_id: Option<i64>,
        limit: usize,
    ) -> Result<Vec<BreakageLogDto>, AppError> {
        let mut sql = "SELECT b.id, b.log_date, b.product_id, p.name, b.broken_base_units,
                              b.unit_cost_paisa, b.total_loss_paisa, b.cause, b.incident_location,
                              b.responsible_person, b.action_taken, b.notes, b.created_at
                       FROM breakage_logs b
                       JOIN products p ON p.id = b.product_id ".to_string();

        if product_id.is_some() {
            sql.push_str("WHERE b.product_id = ?1 ");
        }
        sql.push_str("ORDER BY b.id DESC LIMIT ?2");

        let mut stmt = conn.prepare(&sql)?;

        let mut result = Vec::new();
        if let Some(pid) = product_id {
            let rows = stmt.query_map(params![pid, limit as i64], |row| {
                Ok(BreakageLogDto {
                    id: row.get(0)?,
                    log_date: row.get(1)?,
                    product_id: row.get(2)?,
                    product_name: row.get(3)?,
                    broken_base_units: row.get(4)?,
                    unit_cost_paisa: row.get(5)?,
                    total_loss_paisa: row.get(6)?,
                    cause: row.get(7)?,
                    incident_location: row.get(8)?,
                    responsible_person: row.get(9)?,
                    action_taken: row.get(10)?,
                    notes: row.get(11)?,
                    created_at: row.get(12)?,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        } else {
            let rows = stmt.query_map(params![rusqlite::types::Null, limit as i64], |row| {
                Ok(BreakageLogDto {
                    id: row.get(0)?,
                    log_date: row.get(1)?,
                    product_id: row.get(2)?,
                    product_name: row.get(3)?,
                    broken_base_units: row.get(4)?,
                    unit_cost_paisa: row.get(5)?,
                    total_loss_paisa: row.get(6)?,
                    cause: row.get(7)?,
                    incident_location: row.get(8)?,
                    responsible_person: row.get(9)?,
                    action_taken: row.get(10)?,
                    notes: row.get(11)?,
                    created_at: row.get(12)?,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        }

        Ok(result)
    }
}
