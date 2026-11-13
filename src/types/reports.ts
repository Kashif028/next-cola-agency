import { Paisa } from "./ipc";

export type ReportCategory =
  | "sales"
  | "ledger"
  | "credit"
  | "financial"
  | "inventory"
  | "empties"
  | "logistics"
  | "audit";

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  format?: "text" | "currency" | "integer" | "decimal" | "percentage" | "badge" | "date" | "datetime";
  width?: string;
}

export interface ReportSummaryKpi {
  label: string;
  value: string | number;
  format?: "text" | "currency" | "integer" | "percentage";
  trend?: "up" | "down" | "neutral";
  color?: string;
}

export interface ReportMetadata {
  id: string; // e.g. "REP-01"
  name: string;
  category: ReportCategory;
  categoryName: string;
  description: string;
  columns: ReportColumn[];
  defaultDateFilter?: "today" | "this_month" | "all" | "as_of_today";
  filterFields?: ("date" | "date_range" | "route" | "customer" | "supplier" | "product" | "brand" | "payment_mode")[];
}

export interface ReportFilterParams {
  date?: string;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  routeId?: number;
  customerId?: number;
  supplierId?: number;
  productId?: number;
  brand?: string;
  paymentMode?: string;
  riskStatus?: string;
  limit?: number;
}

// -------------------------------------------------------------
// Report Data Transfer Objects
// -------------------------------------------------------------

export interface DailySalesSummaryDto {
  invoice_number: string;
  sale_time: string;
  customer_name: string;
  route_name: string;
  packs_loose_sold: string;
  total_base_units: number;
  gross_total_paisa: Paisa;
  discount_paisa: Paisa;
  net_total_paisa: Paisa;
  paid_cash_paisa: Paisa;
  due_udhaar_paisa: Paisa;
  billed_by: string;
}

export interface SalesTrendsDto {
  period_label: string;
  invoice_count: number;
  total_cartons: number;
  total_loose: number;
  total_base_units: number;
  gross_revenue_paisa: Paisa;
  trade_discounts_paisa: Paisa;
  net_revenue_paisa: Paisa;
  avg_ticket_size_paisa: Paisa;
  cash_ratio_percent: number;
  credit_ratio_percent: number;
}

export interface ProductSalesDto {
  sku_code: string;
  product_name: string;
  pack_specification: string;
  packs_sold: number;
  loose_sold: number;
  total_base_units: number;
  avg_rate_paisa: Paisa;
  total_revenue_paisa: Paisa;
  volume_share_percent: number;
}

export interface CustomerSalesSummaryDto {
  customer_code: string;
  shop_name: string;
  route_name: string;
  order_count: number;
  cartons_purchased: number;
  bottles_purchased: number;
  total_purchases_paisa: Paisa;
  cash_paid_paisa: Paisa;
  credit_billed_paisa: Paisa;
  current_balance_paisa: Paisa;
}

export interface SalesmanPerformanceDto {
  driver_name: string;
  assigned_route: string;
  trips_count: number;
  visited_shops: number;
  billed_shops: number;
  strike_rate: number;
  cartons_sold: number;
  billed_value_paisa: Paisa;
  route_cash_collected_paisa: Paisa;
  udhaar_recoveries_paisa: Paisa;
  total_cash_inflow_paisa: Paisa;
}

export interface SalesReturnListItemDto {
  voucher_number: string;
  invoice_ref: string;
  timestamp: string;
  customer_name: string;
  product_name: string;
  return_qty: string;
  value_reversed_paisa: Paisa;
  condition: "SALABLE" | "DAMAGED";
  reason: string;
  authorized_by: string;
}

export interface CustomerLedgerEntryDto {
  entry_date: string;
  voucher_number: string;
  voucher_type: "SALE" | "RECOVERY" | "RETURN" | "ADJUSTMENT" | string;
  description: string;
  debit_paisa: Paisa;
  credit_paisa: Paisa;
  running_balance_paisa: Paisa;
}

export interface CustomerLedgerStatementDto {
  customer_id: number;
  customer_name: string;
  shop_name: string;
  route_name: string;
  phone: string;
  credit_limit_paisa: Paisa;
  opening_balance_paisa: Paisa;
  total_debits_paisa: Paisa;
  total_credits_paisa: Paisa;
  closing_balance_paisa: Paisa;
  entries: CustomerLedgerEntryDto[];
}

export interface CustomerBalanceSummaryDto {
  customer_code: string;
  shop_name: string;
  owner_name: string;
  route_name: string;
  phone: string;
  credit_limit_paisa: Paisa;
  opening_balance_paisa: Paisa;
  period_sales_paisa: Paisa;
  period_recoveries_paisa: Paisa;
  closing_balance_paisa: Paisa;
  limit_utilization_percent: number;
}

