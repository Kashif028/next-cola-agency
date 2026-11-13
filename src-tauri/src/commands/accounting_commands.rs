use tauri::State;

use crate::commands::db_commands::AppState;
use crate::domain::dtos::*;
use crate::services::accounting::AccountingService;

// ============================================================================
// 1. CUSTOMER & SUPPLIER LEDGER STATEMENTS
// ============================================================================

#[tauri::command]
pub async fn get_customer_ledger_statement(
    state: State<'_, AppState>,
    customer_id: i64,
    from_date: Option<String>,
    to_date: Option<String>,
) -> Result<ApiResponse<CustomerLedgerStatementDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::get_customer_ledger(&conn, customer_id, from_date.as_deref(), to_date.as_deref()) {
        Ok(statement) => Ok(ApiResponse::ok(statement)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "LEDGER_ERROR")),
    }
}

#[tauri::command]
pub async fn get_supplier_ledger_statement(
    state: State<'_, AppState>,
    supplier_id: i64,
    from_date: Option<String>,
    to_date: Option<String>,
) -> Result<ApiResponse<SupplierLedgerStatementDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::get_supplier_ledger(&conn, supplier_id, from_date.as_deref(), to_date.as_deref()) {
        Ok(statement) => Ok(ApiResponse::ok(statement)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "LEDGER_ERROR")),
    }
}

// ============================================================================
// 2. 5-BUCKET UDHAAR AGING REPORTS
// ============================================================================

#[tauri::command]
pub async fn get_customer_aging_report(
    state: State<'_, AppState>,
    customer_id: i64,
    as_of_date: Option<String>,
) -> Result<ApiResponse<CustomerUdhaarAgingDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::calculate_customer_aging(&conn, customer_id, as_of_date.as_deref()) {
        Ok(report) => Ok(ApiResponse::ok(report)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "AGING_ERROR")),
    }
}

#[tauri::command]
pub async fn get_all_customers_aging_summary(
    state: State<'_, AppState>,
    as_of_date: Option<String>,
    route_id: Option<i64>,
) -> Result<ApiResponse<AgencyUdhaarAgingReportDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::calculate_agency_aging(&conn, as_of_date.as_deref(), route_id) {
        Ok(summary) => Ok(ApiResponse::ok(summary)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "AGING_ERROR")),
    }
}

// ============================================================================
// 3. RECOVERIES & ALLOCATIONS
// ============================================================================

#[tauri::command]
pub async fn record_customer_recovery(
    state: State<'_, AppState>,
    request: RecordCustomerRecoveryDto,
) -> Result<ApiResponse<RecoveryReceiptDto>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::record_customer_recovery(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "RECOVERY_ERROR")),
    }
}

// ============================================================================
// 4. SUPPLIER PAYMENTS
// ============================================================================

#[tauri::command]
pub async fn record_supplier_payment(
    state: State<'_, AppState>,
    request: RecordSupplierPaymentDto,
) -> Result<ApiResponse<RecordSupplierPaymentResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::record_supplier_payment(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "PAYMENT_ERROR")),
    }
}

// ============================================================================
// 5. OPERATING EXPENSES
// ============================================================================

#[tauri::command]
pub async fn record_operating_expense(
    state: State<'_, AppState>,
    request: RecordExpenseDto,
) -> Result<ApiResponse<RecordExpenseResult>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::record_expense(&mut conn, request) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "EXPENSE_ERROR")),
    }
}

#[tauri::command]
pub async fn get_operating_expenses(
    state: State<'_, AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
    account_id: Option<i64>,
) -> Result<ApiResponse<Vec<ExpenseListItemDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::get_operating_expenses(&conn, start_date.as_deref(), end_date.as_deref(), account_id) {
        Ok(list) => Ok(ApiResponse::ok(list)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

// ============================================================================
// 6. CASH BOOK STATEMENT
// ============================================================================

#[tauri::command]
pub async fn get_cash_book_statement(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
) -> Result<ApiResponse<CashBookStatementDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::get_cash_book_statement(&conn, &start_date, &end_date) {
        Ok(stmt) => Ok(ApiResponse::ok(stmt)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "CASH_BOOK_ERROR")),
    }
}

// ============================================================================
// 7. BANK ACCOUNTS, TRANSFERS & RECONCILIATION (BRS)
// ============================================================================

#[tauri::command]
pub async fn get_bank_accounts(
    state: State<'_, AppState>,
) -> Result<ApiResponse<Vec<BankAccountDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::get_bank_accounts(&conn) {
        Ok(accounts) => Ok(ApiResponse::ok(accounts)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn record_bank_transfer(
    state: State<'_, AppState>,
    request: BankTransferRequestDto,
) -> Result<ApiResponse<BankTransactionDto>, ()> {
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::record_bank_transfer(&mut conn, request) {
        Ok(tx) => Ok(ApiResponse::ok(tx)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "TRANSFER_ERROR")),
    }
}

#[tauri::command]
pub async fn get_bank_reconciliation(
    state: State<'_, AppState>,
    bank_account_id: i64,
    as_of_date: String,
) -> Result<ApiResponse<BankReconciliationReportDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::get_bank_reconciliation(&conn, bank_account_id, &as_of_date) {
        Ok(rep) => Ok(ApiResponse::ok(rep)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "RECONCILIATION_ERROR")),
    }
}

// ============================================================================
// 8. PROFIT & LOSS AND TRIAL BALANCE
// ============================================================================

#[tauri::command]
pub async fn get_profit_and_loss_report(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
) -> Result<ApiResponse<ProfitAndLossStatementDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::calculate_profit_and_loss(&conn, &start_date, &end_date) {
        Ok(pnl) => Ok(ApiResponse::ok(pnl)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "PNL_ERROR")),
    }
}

#[tauri::command]
pub async fn get_trial_balance_report(
    state: State<'_, AppState>,
    as_of_date: Option<String>,
) -> Result<ApiResponse<TrialBalanceReportDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::calculate_trial_balance(&conn, as_of_date.as_deref()) {
        Ok(tb) => Ok(ApiResponse::ok(tb)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "TRIAL_BALANCE_ERROR")),
    }
}

#[tauri::command]
pub async fn get_chart_of_accounts(
    state: State<'_, AppState>,
) -> Result<ApiResponse<Vec<AccountDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AccountingService::get_chart_of_accounts(&conn) {
        Ok(accounts) => Ok(ApiResponse::ok(accounts)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}
