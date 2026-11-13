use tauri::State;

use crate::commands::db_commands::AppState;
use crate::domain::dtos::ApiResponse;
use crate::services::cancellations::*;
use crate::services::closing::*;
use crate::services::purchases::*;
use crate::services::returns::*;
use crate::services::sales::*;

// ============================================================================
// SALES INVOICING COMMANDS
// ============================================================================

#[tauri::command]
pub async fn sales_create_invoice(
    state: State<'_, AppState>,
    request: CreateSalesInvoiceDto,
) -> Result<ApiResponse<SalesInvoiceReceiptDto>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match SalesService::create_invoice(&mut conn, request) {
        Ok(receipt) => Ok(ApiResponse::ok(receipt)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "SALES_ERROR")),
    }
}

#[tauri::command]
pub async fn sales_get_invoice(
    state: State<'_, AppState>,
    invoice_id: i64,
) -> Result<ApiResponse<SalesInvoiceReceiptDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match SalesService::get_invoice_by_id(&conn, invoice_id) {
        Ok(invoice) => Ok(ApiResponse::ok(invoice)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "NOT_FOUND")),
    }
}

#[tauri::command]
pub async fn sales_list_invoices(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<ApiResponse<Vec<SalesInvoiceListItemDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match SalesService::list_invoices(&conn, limit) {
        Ok(list) => Ok(ApiResponse::ok(list)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn sales_check_credit_status(
    state: State<'_, AppState>,
    customer_id: i64,
    attempted_credit_paisa: i64,
) -> Result<ApiResponse<CreditStatusCheckResult>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match SalesService::check_credit_status(&conn, customer_id, attempted_credit_paisa) {
        Ok(status) => Ok(ApiResponse::ok(status)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

// ============================================================================
// PURCHASES COMMANDS (LANDED COST)
// ============================================================================

#[tauri::command]
pub async fn purchase_create_invoice(
    state: State<'_, AppState>,
    request: RecordPurchaseDto,
) -> Result<ApiResponse<RecordPurchaseResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match PurchaseService::record_purchase(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "PURCHASE_ERROR")),
    }
}

#[derive(serde::Deserialize)]
pub struct CalculateLandedCostReq {
    pub items: Vec<PurchaseItemInputDto>,
    pub freight_paisa: i64,
    pub unloading_labor_paisa: i64,
    pub transit_tax_paisa: i64,
}

#[tauri::command]
pub async fn purchase_calculate_landed_cost(
    state: State<'_, AppState>,
    request: CalculateLandedCostReq,
) -> Result<ApiResponse<LandedCostBreakdownDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match PurchaseService::calculate_landed_cost_preview(
        &conn,
        &request.items,
        request.freight_paisa,
        request.unloading_labor_paisa,
        request.transit_tax_paisa,
    ) {
        Ok(preview) => Ok(ApiResponse::ok(preview)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CALC_ERROR")),
    }
}

#[tauri::command]
pub async fn purchase_list_invoices(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<ApiResponse<Vec<PurchaseInvoiceListItemDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match PurchaseService::list_purchases(&conn, limit) {
        Ok(list) => Ok(ApiResponse::ok(list)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

// ============================================================================
// BILL CANCELLATION COMMANDS
// ============================================================================

#[tauri::command]
pub async fn sales_cancel_invoice(
    state: State<'_, AppState>,
    request: CancelInvoiceDto,
) -> Result<ApiResponse<CancelInvoiceResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match CancellationService::cancel_invoice(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CANCEL_ERROR")),
    }
}

// ============================================================================
// SALES RETURNS COMMANDS
// ============================================================================

#[tauri::command]
pub async fn sales_record_return(
    state: State<'_, AppState>,
    request: RecordSalesReturnDto,
) -> Result<ApiResponse<SalesReturnResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match SalesReturnService::record_sales_return(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "RETURN_ERROR")),
    }
}

#[tauri::command]
pub async fn sales_list_returns(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<ApiResponse<Vec<SalesReturnListItemDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match SalesReturnService::list_returns(&conn, limit) {
        Ok(list) => Ok(ApiResponse::ok(list)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

// ============================================================================
// DAILY CLOSING COMMANDS
// ============================================================================

#[tauri::command]
pub async fn closing_get_daily_summary(
    state: State<'_, AppState>,
    closing_date: Option<String>,
) -> Result<ApiResponse<DailyClosingSummaryDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match ClosingService::get_daily_summary(&conn, closing_date.as_deref()) {
        Ok(summary) => Ok(ApiResponse::ok(summary)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CLOSING_ERROR")),
    }
}

#[tauri::command]
pub async fn closing_submit_closing(
    state: State<'_, AppState>,
    request: SubmitClosingDto,
) -> Result<ApiResponse<SubmitClosingResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match ClosingService::submit_closing(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CLOSING_ERROR")),
    }
}

#[tauri::command]
pub async fn closing_get_history(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<ApiResponse<Vec<DailyClosingHistoryItemDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match ClosingService::get_history(&conn, limit) {
        Ok(history) => Ok(ApiResponse::ok(history)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}
