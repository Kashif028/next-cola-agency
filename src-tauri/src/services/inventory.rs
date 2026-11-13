use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::errors::AppError;

pub use crate::services::breakage::{BreakageLogDto, BreakageResult, BreakageService, RecordBreakageDto};
pub use crate::services::crates::{
    CrateService, CrateTransactionResult, CustomerCrateLedgerDto, EmptiesOverviewDto,
    RecordCrateTransactionDto, RecordSecurityDepositDto, RefundSecurityDepositDto,
    SecurityDepositResult,
};

// ============================================================================
// PACKAGING CONVERSION DTOs
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvertPackToBaseDto {
    pub product_id: i64,
    pub pack_qty: i64,
    pub loose_qty: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvertPackToBaseResult {
    pub product_id: i64,
    pub pack_qty: i64,
    pub loose_qty: i64,
    pub units_per_pack: i64,
    pub total_base_units: i64,
    pub formula_applied: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvertBaseToPackDto {
    pub product_id: i64,
    pub base_units: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvertBaseToPackResult {
    pub product_id: i64,
    pub base_units: i64,
    pub packs: i64,
    pub loose: i64,
    pub pack_unit_name: String,
    pub base_unit_name: String,
    pub display_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackagingUnitDto {
    pub id: i64,
    pub product_id: i64,
    pub unit_name: String,
    pub multiplier_to_base: i64,
    pub is_base_unit: bool,
    pub is_default_purchase_unit: bool,
    pub is_default_sale_unit: bool,
    pub barcode: Option<String>,
}

// ============================================================================
// STOCK OVERVIEW & ADJUSTMENT DTOs
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StockFilterDto {
    pub brand: Option<String>,
    pub packaging_type: Option<String>,
    pub is_glass: Option<bool>,
    pub low_stock_only: Option<bool>,
    pub search_query: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockItemOverviewDto {
    pub id: i64,
    pub sku_code: String,
    pub name: String,
    pub brand: String,
    pub flavor: Option<String>,
    pub volume_ml: Option<i64>,
    pub packaging_type: String,
    pub is_glass: bool,
    pub requires_crate: bool,
    pub base_unit_name: String,
    pub pack_unit_name: String,
    pub units_per_pack: i64,
    pub purchase_price_pack_paisa: i64,
    pub wholesale_price_pack_paisa: i64,
    pub retail_price_pack_paisa: i64,
    pub retail_price_base_paisa: i64,
    pub crate_deposit_paisa: i64,
    pub current_stock_base_units: i64,
    pub stock_in_packs: i64,
    pub stock_loose_units: i64,
    pub empty_bottles_stock: i64,
    pub empty_crates_stock: i64,
    pub min_reorder_level_packs: i64,
    pub is_low_stock: bool,
    pub inventory_valuation_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdjustStockDto {
    pub product_id: i64,
    pub delta_base_units: i64,
    pub reason: String,
    pub notes: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockAdjustmentResult {
    pub product_id: i64,
    pub previous_stock_base_units: i64,
    pub new_stock_base_units: i64,
    pub delta_base_units: i64,
    pub adjusted_at: DateTime<Utc>,
}

// ============================================================================
// PURE CONVERSION MATHEMATICS (Zero-Drift Integers)
// ============================================================================

pub fn pack_to_base_math(
    units_per_pack: i64,
    pack_qty: i64,
    loose_qty: i64,
) -> Result<i64, AppError> {
    if units_per_pack <= 0 {
        return Err(AppError::Validation(format!(
            "Invalid units_per_pack: must be > 0, got {}",
            units_per_pack
        )));
    }
    if pack_qty < 0 || loose_qty < 0 {
        return Err(AppError::Validation(
            "Quantities cannot be negative".to_string(),
        ));
    }

    let pack_base = pack_qty
        .checked_mul(units_per_pack)
        .ok_or_else(|| AppError::Validation("Arithmetic overflow in pack conversion".into()))?;

    let total = pack_base
        .checked_add(loose_qty)
        .ok_or_else(|| AppError::Validation("Arithmetic overflow in total units".into()))?;

    Ok(total)
}

pub fn base_to_pack_math(
    units_per_pack: i64,
    base_units: i64,
    pack_name: &str,
    base_name: &str,
) -> Result<(i64, i64, String), AppError> {
    if units_per_pack <= 0 {
        return Err(AppError::Validation(format!(
            "Invalid units_per_pack: must be > 0, got {}",
            units_per_pack
        )));
    }
    if base_units < 0 {
        return Err(AppError::Validation(
            "Base units cannot be negative".to_string(),
        ));
    }

    let packs = base_units / units_per_pack;
    let loose = base_units % units_per_pack;

    let display_text = format!("{} {}s, {} {}s", packs, pack_name, loose, base_name);

    Ok((packs, loose, display_text))
}

// ============================================================================
// UNIFIED INVENTORY SERVICE
// ============================================================================

pub struct InventoryService;

impl InventoryService {
    pub fn convert_pack_to_base(
        conn: &Connection,
        product_id: i64,
        pack_qty: i64,
        loose_qty: i64,
    ) -> Result<ConvertPackToBaseResult, AppError> {
        let (units_per_pack, base_unit_name): (i64, String) = conn
            .query_row(
                "SELECT units_per_pack, base_unit_name FROM products WHERE id = ?1",
                params![product_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Product".to_string(),
                id: product_id.to_string(),
            })?;

        let total_base_units = pack_to_base_math(units_per_pack, pack_qty, loose_qty)?;
        let formula_applied = format!(
            "({} × {}) + {} = {} {}",
            pack_qty, units_per_pack, loose_qty, total_base_units, base_unit_name
        );

        Ok(ConvertPackToBaseResult {
            product_id,
            pack_qty,
            loose_qty,
            units_per_pack,
            total_base_units,
            formula_applied,
        })
    }

    pub fn convert_base_to_pack(
        conn: &Connection,
        product_id: i64,
        base_units: i64,
    ) -> Result<ConvertBaseToPackResult, AppError> {
        let (units_per_pack, pack_unit_name, base_unit_name): (i64, String, String) = conn
            .query_row(
                "SELECT units_per_pack, pack_unit_name, base_unit_name FROM products WHERE id = ?1",
                params![product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Product".to_string(),
                id: product_id.to_string(),
            })?;

        let (packs, loose, display_text) =
            base_to_pack_math(units_per_pack, base_units, &pack_unit_name, &base_unit_name)?;

        Ok(ConvertBaseToPackResult {
            product_id,
            base_units,
            packs,
            loose,
            pack_unit_name,
            base_unit_name,
            display_text,
        })
    }

    pub fn get_packaging_units(
        conn: &Connection,
        product_id: i64,
    ) -> Result<Vec<PackagingUnitDto>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, product_id, unit_name, multiplier_to_base, is_base_unit, 
                    is_default_purchase_unit, is_default_sale_unit, barcode
             FROM packaging_units 
             WHERE product_id = ?1 
             ORDER BY multiplier_to_base DESC",
        )?;

        let rows = stmt.query_map(params![product_id], |row| {
            Ok(PackagingUnitDto {
                id: row.get(0)?,
                product_id: row.get(1)?,
                unit_name: row.get(2)?,
                multiplier_to_base: row.get(3)?,
                is_base_unit: row.get::<_, i32>(4)? == 1,
                is_default_purchase_unit: row.get::<_, i32>(5)? == 1,
                is_default_sale_unit: row.get::<_, i32>(6)? == 1,
                barcode: row.get(7)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_stock_overview(
        conn: &Connection,
        filter: StockFilterDto,
    ) -> Result<Vec<StockItemOverviewDto>, AppError> {
        let mut sql = "SELECT id, sku_code, name, brand, flavor, volume_ml, packaging_type,
                              is_glass, requires_crate, base_unit_name, pack_unit_name,
                              units_per_pack, purchase_price_pack_paisa, wholesale_price_pack_paisa,
                              retail_price_pack_paisa, retail_price_base_paisa, crate_deposit_paisa,
                              current_stock_base_units, empty_bottles_stock, empty_crates_stock,
                              min_reorder_level_packs
                       FROM products
                       WHERE is_active = 1 ".to_string();

        if let Some(ref brand) = filter.brand {
            if !brand.is_empty() {
                sql.push_str(&format!("AND brand = '{}' ", brand.replace('\'', "''")));
            }
        }

        if let Some(ref pkg) = filter.packaging_type {
            if !pkg.is_empty() {
                sql.push_str(&format!("AND packaging_type = '{}' ", pkg.replace('\'', "''")));
            }
        }

        if let Some(glass) = filter.is_glass {
            sql.push_str(&format!("AND is_glass = {} ", if glass { 1 } else { 0 }));
        }

        if let Some(ref q) = filter.search_query {
            if !q.is_empty() {
                let sanitized = q.replace('\'', "''");
                sql.push_str(&format!(
                    "AND (name LIKE '%{}%' OR sku_code LIKE '%{}%' OR flavor LIKE '%{}%') ",
                    sanitized, sanitized, sanitized
                ));
            }
        }

        sql.push_str("ORDER BY id ASC");

        let mut stmt = conn.prepare(&sql)?;

        let rows = stmt.query_map([], |row| {
            let id: i64 = row.get(0)?;
            let sku_code: String = row.get(1)?;
            let name: String = row.get(2)?;
            let brand: String = row.get(3)?;
            let flavor: Option<String> = row.get(4)?;
            let volume_ml: Option<i64> = row.get(5)?;
            let packaging_type: String = row.get(6)?;
            let is_glass: bool = row.get::<_, i32>(7)? == 1;
            let requires_crate: bool = row.get::<_, i32>(8)? == 1;
            let base_unit_name: String = row.get(9)?;
            let pack_unit_name: String = row.get(10)?;
            let units_per_pack: i64 = row.get(11)?;
            let purchase_price_pack_paisa: i64 = row.get(12)?;
            let wholesale_price_pack_paisa: i64 = row.get(13)?;
            let retail_price_pack_paisa: i64 = row.get(14)?;
            let retail_price_base_paisa: i64 = row.get(15)?;
            let crate_deposit_paisa: i64 = row.get(16)?;
            let current_stock_base_units: i64 = row.get(17)?;
            let empty_bottles_stock: i64 = row.get(18)?;
            let empty_crates_stock: i64 = row.get(19)?;
            let min_reorder_level_packs: i64 = row.get(20)?;

            let stock_in_packs = if units_per_pack > 0 {
                current_stock_base_units / units_per_pack
            } else {
                0
            };
            let stock_loose_units = if units_per_pack > 0 {
                current_stock_base_units % units_per_pack
            } else {
                0
            };
            let is_low_stock = stock_in_packs < min_reorder_level_packs;

            let unit_cost = if units_per_pack > 0 {
                purchase_price_pack_paisa / units_per_pack
            } else {
                0
            };
            let inventory_valuation_paisa = current_stock_base_units * unit_cost;

            Ok(StockItemOverviewDto {
                id,
                sku_code,
                name,
                brand,
                flavor,
                volume_ml,
                packaging_type,
                is_glass,
                requires_crate,
                base_unit_name,
                pack_unit_name,
                units_per_pack,
                purchase_price_pack_paisa,
                wholesale_price_pack_paisa,
                retail_price_pack_paisa,
                retail_price_base_paisa,
                crate_deposit_paisa,
                current_stock_base_units,
                stock_in_packs,
                stock_loose_units,
                empty_bottles_stock,
                empty_crates_stock,
                min_reorder_level_packs,
                is_low_stock,
                inventory_valuation_paisa,
            })
        })?;

        let mut items = Vec::new();
        for r in rows {
            let item = r?;
            if filter.low_stock_only.unwrap_or(false) && !item.is_low_stock {
                continue;
            }
            items.push(item);
        }

        Ok(items)
    }

    pub fn adjust_stock(
        conn: &mut Connection,
        req: AdjustStockDto,
    ) -> Result<StockAdjustmentResult, AppError> {
        let tx = conn.transaction()?;

        let (previous_stock_base_units, units_per_pack): (i64, i64) = tx
            .query_row(
                "SELECT current_stock_base_units, units_per_pack FROM products WHERE id = ?1",
                params![req.product_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Product".to_string(),
                id: req.product_id.to_string(),
            })?;

        let new_stock_base_units = previous_stock_base_units + req.delta_base_units;
        if new_stock_base_units < 0 {
            return Err(AppError::InsufficientStock {
                product_id: req.product_id,
                requested_base: -req.delta_base_units,
                available_base: previous_stock_base_units,
            });
        }

        // 1. Update product table
        tx.execute(
            "UPDATE products SET 
                current_stock_base_units = ?1, 
                stock_base_units = ?1, 
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') 
             WHERE id = ?2",
            params![new_stock_base_units, req.product_id],
        )?;

        // 2. Synchronize main warehouse location balance (location_id = 1)
        tx.execute(
            "INSERT INTO product_location_balances (product_id, location_id, balance_base_units, updated_at)
             VALUES (?1, 1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ON CONFLICT(product_id, location_id) DO UPDATE SET
                balance_base_units = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
            params![req.product_id, new_stock_base_units],
        )?;

        // 3. Record immutable stock movement
        let movement_code = format!("MOV-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
        let abs_delta = req.delta_base_units.abs();
        let pack_qty = if units_per_pack > 0 { abs_delta / units_per_pack } else { 0 };
        let loose_qty = if units_per_pack > 0 { abs_delta % units_per_pack } else { 0 };

        tx.execute(
            "INSERT INTO stock_movements (
                movement_code, product_id, movement_type, delta_base_units, quantity_base_units,
                pack_qty, loose_qty, previous_stock_base_units, new_stock_base_units,
                reference_type, notes, created_by
             ) VALUES (?1, ?2, 'MANUAL_ADJUSTMENT', ?3, ?4, ?5, ?6, ?7, ?8, 'AUDIT_ADJUSTMENT', ?9, ?10)",
            params![
                movement_code,
                req.product_id,
                req.delta_base_units,
                abs_delta,
                pack_qty,
                loose_qty,
                previous_stock_base_units,
                new_stock_base_units,
                format!("{}: {}", req.reason, req.notes.unwrap_or_default()),
                req.user_id
            ],
        )?;

        tx.commit()?;

        Ok(StockAdjustmentResult {
            product_id: req.product_id,
            previous_stock_base_units,
            new_stock_base_units,
            delta_base_units: req.delta_base_units,
            adjusted_at: Utc::now(),
        })
    }

    // Delegation to CrateService
    pub fn get_empties_overview(conn: &Connection) -> Result<EmptiesOverviewDto, AppError> {
        CrateService::get_empties_overview(conn)
    }

    pub fn record_crate_transaction(
        conn: &mut Connection,
        req: RecordCrateTransactionDto,
    ) -> Result<CrateTransactionResult, AppError> {
        CrateService::record_crate_transaction(conn, req)
    }

    pub fn get_customer_crate_ledger(
        conn: &Connection,
        customer_id: i64,
        limit: usize,
    ) -> Result<Vec<CustomerCrateLedgerDto>, AppError> {
        CrateService::get_customer_crate_ledger(conn, customer_id, limit)
    }

    pub fn record_security_deposit(
        conn: &mut Connection,
        req: RecordSecurityDepositDto,
    ) -> Result<SecurityDepositResult, AppError> {
        CrateService::record_security_deposit(conn, req)
    }

    pub fn refund_security_deposit(
        conn: &mut Connection,
        req: RefundSecurityDepositDto,
    ) -> Result<SecurityDepositResult, AppError> {
        CrateService::refund_security_deposit(conn, req)
    }

    // Delegation to BreakageService
    pub fn record_breakage(
        conn: &mut Connection,
        req: RecordBreakageDto,
    ) -> Result<BreakageResult, AppError> {
        BreakageService::record_breakage(conn, req)
    }

    pub fn get_breakage_logs(
        conn: &Connection,
        product_id: Option<i64>,
        limit: usize,
    ) -> Result<Vec<BreakageLogDto>, AppError> {
        BreakageService::get_breakage_logs(conn, product_id, limit)
    }
}
