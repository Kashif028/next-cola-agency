use tauri::State;

use crate::commands::db_commands::AppState;
use crate::domain::dtos::*;
use crate::services::logistics::LogisticsService;
use crate::services::settlement::SettlementService;

#[tauri::command]
pub async fn get_routes(
    state: State<'_, AppState>,
    active_only: Option<bool>,
) -> Result<ApiResponse<Vec<RouteDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::list_routes(&conn, active_only.unwrap_or(false)) {
        Ok(routes) => Ok(ApiResponse::ok(routes)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn create_route(
    state: State<'_, AppState>,
    req: CreateRouteDto,
) -> Result<ApiResponse<RouteDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::create_route(&conn, req) {
        Ok(route) => Ok(ApiResponse::ok(route)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CREATE_ERROR")),
    }
}

#[tauri::command]
pub async fn update_route(
    state: State<'_, AppState>,
    route_id: i64,
    req: UpdateRouteDto,
) -> Result<ApiResponse<RouteDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::update_route(&conn, route_id, req) {
        Ok(route) => Ok(ApiResponse::ok(route)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "UPDATE_ERROR")),
    }
}

#[tauri::command]
pub async fn get_route_by_id(
    state: State<'_, AppState>,
    route_id: i64,
) -> Result<ApiResponse<RouteDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::get_route_by_id(&conn, route_id) {
        Ok(route) => Ok(ApiResponse::ok(route)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "NOT_FOUND")),
    }
}

#[tauri::command]
pub async fn get_vehicles(
    state: State<'_, AppState>,
    active_only: Option<bool>,
) -> Result<ApiResponse<Vec<VehicleDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::list_vehicles(&conn, active_only.unwrap_or(false)) {
        Ok(vehicles) => Ok(ApiResponse::ok(vehicles)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn create_vehicle(
    state: State<'_, AppState>,
    req: CreateVehicleDto,
) -> Result<ApiResponse<VehicleDto>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::create_vehicle(&mut conn, req) {
        Ok(vehicle) => Ok(ApiResponse::ok(vehicle)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CREATE_ERROR")),
    }
}

#[tauri::command]
pub async fn update_vehicle(
    state: State<'_, AppState>,
    vehicle_id: i64,
    req: UpdateVehicleDto,
) -> Result<ApiResponse<VehicleDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::update_vehicle(&conn, vehicle_id, req) {
        Ok(vehicle) => Ok(ApiResponse::ok(vehicle)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "UPDATE_ERROR")),
    }
}

#[tauri::command]
pub async fn get_vehicle_by_id(
    state: State<'_, AppState>,
    vehicle_id: i64,
) -> Result<ApiResponse<VehicleDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::get_vehicle_by_id(&conn, vehicle_id) {
        Ok(vehicle) => Ok(ApiResponse::ok(vehicle)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "NOT_FOUND")),
    }
}

#[tauri::command]
pub async fn create_loading_sheet(
    state: State<'_, AppState>,
    req: CreateLoadingSheetDto,
) -> Result<ApiResponse<LoadingSheetDetailDto>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::create_loading_sheet(&mut conn, req) {
        Ok(sheet) => Ok(ApiResponse::ok(sheet)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CREATE_ERROR")),
    }
}

#[tauri::command]
pub async fn issue_loading_sheet(
    state: State<'_, AppState>,
    req: IssueLoadingSheetDto,
) -> Result<ApiResponse<IssueLoadingSheetResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::issue_loading_sheet(&mut conn, req) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "ISSUE_ERROR")),
    }
}

#[tauri::command]
pub async fn get_loading_sheet(
    state: State<'_, AppState>,
    sheet_id: i64,
) -> Result<ApiResponse<LoadingSheetDetailDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::get_loading_sheet_by_id(&conn, sheet_id) {
        Ok(sheet) => Ok(ApiResponse::ok(sheet)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "NOT_FOUND")),
    }
}

#[tauri::command]
pub async fn list_loading_sheets(
    state: State<'_, AppState>,
    filter: Option<LoadingSheetFilterDto>,
) -> Result<ApiResponse<Vec<LoadingSheetSummaryDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match LogisticsService::list_loading_sheets(&conn, filter.unwrap_or_default()) {
        Ok(sheets) => Ok(ApiResponse::ok(sheets)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn calculate_van_settlement(
    state: State<'_, AppState>,
    req: CalculateSettlementRequestDto,
) -> Result<ApiResponse<SettlementReconciliationDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match SettlementService::calculate_settlement_reconciliation(
        &conn,
        req.sheet_id,
        req.settlement_date.as_deref(),
        &req.returns,
        req.actual_cash_paisa,
        req.empty_crates_returned,
        req.route_expenses_paisa.unwrap_or(0),
    ) {
        Ok(recon) => Ok(ApiResponse::ok(recon)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CALC_ERROR")),
    }
}

#[tauri::command]
pub async fn submit_van_settlement(
    state: State<'_, AppState>,
    req: SubmitVanSettlementDto,
) -> Result<ApiResponse<VanSettlementResultDto>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match SettlementService::submit_van_settlement(&mut conn, req) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "SETTLE_ERROR")),
    }
}
