export type PaymentType = "CASH" | "CREDIT" | "SPLIT" | "BANK";
export type InvoiceStatus = "PAID" | "PARTIAL" | "UNPAID" | "CANCELLED";
export type ReturnCondition = "SALABLE" | "DAMAGED";
export type RefundMode = "CREDIT_NOTE" | "CASH" | "BANK";
export type VarianceType = "BALANCED" | "SHORTAGE" | "EXCESS";

// ============================================================================
// SALES INVOICING TYPES
// ============================================================================

export interface CreateSalesInvoiceItemDto {
  product_id: number;
  pack_qty: number;
  loose_qty: number;
  unit_price_paisa?: number;
  line_discount_paisa?: number;
}

export interface CreateSalesInvoiceDto {
  customer_id: number;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  delivery_sheet_id?: number;
  trip_id?: number;
  items: CreateSalesInvoiceItemDto[];
  invoice_discount_paisa?: number;
  crate_deposit_charged_paisa?: number;
  payment_type: PaymentType;
  paid_amount_paisa?: number;
  crates_issued?: number;
  crates_returned?: number;
  admin_override_pin?: string;
  user_id?: number;
}

export interface SalesInvoiceItemReceiptDto {
  product_id: number;
  product_name: String;
  sku_code: string;
  packaging_name: string;
  units_per_pack: number;
  pack_qty: number;
  loose_qty: number;
  total_base_units: number;
  unit_price_paisa: number;
  line_discount_paisa: number;
  line_total_paisa: number;
  cogs_total_paisa: number;
}

export interface SalesInvoiceReceiptDto {
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer_id: number;
  customer_name: string;
  shop_name: string;
  customer_phone: string;
  items: SalesInvoiceItemReceiptDto[];
  subtotal_paisa: number;
  discount_paisa: number;
  crate_deposit_charged_paisa: number;
  net_total_paisa: number;
  paid_amount_paisa: number;
  due_amount_paisa: number;
  payment_type: PaymentType;
  status: InvoiceStatus;
  previous_customer_balance_paisa: number;
  new_customer_balance_paisa: number;
  crates_issued: number;
  crates_returned: number;
  previous_crate_balance: number;
  new_crate_balance: number;
  sales_journal_entry_id: number;
  cogs_journal_entry_id: number;
  cash_book_entry_id?: number;
  formatted_thermal_receipt: string;
}

export interface SalesInvoiceListItemDto {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  invoice_date: string;
  net_total_paisa: number;
  paid_amount_paisa: number;
  due_amount_paisa: number;
  payment_type: string;
  status: string;
  crates_issued: number;
  crates_returned: number;
  is_cancelled: boolean;
  is_locked: boolean;
  created_at: string;
}

export interface CreditStatusCheckResult {
  customer_id: number;
  customer_name: string;
  credit_limit_paisa: number;
  current_balance_paisa: number;
  attempted_credit_paisa: number;
  total_exposure_paisa: number;
  utilization_percentage: number;
  is_warning: boolean;
  is_breached: boolean;
  status: "ACTIVE" | "WARNING" | "BLOCKED" | string;
}

// ============================================================================
// PURCHASES (LANDED COST) TYPES
// ============================================================================

export interface PurchaseItemInputDto {
  product_id: number;
  pack_qty: number;
  loose_qty: number;
  unit_cost_paisa: number;
}

export interface RecordPurchaseDto {
  supplier_id: number;
  invoice_no: string;
  supplier_invoice_no?: string;
  purchase_date: string;
  items: PurchaseItemInputDto[];
  freight_paisa?: number;
  unloading_labor_paisa?: number;
  transit_tax_paisa?: number;
  payment_status: "PAID" | "PARTIAL" | "UNPAID" | string;
  payment_mode?: "CASH" | "CREDIT" | "BANK" | "SPLIT" | string;
  paid_amount_paisa?: number;
  empty_crates_returned_to_factory?: number;
  notes?: string;
  user_id?: number;
}

export interface RecordPurchaseResult {
  purchase_id: number;
  purchase_number: string;
  base_invoice_cost_paisa: number;
  total_landed_cost_paisa: number;
  paid_amount_paisa: number;
  due_amount_paisa: number;
  new_supplier_payable_paisa: number;
  journal_entry_id: number;
}

export interface LandedCostAllocatedItemDto {
  product_id: number;
  product_name: string;
  units_per_pack: number;
  pack_qty: number;
  loose_qty: number;
  total_base_units: number;
  base_goods_total_paisa: number;
  allocated_landed_cost_paisa: number;
  final_unit_landed_cost_paisa: number;
  final_pack_landed_cost_paisa: number;
  line_total_paisa: number;
}

