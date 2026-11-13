import { Paisa } from "./ipc";

// ============================================================================
// SYSTEM & DIAGNOSTIC INTERFACES
// ============================================================================

export interface BackupMetadata {
  backup_id: string;
  file_name: string;
  file_path: string;
  size_bytes: number;
  checksum_sha256: string;
  created_at: string;
  notes: string;
}

export interface DbStats {
  journal_mode: string;
  foreign_keys: boolean;
  page_size: number;
  page_count: number;
  total_size_bytes: number;
  active_connections: number;
  idle_connections: number;
}

// ============================================================================
// MODULE A: SYSTEM, CONFIGURATION & RBAC (Tables 1 - 4)
// ============================================================================

/** 1. schema_migrations */
export interface SchemaMigrationRow {
  id: number;
  version: number;
  name: string;
  applied_at: string;
  checksum: string;
  execution_time_ms: number;
}

/** 2. app_settings */
export interface AppSettingRow {
  id: number;
  key?: string | null;
  value?: string | null;
  category: "GENERAL" | "AGENCY" | "FINANCIAL" | "INVOICE" | "SYSTEM";
  description?: string | null;
  is_encrypted: number | boolean;
  agency_name: string;
  tagline?: string | null;
  address: string;
  phone: string;
  whatsapp?: string | null;
  ntn_strn?: string | null;
  invoice_prefix: string;
  default_crate_deposit: Paisa;
  default_credit_days: number;
  auto_backup_on_close: number | boolean;
  backup_dir: string;
  updated_at: string;
}

/** 3. users */
export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  salt: string;
  full_name: string;
  role: "ADMIN" | "ACCOUNTANT" | "SALESMAN" | "WAREHOUSE";
  phone?: string | null;
  pin_code?: string | null;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

/** 4. audit_logs */
export interface AuditLogRow {
  id: number;
  timestamp: string;
  user_id?: number | null;
  username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values_json?: string | null;
  new_values_json?: string | null;
  reason?: string | null;
  ip_address?: string | null;
  machine_name?: string | null;
}

// ============================================================================
// MODULE B: BEVERAGE PRODUCTS, PACKAGING & EMPTIES (Tables 5 - 9)
// ============================================================================

