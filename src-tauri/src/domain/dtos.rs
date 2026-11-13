use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Unified IPC Response Envelope for all Tauri commands
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
    pub code: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            code: None,
        }
    }

    pub fn err(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
            code: Some(code.into()),
        }
    }
}

/// Metadata describing a completed database backup
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BackupMetadata {
    pub backup_id: String,
    pub file_name: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub checksum_sha256: String,
    pub created_at: DateTime<Utc>,
    pub notes: String,
}

/// Database diagnostic statistics
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DbStats {
    pub journal_mode: String,
    pub foreign_keys: bool,
    pub page_size: u32,
    pub page_count: u64,
    pub total_size_bytes: u64,
    pub active_connections: u32,
    pub idle_connections: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbHealthReport {
    pub status: String,
    pub journal_mode: String,
    pub foreign_keys: bool,
    pub busy_timeout_ms: i64,
    pub pool_connections_active: u32,
    pub pool_connections_idle: u32,
    pub pool_connections_max: u32,
    pub page_count: i64,
    pub page_size_bytes: i64,
    pub database_size_bytes: u64,
    pub tables_count: usize,
    pub checked_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitSchemaRequest {
    pub force_reseed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitSchemaResult {
    pub success: bool,
    pub applied_migrations: Vec<String>,
    pub total_tables: usize,
    pub seeded_accounts_count: usize,
    pub seeded_agency_name: String,
    pub execution_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRequest {
    pub destination_dir: Option<String>,
    pub custom_filename: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResult {
    pub backup_file_path: String,
    pub file_size_bytes: u64,
    pub page_count: i32,
    pub sha256_checksum: String,
    pub created_at: DateTime<Utc>,
    pub execution_duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreRequest {
    pub backup_file_path: String,
    pub admin_pin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    pub success: bool,
    pub restored_from: String,
    pub pre_restore_snapshot_path: String,
    pub tables_restored: usize,
    pub restored_at: DateTime<Utc>,
}

// ============================================================================
// MILESTONE 4: ACCOUNTING & LEDGER DTOs
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalLineInput {
    pub account_id: i64,
    pub debit_paisa: i64,
    pub credit_paisa: i64,
    pub line_narration: Option<String>,
    pub customer_id: Option<i64>,
    pub supplier_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateJournalEntryInput {
    pub entry_date: String,
    pub voucher_type: String, // SALE, PURCHASE, PAYMENT, RECEIPT, EXPENSE, CLOSING, CANCELLATION, TRANSFER, MANUAL
    pub reference_doc_type: Option<String>,
    pub reference_doc_id: Option<i64>,
    pub narration: String,
    pub lines: Vec<JournalLineInput>,
    pub created_by: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalEntryListItemDto {
    pub id: i64,
    pub entry_number: String,
    pub entry_date: String,
    pub voucher_type: String,
    pub reference_doc_type: Option<String>,
    pub reference_doc_id: Option<i64>,
    pub narration: String,
    pub total_debit_paisa: i64,
    pub total_credit_paisa: i64,
    pub total_debit: f64,
    pub total_credit: f64,
    pub is_balanced: bool,
    pub is_locked: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalLineDetailDto {
    pub id: i64,
    pub account_id: i64,
    pub account_code: i64,
    pub account_name: String,
    pub account_type: String,
    pub debit_paisa: i64,
    pub credit_paisa: i64,
    pub debit: f64,
    pub credit: f64,
    pub line_narration: Option<String>,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub supplier_id: Option<i64>,
    pub supplier_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalEntryDetailDto {
    pub id: i64,
    pub entry_number: String,
    pub entry_date: String,
    pub voucher_type: String,
    pub reference_doc_type: Option<String>,
    pub reference_doc_id: Option<i64>,
    pub narration: String,
    pub total_debit_paisa: i64,
    pub total_credit_paisa: i64,
    pub is_balanced: bool,
    pub is_locked: bool,
    pub lines: Vec<JournalLineDetailDto>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountDto {
    pub id: i64,
    pub account_code: i64,
    pub account_name: String,
    pub account_type: String,
    pub parent_code: Option<i64>,
    pub is_system: bool,
    pub is_active: bool,
    pub description: Option<String>,
}

// ----------------------------------------------------------------------------
// Customer Ledger
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerLedgerEntryDto {
    pub id: i64,
    pub customer_id: i64,
    pub entry_date: String,
    pub voucher_type: String,
    pub voucher_ref_id: Option<i64>,
    pub voucher_number: Option<String>,
    pub description: String,
    pub debit_paisa: i64,
    pub credit_paisa: i64,
    pub debit: f64,
    pub credit: f64,
    pub running_balance_paisa: i64,
    pub running_balance: f64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerLedgerStatementDto {
    pub customer_id: i64,
    pub customer_code: String,
    pub customer_name: String,
    pub shop_name: String,
    pub phone: String,
    pub address: String,
    pub price_tier: String,
    pub credit_limit_paisa: i64,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub opening_balance_paisa: i64,
    pub opening_balance: f64,
    pub entries: Vec<CustomerLedgerEntryDto>,
    pub total_debit_paisa: i64,
    pub total_credit_paisa: i64,
    pub total_debit: f64,
    pub total_credit: f64,
    pub closing_balance_paisa: i64,
    pub closing_balance: f64,
    pub current_outstanding_paisa: i64,
}

// ----------------------------------------------------------------------------
// Supplier Ledger
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierLedgerEntryDto {
    pub id: i64,
    pub supplier_id: i64,
    pub entry_date: String,
    pub voucher_type: String,
    pub voucher_ref_id: Option<i64>,
    pub voucher_number: Option<String>,
    pub description: String,
    pub debit_paisa: i64,  // payment (reduces payable)
    pub credit_paisa: i64, // purchase (increases payable)
    pub debit: f64,
    pub credit: f64,
    pub running_balance_paisa: i64,
    pub running_balance: f64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierLedgerStatementDto {
    pub supplier_id: i64,
    pub supplier_code: Option<String>,
    pub supplier_name: String,
    pub company_name: String,
    pub phone: String,
    pub supplier_type: String,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub opening_payable_paisa: i64,
    pub opening_payable: f64,
    pub entries: Vec<SupplierLedgerEntryDto>,
    pub total_credit_paisa: i64,
    pub total_debit_paisa: i64,
    pub total_credit: f64,
    pub total_debit: f64,
    pub closing_payable_paisa: i64,
    pub closing_payable: f64,
    pub current_payable_paisa: i64,
}

// ----------------------------------------------------------------------------
// 5-Bucket Udhaar Aging
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceAgingItemDto {
    pub invoice_id: i64,
    pub invoice_number: String,
    pub invoice_date: String,
    pub due_date: String,
    pub age_days: i64,
    pub bucket: String, // "0_7", "8_15", "16_30", "31_60", "60_PLUS"
    pub net_total_paisa: i64,
    pub paid_amount_paisa: i64,
    pub due_amount_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerUdhaarAgingDto {
    pub customer_id: i64,
    pub customer_code: String,
    pub customer_name: String,
    pub shop_name: String,
    pub phone: String,
    pub route_id: Option<i64>,
    pub route_name: Option<String>,
    pub credit_limit_paisa: i64,
    pub current_balance_paisa: i64,
    pub credit_status: String, // "ACTIVE", "WARNING", "BLOCKED"
    pub as_of_date: String,
    pub bucket_0_7_paisa: i64,
    pub bucket_8_15_paisa: i64,
    pub bucket_16_30_paisa: i64,
    pub bucket_31_60_paisa: i64,
    pub bucket_60_plus_paisa: i64,
    pub total_outstanding_paisa: i64,
    pub invoices: Vec<InvoiceAgingItemDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgencyUdhaarAgingReportDto {
    pub as_of_date: String,
    pub total_customers: usize,
    pub customers_with_debt: usize,
    pub total_bucket_0_7_paisa: i64,
    pub total_bucket_8_15_paisa: i64,
    pub total_bucket_16_30_paisa: i64,
    pub total_bucket_31_60_paisa: i64,
    pub total_bucket_60_plus_paisa: i64,
    pub grand_total_outstanding_paisa: i64,
    pub customer_agings: Vec<CustomerUdhaarAgingDto>,
}

// ----------------------------------------------------------------------------
// Recoveries & Allocations
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AllocationMode {
    Fifo,
    Specific,
    OnAccount,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecoveryPaymentMode {
    Cash,
    Bank,
    Cheque,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceAllocationDetailDto {
    pub invoice_id: i64,
    pub invoice_number: String,
    pub invoice_date: String,
    pub previous_due_paisa: i64,
    pub allocated_paisa: i64,
    pub remaining_due_paisa: i64,
    pub new_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordCustomerRecoveryDto {
    pub customer_id: i64,
    pub amount_paisa: i64,
    pub payment_mode: String, // "CASH", "BANK", "CHEQUE"
    #[serde(default)]
    pub allocation_mode: Option<String>, // "FIFO", "SPECIFIC", "ON_ACCOUNT"
    pub payment_date: Option<String>,
    pub target_invoice_ids: Option<Vec<i64>>,
    pub bank_account_id: Option<i64>,
    pub bank_name: Option<String>,
    pub instrument_number: Option<String>,
    pub instrument_date: Option<String>,
    pub notes: Option<String>,
    pub user_id: Option<i64>,
    #[serde(default)]
    pub delivery_sheet_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryReceiptDto {
    pub recovery_id: i64,
    pub recovery_number: String,
    pub customer_id: i64,
    pub customer_name: String,
    pub shop_name: String,
    pub customer_phone: String,
    pub recovery_date: String,
    pub amount_paisa: i64,
    pub payment_mode: String,
    pub allocation_mode: String,
    pub previous_balance_paisa: i64,
    pub new_balance_paisa: i64,
    pub unallocated_remainder_paisa: i64,
    pub allocations: Vec<InvoiceAllocationDetailDto>,
    pub journal_entry_id: i64,
    pub cash_book_id: Option<i64>,
    pub bank_transaction_id: Option<i64>,
    pub delivery_sheet_id: Option<i64>,
    pub formatted_thermal_receipt: String,
}

// ----------------------------------------------------------------------------
// Supplier Payments
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordSupplierPaymentDto {
    pub supplier_id: i64,
    pub amount_paisa: i64,
    pub payment_mode: String, // "CASH" or "BANK"
    pub payment_date: Option<String>,
    pub bank_account_id: Option<i64>,
    pub reference_number: Option<String>,
    pub description: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordSupplierPaymentResult {
    pub payment_id: i64,
    pub voucher_number: String,
    pub supplier_id: i64,
    pub amount_paisa: i64,
    pub previous_payable_paisa: i64,
    pub new_payable_paisa: i64,
    pub journal_entry_id: i64,
}

// ----------------------------------------------------------------------------
// Operating Expenses
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordExpenseDto {
    pub expense_date: Option<String>,
    pub account_id: i64,
    pub amount_paisa: i64,
    pub payment_mode: String, // "CASH" or "BANK"
    pub bank_account_id: Option<i64>,
    pub recipient_name: Option<String>,
    pub description: String,
    pub reference_number: Option<String>,
    pub receipt_ref_no: Option<String>,
    pub trip_id: Option<i64>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordExpenseResult {
    pub expense_id: i64,
    pub expense_number: String,
    pub account_id: i64,
    pub amount_paisa: i64,
    pub journal_entry_id: i64,
    pub cash_book_id: Option<i64>,
    pub bank_transaction_id: Option<i64>,
    pub new_balance_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpenseListItemDto {
    pub id: i64,
    pub expense_number: String,
    pub expense_date: String,
    pub account_id: i64,
    pub account_code: i64,
    pub account_name: String,
    pub amount_paisa: i64,
    pub amount: f64,
    pub payment_mode: String,
    pub recipient_name: Option<String>,
    pub description: String,
    pub receipt_ref_no: Option<String>,
    pub is_locked: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpenseCategoryBreakdownDto {
    pub account_id: i64,
    pub account_code: i64,
    pub account_name: String,
    pub total_amount_paisa: i64,
    pub count: usize,
    pub percentage_of_total: f64,
}

// ----------------------------------------------------------------------------
// Cash Book
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordCashBookEntryDto {
    pub entry_date: String,
    pub transaction_type: String,
    pub voucher_ref_type: String,
    pub voucher_ref_id: i64,
    pub voucher_ref_number: Option<String>,
    pub account_id: Option<i64>,
    pub account_code: Option<String>,
    pub particulars: String,
    pub description: String,
    pub cash_in_paisa: i64,
    pub cash_out_paisa: i64,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashBookEntryDto {
    pub id: i64,
    pub entry_date: String,
    pub entry_time: String,
    pub transaction_type: String,
    pub voucher_ref_type: String,
    pub voucher_ref_id: i64,
    pub voucher_ref_number: Option<String>,
    pub account_code: String,
    pub particulars: String,
    pub description: String,
    pub cash_in_paisa: i64,
    pub cash_out_paisa: i64,
    pub running_balance_paisa: i64,
    pub is_locked: bool,
    pub created_by_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashBookStatementDto {
    pub start_date: String,
    pub end_date: String,
    pub opening_balance_paisa: i64,
    pub total_cash_in_paisa: i64,
    pub total_cash_out_paisa: i64,
    pub net_cash_flow_paisa: i64,
    pub closing_balance_paisa: i64,
    pub entries: Vec<CashBookEntryDto>,
}

// ----------------------------------------------------------------------------
// Bank Accounts & Transfers & BRS
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BankAccountDto {
    pub id: i64,
    pub bank_name: String,
    pub account_number: String,
    pub account_title: String,
    pub branch: Option<String>,
    pub iban: Option<String>,
    pub current_balance_paisa: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BankTransferRequestDto {
    pub direction: String, // "CASH_TO_BANK" or "BANK_TO_CASH"
    pub bank_account_id: i64,
    pub transfer_date: String,
    pub amount_paisa: i64,
    pub instrument_type: Option<String>,
    pub instrument_number: Option<String>,
    pub particulars: String,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BankTransactionDto {
    pub id: i64,
    pub bank_account_id: i64,
    pub bank_name: String,
    pub account_number: String,
    pub transaction_date: String,
    pub transaction_type: String,
    pub instrument_type: String,
    pub instrument_number: Option<String>,
    pub particulars: String,
    pub deposit_paisa: i64,
    pub withdrawal_paisa: i64,
    pub running_balance_paisa: i64,
    pub is_cleared: bool,
    pub clearance_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BankReconciliationReportDto {
    pub bank_account_id: i64,
    pub bank_name: String,
    pub account_number: String,
    pub as_of_date: String,
    pub book_balance_paisa: i64,
    pub cleared_balance_paisa: i64,
    pub uncleared_deposits_count: usize,
    pub uncleared_deposits_paisa: i64,
    pub unpresented_withdrawals_count: usize,
    pub unpresented_withdrawals_paisa: i64,
    pub reconciled_statement_balance_paisa: i64,
    pub uncleared_transactions: Vec<BankTransactionDto>,
}

// ----------------------------------------------------------------------------
// COGS, Revenue & Profit and Loss
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevenueStatementDto {
    pub gross_sales_paisa: i64,
    pub total_discounts_paisa: i64,
    pub total_sales_returns_paisa: i64,
    pub net_sales_revenue_paisa: i64,
    pub delivery_service_income_paisa: i64,
    pub total_operating_revenue_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CogsStatementDto {
    pub beverage_material_cost_paisa: i64,
    pub inward_freight_cost_paisa: i64,
    pub unloading_labor_cost_paisa: i64,
    pub total_cogs_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfitAndLossStatementDto {
    pub period_start: String,
    pub period_end: String,
    pub revenue: RevenueStatementDto,
    pub cogs: CogsStatementDto,
    pub gross_profit_paisa: i64,
    pub gross_margin_percent: f64,
    pub operating_expenses: Vec<ExpenseCategoryBreakdownDto>,
    pub total_operating_expenses_paisa: i64,
    pub expense_to_revenue_ratio: f64,
    pub net_operating_profit_paisa: i64,
    pub net_margin_percent: f64,
    pub isolated_deposit_liability_paisa: i64,
    pub isolated_owner_capital_injections_paisa: i64,
}

// ----------------------------------------------------------------------------
// Trial Balance
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrialBalanceAccountItemDto {
    pub account_id: i64,
    pub account_code: i64,
    pub account_name: String,
    pub account_type: String,
    pub total_debit_paisa: i64,
    pub total_credit_paisa: i64,
    pub net_balance_paisa: i64,
    pub balance_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrialBalanceReportDto {
    pub as_of_date: String,
    pub accounts: Vec<TrialBalanceAccountItemDto>,
    pub total_debits_paisa: i64,
    pub total_credits_paisa: i64,
    pub is_balanced: bool,
}

// ============================================================================
// LOGISTICS & VEHICLE DISPATCH DTOs (FEATURE 15)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRouteDto {
    pub route_code: String,
    pub route_name: String,
    pub description: Option<String>,
    pub default_driver_id: Option<i64>,
    pub default_vehicle_id: Option<i64>,
    pub default_vehicle_no: Option<String>,
    pub start_time: Option<String>,
    pub target_daily_sales_paisa: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRouteDto {
    pub route_name: String,
    pub description: Option<String>,
    pub default_driver_id: Option<i64>,
    pub default_vehicle_id: Option<i64>,
    pub default_vehicle_no: Option<String>,
    pub start_time: Option<String>,
    pub target_daily_sales_paisa: Option<i64>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteDto {
    pub id: i64,
    pub route_code: String,
    pub route_name: String,
    pub description: Option<String>,
    pub default_driver_id: Option<i64>,
    pub default_driver_name: Option<String>,
    pub default_vehicle_id: Option<i64>,
    pub default_vehicle_no: Option<String>,
    pub start_time: Option<String>,
    pub target_daily_sales_paisa: i64,
    pub customer_count: i64,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVehicleDto {
    pub vehicle_number: String,
    pub model: String,
    pub capacity_crates: i64,
    pub capacity_weight_kg: f64,
    pub default_driver_id: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateVehicleDto {
    pub model: String,
    pub capacity_crates: i64,
    pub capacity_weight_kg: f64,
    pub default_driver_id: Option<i64>,
    pub current_odometer_km: i64,
    pub is_active: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VehicleDto {
    pub id: i64,
    pub vehicle_number: String,
    pub model: String,
    pub capacity_crates: i64,
    pub capacity_weight_kg: f64,
    pub default_driver_id: Option<i64>,
    pub default_driver_name: Option<String>,
    pub stock_location_id: Option<i64>,
    pub current_odometer_km: i64,
    pub is_active: bool,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadingItemInput {
    pub product_id: i64,
    pub pack_qty: i64,
    pub loose_qty: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateLoadingSheetDto {
    pub route_id: i64,
    pub sheet_date: Option<String>,
    pub vehicle_id: Option<i64>,
    pub vehicle_number: Option<String>,
    pub driver_id: Option<i64>,
    pub driver_name: Option<String>,
    pub helper_name: Option<String>,
    pub opening_km: Option<i64>,
    pub empty_crates_loaded: Option<i64>,
    pub items: Vec<LoadingItemInput>,
    pub notes: Option<String>,
    pub created_by: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueLoadingSheetDto {
    pub sheet_id: i64,
    pub departure_time: Option<String>,
    pub opening_km: Option<i64>,
    pub empty_crates_loaded: Option<i64>,
    pub morning_dispatcher_id: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueLoadingSheetResult {
    pub sheet_id: i64,
    pub sheet_number: String,
    pub status: String,
    pub dispatched_at: String,
    pub departure_time: String,
    pub total_products_loaded: usize,
    pub total_base_units_loaded: i64,
    pub total_crates_loaded: i64,
    pub total_load_cost_paisa: i64,
    pub total_load_retail_paisa: i64,
    pub stock_movements_recorded: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadingSheetItemDto {
    pub id: i64,
    pub sheet_id: i64,
    pub product_id: i64,
    pub product_sku: String,
    pub product_name: String,
    pub pack_unit_name: String,
    pub base_unit_name: String,
    pub units_per_pack: i64,
    pub loaded_packs: i64,
    pub loaded_loose: i64,
    pub total_loaded_base: i64,
    pub unit_cost_paisa: i64,
    pub unit_price_paisa: i64,
    pub line_cost_paisa: i64,
    pub line_retail_paisa: i64,
    pub sold_base: i64,
    pub returned_packs: i64,
    pub returned_loose: i64,
    pub total_returned_base: i64,
    pub breakage_base: i64,
    pub variance_base: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadingSheetDetailDto {
    pub id: i64,
    pub sheet_number: String,
    pub trip_code: Option<String>,
    pub sheet_date: String,
    pub route_id: i64,
    pub route_name: String,
    pub route_code: String,
    pub vehicle_id: Option<i64>,
    pub vehicle_number: String,
    pub vehicle_model: Option<String>,
    pub vehicle_capacity_crates: Option<i64>,
    pub driver_id: Option<i64>,
    pub driver_name: String,
    pub helper_name: Option<String>,
    pub status: String,
    pub dispatched_at: Option<String>,
    pub departure_time: Option<String>,
    pub returned_at: Option<String>,
    pub opening_km: Option<i64>,
    pub closing_km: Option<i64>,
    pub empty_crates_loaded: i64,
    pub total_load_cost_paisa: i64,
    pub total_load_retail_paisa: i64,
    pub expected_cash_paisa: i64,
    pub actual_cash_paisa: i64,
    pub cash_variance_paisa: i64,
    pub empty_crates_expected: i64,
    pub empty_crates_returned: i64,
    pub crates_variance: i64,
    pub notes: Option<String>,
    pub settlement_notes: Option<String>,
    pub created_by: Option<i64>,
    pub morning_dispatcher_id: Option<i64>,
    pub settled_by: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub items: Vec<LoadingSheetItemDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadingSheetSummaryDto {
    pub id: i64,
    pub sheet_number: String,
    pub sheet_date: String,
    pub route_id: i64,
    pub route_name: String,
    pub vehicle_number: String,
    pub driver_name: String,
    pub status: String,
    pub total_items_count: usize,
    pub total_loaded_base: i64,
    pub empty_crates_loaded: i64,
    pub total_load_retail_paisa: i64,
    pub dispatched_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LoadingSheetFilterDto {
    pub route_id: Option<i64>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub status: Option<String>,
    pub vehicle_number: Option<String>,
    pub driver_id: Option<i64>,
}

// ============================================================================
// SETTLEMENT & RETURNS DTOs (FEATURE 16)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VanSettlementReturnItemDto {
    pub product_id: i64,
    pub returned_packs: i64,
    pub returned_loose: i64,
    pub breakage_base: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalculateSettlementRequestDto {
    pub sheet_id: i64,
    pub settlement_date: Option<String>,
    pub returns: Vec<VanSettlementReturnItemDto>,
    pub actual_cash_paisa: i64,
    pub empty_crates_returned: i32,
    pub route_expenses_paisa: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockReconciliationLineDto {
    pub product_id: i64,
    pub product_name: String,
    pub sku_code: String,
    pub units_per_pack: i64,
    pub loaded_packs: i64,
    pub loaded_loose: i64,
    pub total_loaded_base: i64,
    pub sold_base: i64,
    pub returned_packs: i64,
    pub returned_loose: i64,
    pub total_returned_base: i64,
    pub breakage_base: i64,
    pub expected_return_base: i64,
    pub variance_base: i64,
    pub unit_rate_paisa: i64,
    pub shortage_value_paisa: i64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementReconciliationDto {
    pub sheet_id: i64,
    pub sheet_number: String,
    pub route_id: i64,
    pub route_name: String,
    pub driver_id: i64,
    pub driver_name: String,
    pub vehicle_number: String,
    pub settlement_date: String,
    pub stock_items: Vec<StockReconciliationLineDto>,
    pub total_stock_variance_base: i64,
    pub total_stock_shortage_value_paisa: i64,
    pub route_cash_sales_paisa: i64,
    pub route_credit_sales_paisa: i64,
    pub route_recoveries_collected_paisa: i64,
    pub route_crate_deposits_collected_paisa: i64,
    pub route_expenses_deducted_paisa: i64,
    pub expected_cash_paisa: i64,
    pub actual_cash_paisa: i64,
    pub cash_variance_paisa: i64,
    pub cash_variance_type: String,
    pub empty_crates_expected: i32,
    pub empty_crates_returned: i32,
    pub crates_variance: i32,
    pub crate_penalty_rate_paisa: i64,
    pub crate_shortage_value_paisa: i64,
    pub total_driver_shortage_liability_paisa: i64,
    pub is_balanced: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitVanSettlementDto {
    pub sheet_id: i64,
    pub settlement_date: String,
    pub closing_km: Option<i32>,
    pub returns: Vec<VanSettlementReturnItemDto>,
    pub actual_cash_paisa: i64,
    pub empty_crates_returned: i32,
    pub route_expenses_paisa: Option<i64>,
    pub settlement_notes: Option<String>,
    pub shortage_action: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VanSettlementResultDto {
    pub sheet_id: i64,
    pub sheet_number: String,
    pub settlement_id: i64,
    pub status: String,
    pub settled_at: String,
    pub cash_book_entry_id: Option<i64>,
    pub shortage_journal_entry_id: Option<i64>,
    pub cashier_journal_entry_id: Option<i64>,
    pub restocked_items_count: usize,
    pub empty_crates_restocked: i32,
    pub cash_variance_paisa: i64,
    pub total_stock_variance_base: i64,
    pub total_shortage_paisa: i64,
}

// ============================================================================
// AUDIT & AUTH DTOs (FEATURES 18 & 19)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogEntryDto {
    pub id: i64,
    pub timestamp: String,
    pub user_id: Option<i64>,
    pub username: String,
    pub action: String,
    pub entity_type: String,
    pub entity_id: String,
    pub old_values_json: Option<String>,
    pub new_values_json: Option<String>,
    pub reason: Option<String>,
    pub ip_address: Option<String>,
    pub machine_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuditLogFilterDto {
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub action: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub user_id: Option<i64>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogResponseDto {
    pub total_count: usize,
    pub logs: Vec<AuditLogEntryDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinLoginRequest {
    pub pin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialsLoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSessionDto {
    pub session_token: String,
    pub user_id: i64,
    pub username: String,
    pub full_name: String,
    pub role: crate::domain::rbac::Role,
    pub permissions: Vec<crate::domain::rbac::Action>,
    pub logged_in_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminOverrideRequest {
    pub admin_pin: String,
    pub action_type: String,
    pub context_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminOverrideResult {
    pub authorized: bool,
    pub admin_user_id: i64,
    pub admin_name: String,
    pub audit_log_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserDto {
    pub id: i64,
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub phone: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveUserDto {
    pub id: Option<i64>,
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub phone: Option<String>,
    pub pin_code: Option<String>,
    pub password: Option<String>,
    pub is_active: bool,
    pub updated_by: i64,
}