export interface SupplierLedgerEntryDto {
  entry_date: string;
  voucher_number: string;
  voucher_type: "PURCHASE" | "PAYMENT" | "RETURN" | string;
  particulars: string;
  debit_paisa: Paisa;
  credit_paisa: Paisa;
  running_payable_paisa: Paisa;
}

export interface SupplierLedgerStatementDto {
  supplier_id: number;
  supplier_name: string;
  company_name: string;
  contact_person: string;
  phone: string;
  opening_payable_paisa: Paisa;
  total_purchases_paisa: Paisa;
  total_payments_paisa: Paisa;
  closing_payable_paisa: Paisa;
  entries: SupplierLedgerEntryDto[];
}

export interface SupplierBalanceSummaryDto {
  supplier_code: string;
  company_name: string;
  supplier_type: string;
  contact_person: string;
  opening_payable_paisa: Paisa;
  inward_purchases_paisa: Paisa;
  payments_made_paisa: Paisa;
  closing_payable_paisa: Paisa;
}

export interface CustomerAgingBucketDto {
  customer_id: number;
  customer_name: string;
  shop_name: string;
  route_name: string;
  phone: string;
  total_outstanding_paisa: Paisa;
  bucket_0_7_paisa: Paisa;
  bucket_8_15_paisa: Paisa;
  bucket_16_30_paisa: Paisa;
  bucket_31_60_paisa: Paisa;
  bucket_60_plus_paisa: Paisa;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "DEFAULT";
}

export interface AgencyUdhaarAgingReportDto {
  as_of_date: string;
  total_receivables_paisa: Paisa;
  total_current_0_7_paisa: Paisa;
  total_overdue_8_15_paisa: Paisa;
  total_overdue_16_30_paisa: Paisa;
  total_overdue_31_60_paisa: Paisa;
  total_critical_60_plus_paisa: Paisa;
  customers: CustomerAgingBucketDto[];
}

export interface CreditRiskAnalysisDto {
  shop_name: string;
  owner_name: string;
  route_name: string;
  phone: string;
  credit_limit_paisa: Paisa;
  current_balance_paisa: Paisa;
  available_credit_paisa: Paisa;
  breach_amount_paisa: Paisa;
  utilization_percent: number;
  status: "SAFE" | "WARNING" | "LOCKED";
}

export interface RecoverySummaryDto {
  receipt_number: string;
  receipt_date: string;
  customer_name: string;
  route_name: string;
  collector_name: string;
  payment_mode: string;
  instrument_ref: string;
  recovered_amount_paisa: Paisa;
  previous_balance_paisa: Paisa;
  remaining_balance_paisa: Paisa;
  allocation_mode: string;
}

export interface CashBookEntryDto {
  entry_time: string;
  voucher_number: string;
  particulars: string;
  category: "CASH_SALE" | "RECOVERY" | "EXPENSE" | "SUPPLIER_PAYMENT" | "BANK_DEPOSIT" | string;
  description: string;
  cash_in_paisa: Paisa;
  cash_out_paisa: Paisa;
  running_balance_paisa: Paisa;
}

export interface CashBookStatementDto {
  start_date: string;
  end_date: string;
  opening_balance_paisa: Paisa;
  total_cash_in_paisa: Paisa;
  total_cash_out_paisa: Paisa;
  closing_balance_paisa: Paisa;
  entries: CashBookEntryDto[];
}

export interface BankReconciliationEntryDto {
  transaction_date: string;
  bank_name: string;
  instrument_type: string;
  instrument_number: string;
  particulars: string;
  deposit_paisa: Paisa;
  withdrawal_paisa: Paisa;
  running_balance_paisa: Paisa;
  is_cleared: boolean;
  clearance_date?: string | null;
}

export interface BankReconciliationReportDto {
  bank_account_id: number;
  bank_name: string;
  account_number: string;
  as_of_date: string;
  book_balance_paisa: Paisa;
  cleared_balance_paisa: Paisa;
  uncleared_deposits_paisa: Paisa;
  unpresented_cheques_paisa: Paisa;
  reconciled_statement_balance_paisa: Paisa;
  entries: BankReconciliationEntryDto[];
}

export interface ExpenseListItemDto {
  expense_number: string;
  expense_time: string;
  account_name: string;
  recipient_name: string;
  description: string;
  payment_mode: string;
  receipt_ref_no: string;
  amount_paisa: Paisa;
}

export interface MonthlyExpenseSummaryDto {
  period_label: string;
  total_overhead_paisa: Paisa;
  categories: {
    account_code: number;
    account_name: string;
    voucher_count: number;
    total_spent_paisa: Paisa;
    share_of_total_percent: number;
    daily_average_paisa: Paisa;
  }[];
}

