import { Paisa } from "./ipc";

export enum PackagingType {
  RgbGlass = "RGB_GLASS",
  PetPlastic = "PET_PLASTIC",
  CanAlu = "CAN_ALU",
  WaterCarboy = "WATER_CARBOY",
}

export enum PriceTier {
  Retail = "RETAIL",
  Wholesale = "WHOLESALE",
  Special = "SPECIAL",
}

export enum CreditStatus {
  Active = "ACTIVE",
  Warning = "WARNING",
  Blocked = "BLOCKED",
}

export enum PaymentType {
  Cash = "CASH",
  Credit = "CREDIT",
  Split = "SPLIT",
  Bank = "BANK",
}

export enum InvoiceStatus {
  Paid = "PAID",
  Partial = "PARTIAL",
  Unpaid = "UNPAID",
  Cancelled = "CANCELLED",
}

export interface AppSettings {
  id: number;
  agency_name: string;
  tagline?: string;
  address: string;
  phone: string;
  whatsapp?: string;
  ntn_strn?: string;
  invoice_prefix: string;
  default_crate_deposit: Paisa;
  default_credit_days: number;
  auto_backup_on_close: boolean;
  backup_dir: string;
  updated_at: string;
}

export interface UpdateAppSettingsDto {
  agency_name: string;
  tagline?: string;
  address: string;
  phone: string;
  whatsapp?: string;
  ntn_strn?: string;
  invoice_prefix: string;
  default_crate_deposit: Paisa;
  default_credit_days: number;
  auto_backup_on_close: boolean;
  backup_dir: string;
}

export interface Product {
  id: number;
  sku_code: string;
  name: string;
  brand: string;
  packaging_type: PackagingType;
  base_unit_name: string;
  pack_unit_name: string;
  units_per_pack: number;
  purchase_price_pack: Paisa;
  sale_price_pack: Paisa;
  sale_price_base: Paisa;
  crate_deposit_price: Paisa;
  bottle_deposit_price: Paisa;
  stock_base_units: number;
  empty_bottles_stock: number;
  empty_crates_stock: number;
  min_reorder_level_packs: number;
  is_active: boolean;
}

export interface Customer {
  id: number;
  code: string;
  shop_name: string;
  owner_name?: string;
  phone: string;
  whatsapp?: string;
  address: string;
  route_id?: number;
  price_tier: PriceTier;
  credit_limit_amount: Paisa;
  credit_limit_days: number;
  crate_limit: number;
  current_balance: Paisa;
  current_crate_balance: number;
  deposit_balance: Paisa;
  credit_status: CreditStatus;
}

/**
 * Converts integer Paisas to PKR (1 PKR = 100 Paisa).
 */
export function paisaToPkr(paisa: number): number {
  return paisa / 100;
}

/**
 * Converts decimal PKR to integer Paisas with arithmetic rounding.
 */
export function pkrToPaisa(pkr: number): number {
  return Math.round(pkr * 100);
}

/**
 * Formats integer Paisas as a standard Pakistani Rupee currency string.
 * Example: 5000000 -> "₨ 50,000.00", -250000 -> "-₨ 2,500.00"
 */
export function formatPkr(paisa: number): string {
  if (paisa === undefined || paisa === null || Number.isNaN(paisa)) {
    return "₨ 0.00";
  }
  const pkr = paisaToPkr(paisa);
  const isNegative = pkr < 0;
  const absVal = Math.abs(pkr);
  const formatted = absVal.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNegative ? `-₨ ${formatted}` : `₨ ${formatted}`;
}

// ============================================================================
// MILESTONE 2 DTOs: PACKAGING, INVENTORY, CRATES & BREAKAGE
// ============================================================================

export interface ConvertPackToBaseDto {
  product_id: number;
  pack_qty: number;
  loose_qty: number;
}

export interface ConvertPackToBaseResult {
  product_id: number;
  pack_qty: number;
  loose_qty: number;
  units_per_pack: number;
  total_base_units: number;
  formula_applied: string;
}

export interface ConvertBaseToPackDto {
  product_id: number;
  base_units: number;
}

export interface ConvertBaseToPackResult {
  product_id: number;
  base_units: number;
  packs: number;
  loose: number;
  pack_unit_name: string;
  base_unit_name: string;
  display_text: string;
}

