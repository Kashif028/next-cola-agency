use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::domain::dtos::*;
use crate::domain::errors::AppError;
use crate::services::inventory::pack_to_base_math;

pub struct LogisticsService;

impl LogisticsService {
    // ------------------------------------------------------------------------
    // 1. ROUTE MANAGEMENT
    // ------------------------------------------------------------------------

    pub fn create_route(conn: &Connection, req: CreateRouteDto) -> Result<RouteDto, AppError> {
        let code = req.route_code.trim();
        let name = req.route_name.trim();

        if code.is_empty() || name.is_empty() {
            return Err(AppError::Validation("Route code and name are required".into()));
        }

        conn.execute(
            "INSERT INTO delivery_routes (
                route_code, route_name, description, default_driver_id,
                default_vehicle_id, default_vehicle_no, start_time, target_daily_sales_paisa
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                code,
                name,
                req.description,
                req.default_driver_id,
                req.default_vehicle_id,
                req.default_vehicle_no,
                req.start_time.unwrap_or_else(|| "08:00".into()),
                req.target_daily_sales_paisa.unwrap_or(0),
            ],
        )?;

        let id = conn.last_insert_rowid();
        Self::get_route_by_id(conn, id)
    }

    pub fn list_routes(conn: &Connection, active_only: bool) -> Result<Vec<RouteDto>, AppError> {
        let sql = format!(
            "SELECT r.id, r.route_code, r.route_name, r.description,
                    r.default_driver_id, u.full_name, r.default_vehicle_id,
                    COALESCE(v.vehicle_number, r.default_vehicle_no),
                    r.start_time, r.target_daily_sales_paisa,
                    (SELECT COUNT(*) FROM customers c WHERE c.route_id = r.id AND c.is_active = 1) AS customer_count,
                    r.is_active, r.created_at, r.updated_at
             FROM delivery_routes r
             LEFT JOIN users u ON r.default_driver_id = u.id
             LEFT JOIN vehicles v ON r.default_vehicle_id = v.id
             {}
             ORDER BY r.id ASC",
            if active_only { "WHERE r.is_active = 1" } else { "" }
        );

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            Ok(RouteDto {
                id: row.get(0)?,
                route_code: row.get(1)?,
                route_name: row.get(2)?,
                description: row.get(3)?,
                default_driver_id: row.get(4)?,
                default_driver_name: row.get(5)?,
                default_vehicle_id: row.get(6)?,
                default_vehicle_no: row.get(7)?,
                start_time: row.get(8)?,
                target_daily_sales_paisa: row.get(9)?,
                customer_count: row.get(10)?,
                is_active: row.get::<_, i32>(11)? == 1,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_route_by_id(conn: &Connection, route_id: i64) -> Result<RouteDto, AppError> {
        conn.query_row(
            "SELECT r.id, r.route_code, r.route_name, r.description,
                    r.default_driver_id, u.full_name, r.default_vehicle_id,
                    COALESCE(v.vehicle_number, r.default_vehicle_no),
                    r.start_time, r.target_daily_sales_paisa,
                    (SELECT COUNT(*) FROM customers c WHERE c.route_id = r.id AND c.is_active = 1),
                    r.is_active, r.created_at, r.updated_at
             FROM delivery_routes r
             LEFT JOIN users u ON r.default_driver_id = u.id
             LEFT JOIN vehicles v ON r.default_vehicle_id = v.id
             WHERE r.id = ?1",
            params![route_id],
            |row| {
                Ok(RouteDto {
                    id: row.get(0)?,
                    route_code: row.get(1)?,
                    route_name: row.get(2)?,
                    description: row.get(3)?,
                    default_driver_id: row.get(4)?,
                    default_driver_name: row.get(5)?,
                    default_vehicle_id: row.get(6)?,
                    default_vehicle_no: row.get(7)?,
                    start_time: row.get(8)?,
                    target_daily_sales_paisa: row.get(9)?,
                    customer_count: row.get(10)?,
                    is_active: row.get::<_, i32>(11)? == 1,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound {
            entity: "DeliveryRoute".into(),
            id: route_id.to_string(),
        })
    }

    pub fn update_route(
        conn: &Connection,
        route_id: i64,
        req: UpdateRouteDto,
    ) -> Result<RouteDto, AppError> {
        let name = req.route_name.trim();
        if name.is_empty() {
            return Err(AppError::Validation("Route name cannot be empty".into()));
        }

        conn.execute(
            "UPDATE delivery_routes SET
                route_name = ?1,
                description = ?2,
                default_driver_id = ?3,
                default_vehicle_id = ?4,
                default_vehicle_no = ?5,
                start_time = ?6,
                target_daily_sales_paisa = ?7,
                is_active = ?8,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?9",
            params![
                name,
                req.description,
                req.default_driver_id,
                req.default_vehicle_id,
                req.default_vehicle_no,
                req.start_time.unwrap_or_else(|| "08:00".into()),
                req.target_daily_sales_paisa.unwrap_or(0),
                if req.is_active { 1 } else { 0 },
                route_id
            ],
        )?;

        Self::get_route_by_id(conn, route_id)
    }

    // ------------------------------------------------------------------------
    // 2. VEHICLE MANAGEMENT
    // ------------------------------------------------------------------------

    pub fn create_vehicle(
        conn: &mut Connection,
        req: CreateVehicleDto,
    ) -> Result<VehicleDto, AppError> {
        let num = req.vehicle_number.trim().to_uppercase();
        let model = req.model.trim();

        if num.is_empty() || model.is_empty() {
            return Err(AppError::Validation("Vehicle number and model are required".into()));
        }
        if req.capacity_crates <= 0 {
            return Err(AppError::Validation("Vehicle capacity must be greater than zero".into()));
        }

        let tx = conn.transaction()?;

        // 1. Create or get stock location for this vehicle
        let loc_code = format!("LOC-VAN-{}", num.replace('-', "").replace(' ', ""));
        let loc_name = format!("Delivery Van {}", num);

        tx.execute(
            "INSERT INTO stock_locations (code, name, location_type, is_active)
             VALUES (?1, ?2, 'VEHICLE', 1)
             ON CONFLICT(code) DO NOTHING",
            params![loc_code, loc_name],
        )?;

        let stock_loc_id: i64 = tx.query_row(
            "SELECT id FROM stock_locations WHERE code = ?1",
            params![loc_code],
            |r| r.get(0),
        )?;

        // 2. Insert vehicle record
        tx.execute(
            "INSERT INTO vehicles (
                vehicle_number, model, capacity_crates, capacity_weight_kg,
                default_driver_id, driver_id, stock_location_id, notes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7)",
            params![
                num,
                model,
                req.capacity_crates,
                req.capacity_weight_kg,
                req.default_driver_id,
                stock_loc_id,
                req.notes,
            ],
        )?;

        let v_id = tx.last_insert_rowid();

        // 3. Link reference_id in stock_locations to the vehicle id
        tx.execute(
            "UPDATE stock_locations SET reference_id = ?1 WHERE id = ?2",
            params![v_id, stock_loc_id],
        )?;

        tx.commit()?;

        Self::get_vehicle_by_id(conn, v_id)
    }

    pub fn list_vehicles(conn: &Connection, active_only: bool) -> Result<Vec<VehicleDto>, AppError> {
        let sql = format!(
            "SELECT v.id, v.vehicle_number, v.model, v.capacity_crates, v.capacity_weight_kg,
                    COALESCE(v.default_driver_id, v.driver_id), u.full_name, v.stock_location_id, v.current_odometer_km,
                    v.is_active, v.notes, v.created_at, v.updated_at
             FROM vehicles v
             LEFT JOIN users u ON COALESCE(v.default_driver_id, v.driver_id) = u.id
             {}
             ORDER BY v.id ASC",
            if active_only { "WHERE v.is_active = 1" } else { "" }
        );

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            Ok(VehicleDto {
                id: row.get(0)?,
                vehicle_number: row.get(1)?,
                model: row.get(2)?,
                capacity_crates: row.get(3)?,
                capacity_weight_kg: row.get(4)?,
                default_driver_id: row.get(5)?,
                default_driver_name: row.get(6)?,
                stock_location_id: row.get(7)?,
                current_odometer_km: row.get(8)?,
                is_active: row.get::<_, i32>(9)? == 1,
                notes: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_vehicle_by_id(conn: &Connection, vehicle_id: i64) -> Result<VehicleDto, AppError> {
        conn.query_row(
            "SELECT v.id, v.vehicle_number, v.model, v.capacity_crates, v.capacity_weight_kg,
                    COALESCE(v.default_driver_id, v.driver_id), u.full_name, v.stock_location_id, v.current_odometer_km,
                    v.is_active, v.notes, v.created_at, v.updated_at
             FROM vehicles v
             LEFT JOIN users u ON COALESCE(v.default_driver_id, v.driver_id) = u.id
             WHERE v.id = ?1",
            params![vehicle_id],
            |row| {
                Ok(VehicleDto {
                    id: row.get(0)?,
                    vehicle_number: row.get(1)?,
                    model: row.get(2)?,
                    capacity_crates: row.get(3)?,
                    capacity_weight_kg: row.get(4)?,
                    default_driver_id: row.get(5)?,
                    default_driver_name: row.get(6)?,
                    stock_location_id: row.get(7)?,
                    current_odometer_km: row.get(8)?,
                    is_active: row.get::<_, i32>(9)? == 1,
                    notes: row.get(10)?,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound {
            entity: "Vehicle".into(),
            id: vehicle_id.to_string(),
        })
    }

    pub fn update_vehicle(
        conn: &Connection,
        vehicle_id: i64,
        req: UpdateVehicleDto,
    ) -> Result<VehicleDto, AppError> {
        let model = req.model.trim();
        if model.is_empty() {
            return Err(AppError::Validation("Vehicle model cannot be empty".into()));
        }

        conn.execute(
            "UPDATE vehicles SET
                model = ?1,
                capacity_crates = ?2,
                capacity_weight_kg = ?3,
                default_driver_id = ?4,
                driver_id = ?4,
                current_odometer_km = ?5,
                is_active = ?6,
                notes = ?7,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?8",
            params![
                model,
                req.capacity_crates,
                req.capacity_weight_kg,
                req.default_driver_id,
                req.current_odometer_km,
                if req.is_active { 1 } else { 0 },
                req.notes,
                vehicle_id
            ],
        )?;

        Self::get_vehicle_by_id(conn, vehicle_id)
    }

    // ------------------------------------------------------------------------
    // 3. VEHICLE LOADING SHEET (DRAFTING)
    // ------------------------------------------------------------------------

    pub fn create_loading_sheet(
        conn: &mut Connection,
        req: CreateLoadingSheetDto,
    ) -> Result<LoadingSheetDetailDto, AppError> {
        let sheet_date = req.sheet_date.unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());

        // Check if date is locked by daily closing
        let is_locked: bool = conn
            .query_row(
                "SELECT 1 FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                params![sheet_date],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);

        if is_locked {
            return Err(AppError::DayLocked(sheet_date));
        }

        if req.items.is_empty() {
            return Err(AppError::Validation("Loading sheet must contain at least one product line".into()));
        }

        let tx = conn.transaction()?;

        // Generate sheet number: LOAD-YYYYMMDD-XXXX
        let clean_date = sheet_date.replace('-', "");
        let seq_num: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(id), 0) + 1 FROM delivery_sheets",
                [],
                |r| r.get(0),
            )
            .unwrap_or(1);
        let sheet_number = format!("LOAD-{}-{:04}", clean_date, seq_num);
        let trip_code = format!("TRIP-{}-{:04}", clean_date, seq_num);

        // Fetch route defaults if vehicle or driver not explicitly specified
        let (def_driver_id, def_driver_name, def_veh_id, def_veh_no): (
            Option<i64>,
            String,
            Option<i64>,
            String,
        ) = tx.query_row(
            "SELECT r.default_driver_id, COALESCE(u.full_name, 'Driver'),
                    r.default_vehicle_id, COALESCE(v.vehicle_number, r.default_vehicle_no, 'LES-1000')
             FROM delivery_routes r
             LEFT JOIN users u ON r.default_driver_id = u.id
             LEFT JOIN vehicles v ON r.default_vehicle_id = v.id
             WHERE r.id = ?1",
            params![req.route_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

        let driver_id = req.driver_id.or(def_driver_id);
        let driver_name = req.driver_name.unwrap_or(def_driver_name);
        let vehicle_id = req.vehicle_id.or(def_veh_id);
        let vehicle_number = req.vehicle_number.unwrap_or(def_veh_no);

        // Insert header in DRAFT status
        tx.execute(
            "INSERT INTO delivery_sheets (
                sheet_number, trip_code, sheet_date, trip_date, route_id,
                driver_id, driver_name, vehicle_id, vehicle_number, helper_name,
                status, opening_km, empty_crates_loaded, notes, created_by
             ) VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'DRAFT', ?10, ?11, ?12, ?13)",
            params![
                sheet_number,
                trip_code,
                sheet_date,
                req.route_id,
                driver_id,
                driver_name,
                vehicle_id,
                vehicle_number,
                req.helper_name,
                req.opening_km.unwrap_or(0),
                req.empty_crates_loaded.unwrap_or(0),
                req.notes,
                req.created_by,
            ],
        )?;

        let sheet_id = tx.last_insert_rowid();

        // Also insert compatibility row into delivery_trips
        let _ = tx.execute(
            "INSERT INTO delivery_trips (
                id, trip_code, trip_date, route_id, driver_name, vehicle_number, status, opening_km, notes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'DRAFT', ?7, ?8)
             ON CONFLICT(trip_code) DO NOTHING",
            params![
                sheet_id,
                trip_code,
                sheet_date,
                req.route_id,
                driver_name,
                vehicle_number,
                req.opening_km.unwrap_or(0),
                req.notes,
            ],
        );

        // Insert items
        for item in &req.items {
            if item.pack_qty < 0 || item.loose_qty < 0 {
                return Err(AppError::Validation("Quantities cannot be negative".into()));
            }

            let (units_per_pack, unit_cost_paisa, unit_price_paisa): (i64, i64, i64) = tx
                .query_row(
                    "SELECT units_per_pack,
                            (purchase_price_pack_paisa / units_per_pack),
                            (wholesale_price_pack_paisa / units_per_pack)
                     FROM products WHERE id = ?1",
                    params![item.product_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()?
                .ok_or_else(|| AppError::NotFound {
                    entity: "Product".into(),
                    id: item.product_id.to_string(),
                })?;

            let total_base = pack_to_base_math(units_per_pack, item.pack_qty, item.loose_qty)?;
            if total_base <= 0 {
                continue;
            }

            let line_cost = unit_cost_paisa * total_base;
            let line_retail = unit_price_paisa * total_base;

            tx.execute(
                "INSERT INTO delivery_items (
                    sheet_id, product_id, loaded_packs, loaded_loose, total_loaded_base,
                    unit_cost_paisa, unit_price_paisa, line_cost_paisa, line_retail_paisa
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    sheet_id,
                    item.product_id,
                    item.pack_qty,
                    item.loose_qty,
                    total_base,
                    unit_cost_paisa,
                    unit_price_paisa,
                    line_cost,
                    line_retail,
                ],
            )?;

            // Also insert compatibility trip_load_items
            let _ = tx.execute(
                "INSERT INTO trip_load_items (
                    trip_id, product_id, loaded_packs, loaded_loose, total_loaded_base
                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    sheet_id,
                    item.product_id,
                    item.pack_qty,
                    item.loose_qty,
                    total_base,
                ],
            );
        }

        tx.commit()?;

        Self::get_loading_sheet_by_id(conn, sheet_id)
    }

    // ------------------------------------------------------------------------
    // 4. VEHICLE STOCK ISSUANCE & DISPATCH (STOCK DEDUCTION & GATE PASS)
    // ------------------------------------------------------------------------

    pub fn issue_loading_sheet(
        conn: &mut Connection,
        req: IssueLoadingSheetDto,
    ) -> Result<IssueLoadingSheetResult, AppError> {
        let departure_time = req.departure_time.unwrap_or_else(|| Utc::now().format("%H:%M:%S").to_string());
        let dispatched_at = Utc::now().to_rfc3339();

        let tx = conn.transaction()?;

        // 1. Fetch delivery sheet header and verify status
        let (sheet_number, sheet_date, route_id, vehicle_id, current_status): (
            String,
            String,
            i64,
            Option<i64>,
            String,
        ) = tx
            .query_row(
                "SELECT sheet_number, sheet_date, route_id, vehicle_id, status
                 FROM delivery_sheets WHERE id = ?1",
                params![req.sheet_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "DeliverySheet".into(),
                id: req.sheet_id.to_string(),
            })?;

        if current_status != "DRAFT" {
            return Err(AppError::Validation(format!(
                "Cannot issue loading sheet #{}: current status is '{}' (must be 'DRAFT')",
                sheet_number, current_status
            )));
        }

        // Verify date lock
        let is_locked: bool = tx
            .query_row(
                "SELECT 1 FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                params![sheet_date],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);

        if is_locked {
            return Err(AppError::DayLocked(sheet_date));
        }

        // 2. Resolve destination vehicle stock location
        let target_location_id: i64 = if let Some(v_id) = vehicle_id {
            tx.query_row(
                "SELECT stock_location_id FROM vehicles WHERE id = ?1",
                params![v_id],
                |r| r.get(0),
            )
            .optional()?
            .flatten()
            .unwrap_or(2) // Fallback to Location 2
        } else {
            2
        };

        // 3. Fetch loading items
        let mut stmt = tx.prepare(
            "SELECT i.id, i.product_id, i.loaded_packs, i.loaded_loose, i.total_loaded_base,
                    p.current_stock_base_units, p.units_per_pack, p.requires_crate,
                    (p.purchase_price_pack_paisa / p.units_per_pack),
                    (p.wholesale_price_pack_paisa / p.units_per_pack)
             FROM delivery_items i
             JOIN products p ON i.product_id = p.id
             WHERE i.sheet_id = ?1",
        )?;

        struct ItemToIssue {
            item_id: i64,
            product_id: i64,
            loaded_packs: i64,
            loaded_loose: i64,
            total_loaded_base: i64,
            available_stock: i64,
            requires_crate: bool,
            unit_cost: i64,
            unit_price: i64,
        }

        let items = stmt
            .query_map(params![req.sheet_id], |r| {
                Ok(ItemToIssue {
                    item_id: r.get(0)?,
                    product_id: r.get(1)?,
                    loaded_packs: r.get(2)?,
                    loaded_loose: r.get(3)?,
                    total_loaded_base: r.get(4)?,
                    available_stock: r.get(5)?,
                    requires_crate: r.get::<_, i32>(7)? == 1,
                    unit_cost: r.get(8)?,
                    unit_price: r.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        drop(stmt);

        if items.is_empty() {
            return Err(AppError::Validation("Cannot issue an empty loading sheet".into()));
        }

        let mut total_base_loaded = 0i64;
        let mut total_crates_count = 0i64;
        let mut total_cost_paisa = 0i64;
        let mut total_retail_paisa = 0i64;
        let movements_count = items.len();

        // 4. Verify Stock & Execute Multi-Location Inventory Decrement
        for it in &items {
            if it.available_stock < it.total_loaded_base {
                return Err(AppError::InsufficientStock {
                    product_id: it.product_id,
                    requested_base: it.total_loaded_base,
                    available_base: it.available_stock,
                });
            }

            let line_cost = it.unit_cost * it.total_loaded_base;
            let line_retail = it.unit_price * it.total_loaded_base;
            total_base_loaded += it.total_loaded_base;
            total_cost_paisa += line_cost;
            total_retail_paisa += line_retail;

            if it.requires_crate {
                total_crates_count += it.loaded_packs;
            }

            // A. Decrement Master Product Inventory
            tx.execute(
                "UPDATE products SET
                    current_stock_base_units = current_stock_base_units - ?1,
                    stock_base_units = stock_base_units - ?1,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?2",
                params![it.total_loaded_base, it.product_id],
            )?;

            // B. Decrement Main Depot Warehouse Location (ID 1)
            tx.execute(
                "INSERT INTO product_location_balances (product_id, location_id, balance_base_units, updated_at)
                 VALUES (?1, 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 ON CONFLICT(product_id, location_id) DO UPDATE SET
                    balance_base_units = balance_base_units - ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                params![it.product_id, it.total_loaded_base],
            )?;

            // C. Increment Vehicle In-Transit Location
            tx.execute(
                "INSERT INTO product_location_balances (product_id, location_id, balance_base_units, updated_at)
                 VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 ON CONFLICT(product_id, location_id) DO UPDATE SET
                    balance_base_units = balance_base_units + ?3,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                params![it.product_id, target_location_id, it.total_loaded_base],
            )?;

            // D. Record Immutable Stock Movement: VAN_DISPATCH
            let mov_code = format!("MOV-DISP-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
            tx.execute(
                "INSERT INTO stock_movements (
                    movement_code, product_id, movement_type,
                    from_location_id, to_location_id,
                    delta_base_units, quantity_base_units,
                    pack_qty, loose_qty,
                    unit_cost_paisa, total_cost_paisa,
                    previous_stock_base_units, new_stock_base_units,
                    reference_type, reference_id,
                    reference_doc_type, reference_doc_id, reference_doc_number,
                    notes, created_by
                 ) VALUES (
                    ?1, ?2, 'VAN_DISPATCH',
                    1, ?3,
                    -?4, ?4,
                    ?5, ?6,
                    ?7, ?8,
                    ?9, ?10,
                    'DELIVERY_SHEET', ?11,
                    'DELIVERY_SHEET', ?11, ?12,
                    'Morning route stock issuance', ?13
                 )",
                params![
                    mov_code,
                    it.product_id,
                    target_location_id,
                    it.total_loaded_base,
                    it.loaded_packs,
                    it.loaded_loose,
                    it.unit_cost,
                    line_cost,
                    it.available_stock,
                    it.available_stock - it.total_loaded_base,
                    req.sheet_id,
                    sheet_number,
                    req.morning_dispatcher_id,
                ],
            )?;

            // E. Stamp Valuation on Item
            tx.execute(
                "UPDATE delivery_items SET
                    unit_cost_paisa = ?1,
                    unit_price_paisa = ?2,
                    line_cost_paisa = ?3,
                    line_retail_paisa = ?4
                 WHERE id = ?5",
                params![it.unit_cost, it.unit_price, line_cost, line_retail, it.item_id],
            )?;
        }

        // 5. Crate Circulation Issuance
        let extra_empty_crates = req.empty_crates_loaded.unwrap_or(0);
        let total_physical_crates = total_crates_count + extra_empty_crates;

        if extra_empty_crates > 0 {
            tx.execute(
                "UPDATE products SET
                    empty_crates_stock = empty_crates_stock - ?1
                 WHERE packaging_type = 'RGB_GLASS'",
                params![extra_empty_crates],
            )?;
        }

        // Record Empties Ledger for Van Route
        if total_physical_crates > 0 {
            tx.execute(
                "INSERT INTO empties_ledger (
                    entity_type, entity_id, entry_date, voucher_type, voucher_id, voucher_number,
                    crates_out, crates_in, running_crates_balance, notes, created_by
                 ) VALUES ('VAN_ROUTE', ?1, ?2, 'VAN_DISPATCH', ?3, ?4, 0, ?5, ?5, 'Morning route crate issuance', ?6)",
                params![
                    route_id,
                    sheet_date,
                    req.sheet_id,
                    sheet_number,
                    total_physical_crates,
                    req.morning_dispatcher_id,
                ],
            )?;

            tx.execute(
                "INSERT INTO entity_crate_balances (
                    entity_type, entity_id, product_id, current_crates_balance, last_updated_at
                 ) VALUES ('VAN_ROUTE', ?1, 1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 ON CONFLICT(entity_type, entity_id, product_id) DO UPDATE SET
                    current_crates_balance = current_crates_balance + ?2,
                    last_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                params![route_id, total_physical_crates],
            )?;
        }

        // 6. Update Delivery Sheet Header to ISSUED
        tx.execute(
            "UPDATE delivery_sheets SET
                status = 'ISSUED',
                dispatched_at = ?1,
                departure_time = ?2,
                opening_km = COALESCE(?3, opening_km),
                empty_crates_loaded = ?4,
                empty_crates_expected = ?5,
                total_load_cost_paisa = ?6,
                total_load_retail_paisa = ?7,
                morning_dispatcher_id = ?8,
                notes = COALESCE(?9, notes),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?10",
            params![
                dispatched_at,
                departure_time,
                req.opening_km,
                extra_empty_crates,
                total_physical_crates,
                total_cost_paisa,
                total_retail_paisa,
                req.morning_dispatcher_id,
                req.notes,
                req.sheet_id,
            ],
        )?;

        // Update compatibility delivery_trips
        let _ = tx.execute(
            "UPDATE delivery_trips SET
                status = 'ISSUED',
                dispatched_at = ?1,
                opening_km = COALESCE(?2, opening_km)
             WHERE id = ?3 OR trip_code = (SELECT trip_code FROM delivery_sheets WHERE id = ?3)",
            params![dispatched_at, req.opening_km, req.sheet_id],
        );

        tx.commit()?;

        Ok(IssueLoadingSheetResult {
            sheet_id: req.sheet_id,
            sheet_number,
            status: "ISSUED".into(),
            dispatched_at,
            departure_time,
            total_products_loaded: items.len(),
            total_base_units_loaded: total_base_loaded,
            total_crates_loaded: total_physical_crates,
            total_load_cost_paisa: total_cost_paisa,
            total_load_retail_paisa: total_retail_paisa,
            stock_movements_recorded: movements_count,
        })
    }

    // ------------------------------------------------------------------------
    // 5. QUERY & REPORTING
    // ------------------------------------------------------------------------

    pub fn get_loading_sheet_by_id(
        conn: &Connection,
        sheet_id: i64,
    ) -> Result<LoadingSheetDetailDto, AppError> {
        let header = conn.query_row(
            "SELECT s.id, s.sheet_number, s.trip_code, s.sheet_date, s.route_id,
                    r.route_name, r.route_code, s.vehicle_id, s.vehicle_number,
                    v.model, v.capacity_crates, s.driver_id, s.driver_name, s.helper_name,
                    s.status, s.dispatched_at, s.departure_time, s.returned_at,
                    s.opening_km, s.closing_km, s.empty_crates_loaded,
                    s.total_load_cost_paisa, s.total_load_retail_paisa,
                    s.expected_cash_paisa, s.actual_cash_paisa, s.cash_variance_paisa,
                    s.empty_crates_expected, s.empty_crates_returned, s.crates_variance,
                    s.notes, s.settlement_notes, s.created_by, s.morning_dispatcher_id,
                    s.settled_by, s.created_at, s.updated_at
             FROM delivery_sheets s
             JOIN delivery_routes r ON s.route_id = r.id
             LEFT JOIN vehicles v ON s.vehicle_id = v.id
             WHERE s.id = ?1",
            params![sheet_id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<i64>>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<i64>>(10)?,
                    row.get::<_, Option<i64>>(11)?,
                    row.get::<_, String>(12)?,
                    row.get::<_, Option<String>>(13)?,
                    row.get::<_, String>(14)?,
                    row.get::<_, Option<String>>(15)?,
                    row.get::<_, Option<String>>(16)?,
                    row.get::<_, Option<String>>(17)?,
                    row.get::<_, Option<i64>>(18)?,
                    row.get::<_, Option<i64>>(19)?,
                    row.get::<_, i64>(20)?,
                    row.get::<_, i64>(21)?,
                    row.get::<_, i64>(22)?,
                    row.get::<_, i64>(23)?,
                    row.get::<_, i64>(24)?,
                    row.get::<_, i64>(25)?,
                    row.get::<_, i64>(26)?,
                    row.get::<_, i64>(27)?,
                    row.get::<_, i64>(28)?,
                    row.get::<_, Option<String>>(29)?,
                    row.get::<_, Option<String>>(30)?,
                    row.get::<_, Option<i64>>(31)?,
                    row.get::<_, Option<i64>>(32)?,
                    row.get::<_, Option<i64>>(33)?,
                    row.get::<_, String>(34)?,
                    row.get::<_, String>(35)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound {
            entity: "DeliverySheet".into(),
            id: sheet_id.to_string(),
        })?;

        let mut item_stmt = conn.prepare(
            "SELECT i.id, i.sheet_id, i.product_id, p.sku_code, p.name,
                    p.pack_unit_name, p.base_unit_name, p.units_per_pack,
                    i.loaded_packs, i.loaded_loose, i.total_loaded_base,
                    i.unit_cost_paisa, i.unit_price_paisa, i.line_cost_paisa, i.line_retail_paisa,
                    i.sold_base, i.returned_packs, i.returned_loose, i.total_returned_base,
                    i.breakage_base, i.variance_base
             FROM delivery_items i
             JOIN products p ON i.product_id = p.id
             WHERE i.sheet_id = ?1
             ORDER BY i.id ASC",
        )?;

        let items = item_stmt
            .query_map(params![sheet_id], |r| {
                Ok(LoadingSheetItemDto {
                    id: r.get(0)?,
                    sheet_id: r.get(1)?,
                    product_id: r.get(2)?,
                    product_sku: r.get(3)?,
                    product_name: r.get(4)?,
                    pack_unit_name: r.get(5)?,
                    base_unit_name: r.get(6)?,
                    units_per_pack: r.get(7)?,
                    loaded_packs: r.get(8)?,
                    loaded_loose: r.get(9)?,
                    total_loaded_base: r.get(10)?,
                    unit_cost_paisa: r.get(11)?,
                    unit_price_paisa: r.get(12)?,
                    line_cost_paisa: r.get(13)?,
                    line_retail_paisa: r.get(14)?,
                    sold_base: r.get(15)?,
                    returned_packs: r.get(16)?,
                    returned_loose: r.get(17)?,
                    total_returned_base: r.get(18)?,
                    breakage_base: r.get(19)?,
                    variance_base: r.get(20)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(LoadingSheetDetailDto {
            id: header.0,
            sheet_number: header.1,
            trip_code: header.2,
            sheet_date: header.3,
            route_id: header.4,
            route_name: header.5,
            route_code: header.6,
            vehicle_id: header.7,
            vehicle_number: header.8,
            vehicle_model: header.9,
            vehicle_capacity_crates: header.10,
            driver_id: header.11,
            driver_name: header.12,
            helper_name: header.13,
            status: header.14,
            dispatched_at: header.15,
            departure_time: header.16,
            returned_at: header.17,
            opening_km: header.18,
            closing_km: header.19,
            empty_crates_loaded: header.20,
            total_load_cost_paisa: header.21,
            total_load_retail_paisa: header.22,
            expected_cash_paisa: header.23,
            actual_cash_paisa: header.24,
            cash_variance_paisa: header.25,
            empty_crates_expected: header.26,
            empty_crates_returned: header.27,
            crates_variance: header.28,
            notes: header.29,
            settlement_notes: header.30,
            created_by: header.31,
            morning_dispatcher_id: header.32,
            settled_by: header.33,
            created_at: header.34,
            updated_at: header.35,
            items,
        })
    }

    pub fn list_loading_sheets(
        conn: &Connection,
        filter: LoadingSheetFilterDto,
    ) -> Result<Vec<LoadingSheetSummaryDto>, AppError> {
        let mut sql = "SELECT s.id, s.sheet_number, s.sheet_date, s.route_id, r.route_name,
                              s.vehicle_number, s.driver_name, s.status,
                              (SELECT COUNT(*) FROM delivery_items WHERE sheet_id = s.id),
                              (SELECT COALESCE(SUM(total_loaded_base), 0) FROM delivery_items WHERE sheet_id = s.id),
                              s.empty_crates_loaded, s.total_load_retail_paisa, s.dispatched_at
                       FROM delivery_sheets s
                       JOIN delivery_routes r ON s.route_id = r.id
                       WHERE 1=1 ".to_string();

        if let Some(r_id) = filter.route_id {
            sql.push_str(&format!("AND s.route_id = {} ", r_id));
        }
        if let Some(ref from) = filter.date_from {
            sql.push_str(&format!("AND s.sheet_date >= '{}' ", from.replace('\'', "''")));
        }
        if let Some(ref to) = filter.date_to {
            sql.push_str(&format!("AND s.sheet_date <= '{}' ", to.replace('\'', "''")));
        }
        if let Some(ref st) = filter.status {
            sql.push_str(&format!("AND s.status = '{}' ", st.replace('\'', "''")));
        }

        sql.push_str("ORDER BY s.id DESC LIMIT 100");

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |r| {
            Ok(LoadingSheetSummaryDto {
                id: r.get(0)?,
                sheet_number: r.get(1)?,
                sheet_date: r.get(2)?,
                route_id: r.get(3)?,
                route_name: r.get(4)?,
                vehicle_number: r.get(5)?,
                driver_name: r.get(6)?,
                status: r.get(7)?,
                total_items_count: r.get::<_, i64>(8)? as usize,
                total_loaded_base: r.get(9)?,
                empty_crates_loaded: r.get(10)?,
                total_load_retail_paisa: r.get(11)?,
                dispatched_at: r.get(12)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }
}
