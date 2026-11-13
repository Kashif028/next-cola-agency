use tauri::State;

use crate::commands::db_commands::AppState;
use crate::domain::dtos::ApiResponse;
use crate::services::inventory::*;

#[tauri::command]
pub async fn inventory_convert_pack_to_base(
    state: State<'_, AppState>,
    request: ConvertPackToBaseDto,
) -> Result<ApiResponse<ConvertPackToBaseResult>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::convert_pack_to_base(&conn, request.product_id, request.pack_qty, request.loose_qty) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CONVERSION_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_convert_base_to_pack(
    state: State<'_, AppState>,
    request: ConvertBaseToPackDto,
) -> Result<ApiResponse<ConvertBaseToPackResult>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::convert_base_to_pack(&conn, request.product_id, request.base_units) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CONVERSION_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_get_packaging_units(
    state: State<'_, AppState>,
    product_id: i64,
) -> Result<ApiResponse<Vec<PackagingUnitDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::get_packaging_units(&conn, product_id) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_get_stock_overview(
    state: State<'_, AppState>,
    filter: Option<StockFilterDto>,
) -> Result<ApiResponse<Vec<StockItemOverviewDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::get_stock_overview(&conn, filter.unwrap_or_default()) {
        Ok(items) => Ok(ApiResponse::ok(items)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_adjust_stock(
    state: State<'_, AppState>,
    request: AdjustStockDto,
) -> Result<ApiResponse<StockAdjustmentResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::adjust_stock(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "ADJUSTMENT_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_get_empties_overview(
    state: State<'_, AppState>,
) -> Result<ApiResponse<EmptiesOverviewDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::get_empties_overview(&conn) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_record_crate_transaction(
    state: State<'_, AppState>,
    request: RecordCrateTransactionDto,
) -> Result<ApiResponse<CrateTransactionResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::record_crate_transaction(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "TRANSACTION_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_get_customer_crate_ledger(
    state: State<'_, AppState>,
    customer_id: i64,
    limit: Option<usize>,
) -> Result<ApiResponse<Vec<CustomerCrateLedgerDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::get_customer_crate_ledger(&conn, customer_id, limit.unwrap_or(100)) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_record_security_deposit(
    state: State<'_, AppState>,
    request: RecordSecurityDepositDto,
) -> Result<ApiResponse<SecurityDepositResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::record_security_deposit(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "DEPOSIT_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_refund_security_deposit(
    state: State<'_, AppState>,
    request: RefundSecurityDepositDto,
) -> Result<ApiResponse<SecurityDepositResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::refund_security_deposit(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "REFUND_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_record_breakage(
    state: State<'_, AppState>,
    request: RecordBreakageDto,
) -> Result<ApiResponse<BreakageResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::record_breakage(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "BREAKAGE_ERROR")),
    }
}

#[tauri::command]
pub async fn inventory_get_breakage_logs(
    state: State<'_, AppState>,
    product_id: Option<i64>,
    limit: Option<usize>,
) -> Result<ApiResponse<Vec<BreakageLogDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match InventoryService::get_breakage_logs(&conn, product_id, limit.unwrap_or(100)) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}