export interface ProfitAndLossStatementDto {
  start_date: string;
  end_date: string;
  gross_sales_paisa: Paisa;
  trade_discounts_paisa: Paisa;
  sales_returns_paisa: Paisa;
  net_sales_revenue_paisa: Paisa;
  cogs_material_paisa: Paisa;
  cogs_freight_paisa: Paisa;
  cogs_unloading_paisa: Paisa;
  total_cogs_paisa: Paisa;
  gross_profit_paisa: Paisa;
  gross_margin_percent: number;
  operating_expenses: {
    account_name: string;
    amount_paisa: Paisa;
  }[];
  total_operating_expenses_paisa: Paisa;
  net_operating_profit_paisa: Paisa;
  net_margin_percent: number;
  crate_deposit_liabilities_paisa: Paisa;
  capital_additions_paisa: Paisa;
}

export interface StockItemOverviewDto {
  sku_code: string;
  product_name: string;
  pack_unit_name: string;
  units_per_pack: number;
  current_packs: number;
  current_loose: number;
  total_base_units: number;
  cost_per_pack_paisa: Paisa;
  valuation_at_cost_paisa: Paisa;
  wholesale_rate_paisa: Paisa;
  valuation_at_wholesale_paisa: Paisa;
  stock_health: "OPTIMAL" | "LOW" | "CRITICAL";
}

export interface StockBinCardEntryDto {
  entry_date: string;
  voucher_type: string;
  voucher_ref: string;
  inward_packs: number;
  inward_loose: number;
  outward_packs: number;
  outward_loose: number;
  net_base_delta: number;
  running_stock_base: number;
  performed_by: string;
}

export interface StockBinCardDto {
  product_id: number;
  sku_code: string;
  product_name: string;
  units_per_pack: number;
  opening_stock_base: number;
  closing_stock_base: number;
  entries: StockBinCardEntryDto[];
}

export interface LowStockAlertDto {
  sku_code: string;
  product_name: string;
  current_stock_packs: number;
  min_reorder_level_packs: number;
  daily_velocity_packs: number;
  days_stock_remaining: number;
  suggested_order_packs: number;
  supplier_name: string;
}

export interface InventoryVelocityDto {
  sku_code: string;
  product_name: string;
  avg_stock_held_packs: number;
  total_packs_sold: number;
  inventory_turnover_ratio: number;
  days_sales_inventory: number;
  gross_profit_generated_paisa: Paisa;
  classification: "FAST" | "STEADY" | "SLOW" | "DEAD";
}

export interface CrateSummaryItemDto {
  crate_type_name: string;
  warehouse_crates_count: number;
  van_crates_count: number;
  market_debt_crates_count: number;
  factory_owed_crates_count: number;
  net_agency_crate_position: number;
  total_deposit_liability_paisa: Paisa;
}

export interface EmptiesOverviewDto {
  as_of_date: string;
  total_yard_crates: number;
  total_market_debt_crates: number;
  total_deposit_liabilities_paisa: Paisa;
  items: CrateSummaryItemDto[];
}

export interface CustomerCrateLedgerDto {
  entry_date: string;
  voucher_number: string;
  description: string;
  crates_issued: number;
  crates_returned: number;
  running_crate_balance: number;
  deposit_liability_paisa: Paisa;
}

export interface SupplierCrateSettlementDto {
  dispatch_date: string;
  gate_pass_number: string;
  vehicle_number: string;
  crate_type: string;
  crates_dispatched: number;
  factory_ack_number: string;
  factory_rejected_broken: number;
  net_accepted_by_factory: number;
  running_crates_owed_factory: number;
}

export interface BreakageLogDto {
  breakage_number: string;
  incident_date: string;
  sku_code: string;
  product_name: string;
  broken_base_units: number;
  broken_crates: number;
  unit_cost_paisa: Paisa;
  total_loss_paisa: Paisa;
  location: string;
  responsible_person: string;
  action_taken: "WRITTEN_OFF" | "STAFF_PENALTY";
}

export interface DailyClosingSummaryDto {
  closing_date: string;
  opening_cash_paisa: Paisa;
  pos_cash_sales_paisa: Paisa;
  route_van_cash_paisa: Paisa;
  customer_recoveries_paisa: Paisa;
  crate_deposits_received_paisa: Paisa;
  supplier_payments_paisa: Paisa;
  expenses_paid_paisa: Paisa;
  bank_deposits_paisa: Paisa;
  crate_refunds_paisa: Paisa;
  expected_cash_paisa: Paisa;
  physical_cash_paisa: Paisa;
  variance_paisa: Paisa;
  is_locked: boolean;
  notes?: string | null;
  denominations?: Record<string, number>;
}

export interface AuditLogItemDto {
  id: number;
  timestamp: string;
  username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values_json?: string | null;
  new_values_json?: string | null;
  reason?: string | null;
  machine_name?: string | null;
}

export interface AuditLogResponseDto {
  logs: AuditLogItemDto[];
  total_count: number;
}