/** 5. products */
export interface ProductRow {
  id: number;
  sku_code: string;
  name: string;
  category_id?: number | null;
  brand: string;
  flavor?: string | null;
  volume_ml?: number | null;
  packaging_type: "RGB_GLASS" | "PET_PLASTIC" | "CAN_ALU" | "WATER_CARBOY";
  is_glass: number | boolean;
  requires_crate: number | boolean;
  base_unit_name: string;
  default_pack_name: string;
  pack_unit_name: string;
  units_per_pack: number;
  purchase_price_pack: Paisa;
  purchase_price_pack_paisa: Paisa;
  sale_price_pack: Paisa;
  sale_price_base: Paisa;
  wholesale_price_pack_paisa: Paisa;
  retail_price_pack_paisa: Paisa;
  retail_price_base_paisa: Paisa;
  crate_deposit_price: Paisa;
  crate_deposit_paisa: Paisa;
  bottle_deposit_price: Paisa;
  bottle_deposit_paisa: Paisa;
  stock_base_units: number;
  current_stock_base_units: number;
  empty_bottles_stock: number;
  empty_crates_stock: number;
  min_reorder_level_packs: number;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

/** 6. packaging_units */
export interface PackagingUnitRow {
  id: number;
  product_id: number;
  unit_name: string;
  multiplier_to_base: number;
  conversion_multiplier: number;
  is_base_unit: number | boolean;
  is_default_purchase_unit: number | boolean;
  is_default_sale_unit: number | boolean;
  barcode?: string | null;
  created_at: string;
}

/** 7. inventory_batches */
export interface InventoryBatchRow {
  id: number;
  product_id: number;
  purchase_invoice_id?: number | null;
  batch_number?: string | null;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  initial_base_units: number;
  remaining_base_units: number;
  unit_cost_paisa: Paisa;
  pack_cost_paisa: Paisa;
  created_at: string;
}

/** 8. empties_ledger */
export interface EmptiesLedgerRow {
  id: number;
  entity_type: "CUSTOMER" | "SUPPLIER" | "WAREHOUSE" | "VAN_ROUTE";
  entity_id: number;
  product_id?: number | null;
  entry_date: string;
  voucher_type: string;
  voucher_id?: number | null;
  voucher_number?: string | null;
  crates_out: number;
  crates_in: number;
  bottles_out: number;
  bottles_in: number;
  running_crates_balance: number;
  running_bottles_balance: number;
  notes?: string | null;
  created_by?: number | null;
  created_at: string;
}

/** 9. security_deposits */
export interface SecurityDepositRow {
  id: number;
  customer_id: number;
  deposit_date: string;
  voucher_type: string;
  voucher_id?: number | null;
  voucher_number?: string | null;
  crates_count: number;
  deposit_rate_per_crate_paisa: Paisa;
  deposit_in_paisa: Paisa;
  deposit_out_paisa: Paisa;
  running_deposit_liability_paisa: Paisa;
  account_id: number;
  payment_mode: string;
  notes?: string | null;
  created_by?: number | null;
  created_at: string;
}

// ============================================================================
// MODULE C: COMMERCIAL PARTIES, INVOICES & PROCUREMENTS (Tables 10 - 18)
// ============================================================================

/** 10. customers */
export interface CustomerRow {
  id: number;
  code: string;
  name: string;
  shop_name: string;
  owner_name?: string | null;
  phone: string;
  whatsapp?: string | null;
  address: string;
  route_id?: number | null;
  price_tier: "RETAIL" | "WHOLESALE" | "SPECIAL";
  credit_limit_amount: Paisa;
  credit_limit_paisa: Paisa;
  credit_limit_days: number;
  crate_limit: number;
  current_balance: Paisa;
  current_balance_paisa: Paisa;
  current_crate_balance: number;
  current_crates_balance: number;
  deposit_balance: Paisa;
  security_deposit_balance_paisa: Paisa;
  credit_status: "ACTIVE" | "WARNING" | "BLOCKED";
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

/** 11. suppliers */
export interface SupplierRow {
  id: number;
  code?: string | null;
  name: string;
  company_name: string;
  contact_person?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  supplier_type: "PRINCIPAL_BEVERAGE" | "FREIGHT_TRANSPORTER" | "LABOR_CONTRACTOR" | "GENERAL";
  current_payable: Paisa;
  current_payable_paisa: Paisa;
  crates_owed_to_company: number;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

/** 12. delivery_routes */
export interface DeliveryRouteRow {
  id: number;
  route_code: string;
  route_name: string;
  description?: string | null;
  default_driver_id?: number | null;
  default_vehicle_no?: string | null;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

/** 13. delivery_sheets */
export interface DeliverySheetRow {
  id: number;
  sheet_number: string;
  trip_code?: string | null;
  sheet_date: string;
  trip_date: string;
  route_id: number;
  driver_id?: number | null;
  driver_name: string;
  vehicle_number: string;
  status: "DISPATCHED" | "COMPLETED" | "SETTLED" | "AUDITED";
  dispatched_at: string;
  returned_at?: string | null;
  opening_km?: number | null;
  closing_km?: number | null;
  expected_cash_paisa: Paisa;
  actual_cash_paisa: Paisa;
  cash_variance_paisa: Paisa;
  empty_crates_expected: number;
  empty_crates_returned: number;
  crates_variance: number;
  settlement_notes?: string | null;
  notes?: string | null;
  settled_by?: number | null;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

/** 14. delivery_items */
export interface DeliveryItemRow {
  id: number;
  sheet_id: number;
  product_id: number;
  loaded_packs: number;
  loaded_loose: number;
  total_loaded_base: number;
  sold_base: number;
  returned_packs: number;
  returned_loose: number;
  total_returned_base: number;
  breakage_base: number;
  variance_base: number;
}

/** 15. sales_invoices */
export interface SalesInvoiceRow {
  id: number;
  invoice_number: string;
  customer_id: number;
  delivery_sheet_id?: number | null;
  trip_id?: number | null;
  invoice_date: string;
  due_date: string;
  subtotal_amount: Paisa;
  subtotal_paisa: Paisa;
  discount_amount: Paisa;
  discount_paisa: Paisa;
  tax_amount: Paisa;
  tax_paisa: Paisa;
  crate_deposit_charged: Paisa;
  crate_deposit_charged_paisa: Paisa;
  net_total_amount: Paisa;
  net_total_paisa: Paisa;
  paid_amount: Paisa;
  paid_amount_paisa: Paisa;
  due_amount: Paisa;
  due_amount_paisa: Paisa;
  payment_type: "CASH" | "CREDIT" | "SPLIT" | "BANK";
  status: "PAID" | "PARTIAL" | "UNPAID" | "CANCELLED";
  crates_issued: number;
  crates_returned: number;
  is_cancelled: number | boolean;
  cancellation_reason?: string | null;
  cancelled_by?: number | null;
  cancelled_at?: string | null;
  is_locked: number | boolean;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

/** 16. sales_invoice_items */
export interface SalesInvoiceItemRow {
  id: number;
  invoice_id: number;
  product_id: number;
  unit_chosen: "PACK" | "BASE" | "MIXED";
  pack_qty: number;
  loose_qty: number;
  total_base_units: number;
  unit_price: Paisa;
  unit_price_paisa: Paisa;
  line_discount: Paisa;
  line_discount_paisa: Paisa;
  line_total: Paisa;
  line_total_paisa: Paisa;
  cogs_unit_cost: Paisa;
  cogs_unit_cost_paisa: Paisa;
  cogs_total: Paisa;
  cogs_total_paisa: Paisa;
}

/** 17. purchase_invoices */
export interface PurchaseInvoiceRow {
  id: number;
  purchase_number: string;
  purchase_invoice_no?: string | null;
  supplier_invoice_no: string;
  supplier_id: number;
  purchase_date: string;
  base_goods_paisa: Paisa;
  base_invoice_cost: Paisa;
  freight_paisa: Paisa;
  freight_expense: Paisa;
  unloading_labor_paisa: Paisa;
  unloading_labor_expense: Paisa;
  transit_tax_paisa: Paisa;
  transit_tax_expense: Paisa;
  total_landed_cost_paisa: Paisa;
  total_landed_cost: Paisa;
  paid_amount_paisa: Paisa;
  paid_amount: Paisa;
  due_amount_paisa: Paisa;
  due_amount: Paisa;
  payment_status: "PAID" | "PARTIAL" | "UNPAID";
  payment_mode: "CASH" | "CREDIT" | "BANK" | "SPLIT";
  empty_crates_returned_to_factory: number;
  notes?: string | null;
  is_locked: number | boolean;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

/** 18. purchase_invoice_items */
export interface PurchaseInvoiceItemRow {
  id: number;
  purchase_id: number;
  product_id: number;
  pack_qty: number;
  loose_qty: number;
  total_base_units: number;
  pack_purchase_rate_paisa: Paisa;
  base_purchase_rate_paisa: Paisa;
  landed_cost_allocated_paisa: Paisa;
  final_unit_landed_cost_paisa: Paisa;
  line_total_paisa: Paisa;
}

// ============================================================================
// MODULE D: CHART OF ACCOUNTS, JOURNAL & CASH BOOK (Tables 19 - 23)
// ============================================================================

/** 19. chart_of_accounts */
export interface ChartOfAccountRow {
  id: number;
  account_code: number;
  account_name: string;
  account_type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "COGS" | "EXPENSE";
  parent_code?: number | null;
  is_system: number | boolean;
  is_active: number | boolean;
  description?: string | null;
  created_at: string;
}

/** 20. journal_entries */
export interface JournalEntryRow {
  id: number;
  entry_number: string;
  entry_date: string;
  voucher_type: "SALE" | "PURCHASE" | "PAYMENT" | "RECEIPT" | "EXPENSE" | "CLOSING" | "CANCELLATION" | "TRANSFER" | "MANUAL";
  reference_doc_type?: string | null;
  reference_doc_id?: number | null;
  narration: string;
  is_balanced: number | boolean;
  is_locked: number | boolean;
  created_by?: number | null;
  created_at: string;
}

/** 21. journal_lines */
export interface JournalLineRow {
  id: number;
  entry_id: number;
  account_id: number;
  debit_paisa: Paisa;
  credit_paisa: Paisa;
  line_narration?: string | null;
  customer_id?: number | null;
  supplier_id?: number | null;
  created_at: string;
}

/** 22. cash_book */
export interface CashBookRow {
  id: number;
  entry_date: string;
  entry_time: string;
  transaction_type: string;
  voucher_ref_type: string;
  voucher_ref_id: number;
  voucher_ref_number?: string | null;
  account_id?: number | null;
  account_code?: string | null;
  particulars: string;
  description: string;
  cash_in: Paisa;
  cash_in_paisa: Paisa;
  cash_out: Paisa;
  cash_out_paisa: Paisa;
  running_balance_paisa: Paisa;
  running_cash_balance: Paisa;
  is_locked: number | boolean;
  created_by?: number | null;
  created_at: string;
}

/** 23. bank_transactions */
export interface BankTransactionRow {
  id: number;
  bank_name: string;
  account_number: string;
  transaction_date: string;
  transaction_type: string;
  instrument_type: string;
  instrument_number?: string | null;
  particulars: string;
  deposit_paisa: Paisa;
  withdrawal_paisa: Paisa;
  running_balance_paisa: Paisa;
  is_cleared: number | boolean;
  clearance_date?: string | null;
  journal_entry_id?: number | null;
  created_by?: number | null;
  created_at: string;
}

// ============================================================================
// MODULE E: DAILY CLOSING & ROUTE SETTLEMENTS (Table 24)
// ============================================================================

/** 24. daily_closings */
export interface DailyClosingRow {
  id: number;
  closing_date: string;
  opening_cash: Paisa;
  opening_cash_paisa: Paisa;
  cash_sales_paisa: Paisa;
  udhaar_recoveries_paisa: Paisa;
  crate_deposits_paisa: Paisa;
  other_cash_in_paisa: Paisa;
  total_cash_in: Paisa;
  total_cash_in_paisa: Paisa;
  supplier_payments_paisa: Paisa;
  cash_purchases_paisa: Paisa;
  expenses_paid_paisa: Paisa;
  deposit_refunds_paisa: Paisa;
  bank_deposits_paisa: Paisa;
  owner_drawings_paisa: Paisa;
  total_cash_out: Paisa;
  total_cash_out_paisa: Paisa;
  expected_closing_cash: Paisa;
  expected_closing_cash_paisa: Paisa;
  physical_closing_cash: Paisa;
  physical_closing_cash_paisa: Paisa;
  cash_variance: Paisa;
  variance_paisa: Paisa;
  denominations_json: string;
  total_sales_invoiced: Paisa;
  total_sales_invoiced_paisa: Paisa;
  total_credit_sales: Paisa;
  total_credit_sales_paisa: Paisa;
  variance_reason?: string | null;
  status: string;
  is_locked: number | boolean;
  closed_by?: number | null;
  closed_at: string;
}

// ============================================================================
// AUXILIARY / COMPATIBILITY TABLES
// ============================================================================

export interface DeliveryTripRow {
  id: number;
  trip_code: string;
  trip_date: string;
  route_id: number;
  driver_name: string;
  vehicle_number: string;
  status: "DISPATCHED" | "COMPLETED" | "SETTLED" | "AUDITED";
  dispatched_at?: string | null;
  returned_at?: string | null;
  opening_km?: number | null;
  closing_km?: number | null;
  notes?: string | null;
}

export interface TripLoadItemRow {
  id: number;
  trip_id: number;
  product_id: number;
  loaded_packs: number;
  loaded_loose: number;
  total_loaded_base: number;
  sold_base: number;
  returned_packs: number;
  returned_loose: number;
  total_returned_base: number;
  breakage_base: number;
  variance_base: number;
}

export interface PurchaseLegacyRow {
  id: number;
  purchase_invoice_no: string;
  supplier_id: number;
  purchase_date: string;
  base_invoice_cost: Paisa;
  freight_expense: Paisa;
  unloading_labor_expense: Paisa;
  transit_tax_expense: Paisa;
  total_landed_cost: Paisa;
  payment_status: "PAID" | "PARTIAL" | "UNPAID";
  paid_amount: Paisa;
  due_amount: Paisa;
  created_at: string;
}

export interface CustomerLedgerRow {
  id: number;
  customer_id: number;
  entry_date: string;
  voucher_type: string;
  voucher_ref_id?: number | null;
  description: string;
  debit: Paisa;
  credit: Paisa;
  running_balance: Paisa;
  created_at: string;
}

export interface CustomerCrateLedgerRow {
  id: number;
  customer_id: number;
  entry_date: string;
  voucher_ref: string;
  crates_out: number;
  crates_in: number;
  running_crate_balance: number;
  created_at: string;
}

/** 25. breakage_logs */
export interface BreakageLogRow {
  id: number;
  log_date: string;
  product_id: number;
  broken_base_units: number;
  unit_cost: number;
  unit_cost_paisa: Paisa;
  total_loss_amount: number;
  total_loss_paisa: Paisa;
  cause: string;
  incident_location: string;
  responsible_person?: string | null;
  action_taken: "EXPENSE" | "STAFF_RECOVERY" | "COMPANY_CLAIM";
  notes?: string | null;
  journal_entry_id?: number | null;
  created_by?: number | null;
  created_at: string;
}

/** 26. stock_movements */
export interface StockMovementRow {
  id: number;
  movement_code: string;
  product_id: number;
  movement_type: string;
  from_location_id?: number | null;
  to_location_id?: number | null;
  delta_base_units: number;
  quantity_base_units: number;
  pack_qty: number;
  loose_qty: number;
  unit_cost_paisa: Paisa;
  total_cost_paisa: Paisa;
  previous_stock_base_units: number;
  new_stock_base_units: number;
  reference_type: string;
  reference_id?: number | null;
  reference_doc_type?: string | null;
  reference_doc_id?: number | null;
  reference_doc_number?: string | null;
  notes?: string | null;
  created_by?: number | null;
  created_at: string;
}

// ============================================================================
// DATABASE TYPE REGISTRY
// ============================================================================

export interface DatabaseTables {
  schema_migrations: SchemaMigrationRow;
  app_settings: AppSettingRow;
  users: UserRow;
  audit_logs: AuditLogRow;
  products: ProductRow;
  packaging_units: PackagingUnitRow;
  inventory_batches: InventoryBatchRow;
  empties_ledger: EmptiesLedgerRow;
  security_deposits: SecurityDepositRow;
  customers: CustomerRow;
  suppliers: SupplierRow;
  delivery_routes: DeliveryRouteRow;
  delivery_sheets: DeliverySheetRow;
  delivery_items: DeliveryItemRow;
  sales_invoices: SalesInvoiceRow;
  sales_invoice_items: SalesInvoiceItemRow;
  purchase_invoices: PurchaseInvoiceRow;
  purchase_invoice_items: PurchaseInvoiceItemRow;
  chart_of_accounts: ChartOfAccountRow;
  journal_entries: JournalEntryRow;
  journal_lines: JournalLineRow;
  cash_book: CashBookRow;
  bank_transactions: BankTransactionRow;
  daily_closings: DailyClosingRow;
  breakage_logs: BreakageLogRow;
  stock_movements: StockMovementRow;
}