export interface PackagingUnitDto {
  id: number;
  product_id: number;
  unit_name: string;
  multiplier_to_base: number;
  is_base_unit: boolean;
  is_default_purchase_unit: boolean;
  is_default_sale_unit: boolean;
  barcode?: string | null;
}

export interface StockFilterDto {
  brand?: string;
  packaging_type?: string;
  is_glass?: boolean;
  low_stock_only?: boolean;
  search_query?: string;
}

export interface StockItemOverviewDto {
  id: number;
  sku_code: string;
  name: string;
  brand: string;
  flavor?: string | null;
  volume_ml?: number | null;
  packaging_type: string;
  is_glass: boolean;
  requires_crate: boolean;
  base_unit_name: string;
  pack_unit_name: string;
  units_per_pack: number;
  purchase_price_pack_paisa: Paisa;
  wholesale_price_pack_paisa: Paisa;
  retail_price_pack_paisa: Paisa;
  retail_price_base_paisa: Paisa;
  crate_deposit_paisa: Paisa;
  current_stock_base_units: number;
  stock_in_packs: number;
  stock_loose_units: number;
  empty_bottles_stock: number;
  empty_crates_stock: number;
  min_reorder_level_packs: number;
  is_low_stock: boolean;
  inventory_valuation_paisa: Paisa;
}

export interface AdjustStockDto {
  product_id: number;
  delta_base_units: number;
  reason: string;
  notes?: string | null;
  user_id?: number | null;
}

export interface StockAdjustmentResult {
  product_id: number;
  previous_stock_base_units: number;
  new_stock_base_units: number;
  delta_base_units: number;
  adjusted_at: string;
}

export interface EmptiesOverviewDto {
  warehouse_empty_crates: number;
  warehouse_empty_bottles: number;
  total_customer_crates_outstanding: number;
  total_deposit_liability_paisa: Paisa;
  supplier_crates_owed_to_factory: number;
}

export interface RecordCrateTransactionDto {
  customer_id: number;
  crates_out: number;
  crates_in: number;
  voucher_ref: string;
  date?: string | null;
  deposit_paid_paisa?: Paisa | null;
  deposit_refunded_paisa?: Paisa | null;
  notes?: string | null;
  user_id?: number | null;
}

export interface CrateTransactionResult {
  customer_id: number;
  crates_out: number;
  crates_in: number;
  net_crate_change: number;
  previous_customer_crate_balance: number;
  new_customer_crate_balance: number;
  warehouse_empty_crates_stock: number;
  deposit_balance_paisa: Paisa;
  ledger_entry_id: number;
}

export interface CustomerCrateLedgerDto {
  id: number;
  customer_id: number;
  entry_date: string;
  voucher_ref: string;
  crates_out: number;
  crates_in: number;
  running_crate_balance: number;
  created_at: string;
}

export interface RecordSecurityDepositDto {
  customer_id: number;
  crates_count: number;
  deposit_rate_per_crate_paisa: Paisa;
  payment_mode: string;
  notes?: string | null;
  user_id?: number | null;
}

export interface RefundSecurityDepositDto {
  customer_id: number;
  crates_count: number;
  deposit_rate_per_crate_paisa: Paisa;
  payment_mode: string;
  notes?: string | null;
  user_id?: number | null;
}

export interface SecurityDepositResult {
  customer_id: number;
  voucher_number: string;
  crates_count: number;
  amount_paisa: Paisa;
  running_deposit_liability_paisa: Paisa;
  cash_book_entry_id?: number | null;
}

export interface RecordBreakageDto {
  product_id: number;
  broken_base_units: number;
  cause: string;
  incident_location: string;
  responsible_person?: string | null;
  action_taken: string;
  notes?: string | null;
  user_id?: number | null;
}

export interface BreakageResult {
  log_id: number;
  product_id: number;
  broken_base_units: number;
  unit_cost_paisa: Paisa;
  total_loss_paisa: Paisa;
  remaining_stock_base_units: number;
  action_taken: string;
  journal_entry_id?: number | null;
}

export interface BreakageLogDto {
  id: number;
  log_date: string;
  product_id: number;
  product_name: string;
  broken_base_units: number;
  unit_cost_paisa: Paisa;
  total_loss_paisa: Paisa;
  cause: string;
  incident_location: string;
  responsible_person?: string | null;
  action_taken: string;
  notes?: string | null;
  created_at: string;
}