export interface LandedCostBreakdownDto {
  base_goods_total_paisa: number;
  freight_paisa: number;
  unloading_labor_paisa: number;
  transit_tax_paisa: number;
  total_additional_costs_paisa: number;
  total_landed_cost_paisa: number;
  items: LandedCostAllocatedItemDto[];
}

export interface PurchaseInvoiceListItemDto {
  id: number;
  purchase_number: string;
  supplier_id: number;
  supplier_name: string;
  purchase_date: string;
  base_goods_paisa: number;
  freight_paisa: number;
  unloading_labor_paisa: number;
  total_landed_cost_paisa: number;
  paid_amount_paisa: number;
  due_amount_paisa: number;
  payment_status: string;
  is_locked: boolean;
  created_at: string;
}

// ============================================================================
// BILL CANCELLATION TYPES
// ============================================================================

export interface CancelInvoiceDto {
  invoice_id: number;
  reason: string;
  cancelled_by: number;
  admin_pin?: string;
}

export interface CancelInvoiceResult {
  success: boolean;
  invoice_id: number;
  invoice_number: string;
  restored_stock_items: number;
  refunded_cash_paisa: number;
  credited_receivable_paisa: number;
  reversed_crates_count: number;
  audit_log_id: number;
  cancelled_at: string;
}

// ============================================================================
// SALES RETURNS TYPES
// ============================================================================

export interface ReturnItemDto {
  product_id: number;
  base_units: number;
  refund_rate_paisa: number;
  condition: ReturnCondition;
}

export interface RecordSalesReturnDto {
  invoice_id?: number;
  customer_id: number;
  items: ReturnItemDto[];
  refund_mode: RefundMode;
  reason: string;
  crates_returned_by_customer?: number;
  authorized_by?: number;
}

export interface SalesReturnResult {
  return_id: number;
  return_number: string;
  total_return_paisa: number;
  refund_mode: string;
  salable_units_restocked: number;
  damaged_units_logged: number;
  new_customer_balance_paisa: number;
}

export interface SalesReturnListItemDto {
  id: number;
  return_number: string;
  invoice_id?: number;
  customer_id: number;
  customer_name: string;
  return_date: string;
  total_return_paisa: number;
  refund_mode: string;
  reason: string;
  created_at: string;
}

// ============================================================================
// DAILY CLOSING TYPES
// ============================================================================

export interface DenominationCountsDto {
  note_5000: number;
  note_1000: number;
  note_500: number;
  note_100: number;
  note_50: number;
  note_20: number;
  note_10: number;
  coin_10: number;
  coin_5: number;
  coin_2: number;
  coin_1: number;
}

export interface CashInBreakdownDto {
  pos_cash_sales_paisa: number;
  route_cash_collections_paisa: number;
  customer_recoveries_paisa: number;
  crate_deposits_paisa: number;
  other_cash_in_paisa: number;
  total_cash_in_paisa: number;
}

export interface CashOutBreakdownDto {
  supplier_payments_paisa: number;
  cash_purchases_paisa: number;
  expenses_paid_paisa: number;
  deposit_refunds_paisa: number;
  bank_deposits_paisa: number;
  owner_drawings_paisa: number;
  total_cash_out_paisa: number;
}

export interface SalesDayStatisticsDto {
  total_invoices_count: number;
  total_sales_invoiced_paisa: number;
  total_cash_sales_paisa: number;
  total_credit_sales_paisa: number;
  total_crates_issued: number;
  total_crates_collected: number;
}

export interface DailyClosingSummaryDto {
  closing_date: string;
  opening_cash_paisa: number;
  is_already_closed: boolean;
  existing_closing_id?: number;
  cash_in: CashInBreakdownDto;
  cash_out: CashOutBreakdownDto;
  expected_closing_cash_paisa: number;
  sales_stats: SalesDayStatisticsDto;
}

export interface SubmitClosingDto {
  closing_date: string;
  physical_denominations: DenominationCountsDto;
  variance_reason?: string;
  admin_pin?: string;
  user_id?: number;
}

export interface SubmitClosingResult {
  closing_id: number;
  closing_date: string;
  opening_cash_paisa: number;
  expected_closing_cash_paisa: number;
  physical_closing_cash_paisa: number;
  variance_paisa: number;
  variance_type: VarianceType;
  variance_journal_entry_id?: number;
  locked_invoices_count: number;
  status: string;
  closed_at: string;
}

export interface DailyClosingHistoryItemDto {
  id: number;
  closing_date: string;
  opening_cash_paisa: number;
  total_cash_in_paisa: number;
  total_cash_out_paisa: number;
  expected_closing_cash_paisa: number;
  physical_closing_cash_paisa: number;
  variance_paisa: number;
  status: string;
  is_locked: boolean;
  closed_by_name?: string;
  closed_at: string;
}
