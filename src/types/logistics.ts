import { Paisa } from "./ipc";

// ============================================================================
// 1. ROUTE MASTER DTOs
// ============================================================================
export interface RouteDto {
  id: number;
  route_code: string;
  route_name: string;
  description?: string | null;
  default_driver_id?: number | null;
  default_driver_name?: string | null;
  default_vehicle_id?: number | null;
  default_vehicle_no?: string | null;
  start_time?: string | null;
  target_daily_sales_paisa: Paisa;
  customer_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRouteDto {
  route_code: string;
  route_name: string;
  description?: string;
  default_driver_id?: number;
  default_vehicle_id?: number;
  default_vehicle_no?: string;
  start_time?: string;
  target_daily_sales_paisa?: Paisa;
}

export interface UpdateRouteDto {
  route_name: string;
  description?: string;
  default_driver_id?: number;
  default_vehicle_id?: number;
  default_vehicle_no?: string;
  start_time?: string;
  target_daily_sales_paisa?: Paisa;
  is_active: boolean;
}

// ============================================================================
// 2. FLEET & VEHICLE DTOs
// ============================================================================
export interface VehicleDto {
  id: number;
  vehicle_number: string;
  model: string;
  capacity_crates: number;
  capacity_weight_kg: number;
  default_driver_id?: number | null;
  default_driver_name?: string | null;
  stock_location_id?: number | null;
  current_odometer_km: number;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateVehicleDto {
  vehicle_number: string;
  model: string;
  capacity_crates: number;
  capacity_weight_kg: number;
  default_driver_id?: number;
  notes?: string;
}

export interface UpdateVehicleDto {
  model: string;
  capacity_crates: number;
  capacity_weight_kg: number;
  default_driver_id?: number;
  current_odometer_km: number;
  is_active: boolean;
  notes?: string;
}

// ============================================================================
// 3. LOADING SHEET & DISPATCH DTOs
// ============================================================================
export interface LoadingItemInput {
  product_id: number;
  pack_qty: number;
  loose_qty: number;
}

export interface CreateLoadingSheetDto {
  route_id: number;
  sheet_date?: string;
  vehicle_id?: number;
  vehicle_number?: string;
  driver_id?: number;
  driver_name?: string;
  helper_name?: string;
  opening_km?: number;
  empty_crates_loaded?: number;
  items: LoadingItemInput[];
  notes?: string;
  created_by?: number;
}

export interface IssueLoadingSheetDto {
  sheet_id: number;
  departure_time?: string;
  opening_km?: number;
  empty_crates_loaded?: number;
  morning_dispatcher_id?: number;
  notes?: string;
}

export interface IssueLoadingSheetResult {
  sheet_id: number;
  sheet_number: string;
  status: string;
  dispatched_at: string;
  departure_time: string;
  total_products_loaded: number;
  total_base_units_loaded: number;
  total_crates_loaded: number;
  total_load_cost_paisa: Paisa;
  total_load_retail_paisa: Paisa;
  stock_movements_recorded: number;
}

export interface LoadingSheetItemDto {
  id: number;
  sheet_id: number;
  product_id: number;
  product_sku: string;
  product_name: string;
  pack_unit_name: string;
  base_unit_name: string;
  units_per_pack: number;
  loaded_packs: number;
  loaded_loose: number;
  total_loaded_base: number;
  unit_cost_paisa: Paisa;
  unit_price_paisa: Paisa;
  line_cost_paisa: Paisa;
  line_retail_paisa: Paisa;
  sold_base: number;
  sold_packs?: number;
  sold_loose?: number;
  returned_packs: number;
  returned_loose: number;
  total_returned_base: number;
  breakage_base: number;
  damaged_packs?: number;
  damaged_loose?: number;
  damaged_base?: number;
  variance_base: number;
  unit_wholesale_price_paisa?: Paisa;
  line_wholesale_revenue_paisa?: Paisa;
  line_revenue_paisa?: Paisa;
}

export interface LoadingSheetDetailDto {
  id: number;
  sheet_number: string;
  trip_code?: string | null;
  sheet_date: string;
  route_id: number;
  route_name: string;
  route_code: string;
  vehicle_id?: number | null;
  vehicle_number: string;
  vehicle_model?: string | null;
  vehicle_capacity_crates?: number | null;
  driver_id?: number | null;
  driver_name: string;
  helper_name?: string | null;
  status: "DRAFT" | "ISSUED" | "DISPATCHED" | "SETTLED" | "COMPLETED" | "AUDITED" | "OPEN" | "FINALIZED";
  dispatched_at?: string | null;
  departure_time?: string | null;
  returned_at?: string | null;
  opening_km?: number | null;
  closing_km?: number | null;
  empty_crates_loaded: number;
  total_load_cost_paisa: Paisa;
  total_load_retail_paisa: Paisa;
  expected_cash_paisa: Paisa;
  actual_cash_paisa: Paisa;
  cash_variance_paisa: Paisa;
  empty_crates_expected: number;
  empty_crates_returned: number;
  crates_variance: number;
  notes?: string | null;
  settlement_notes?: string | null;
  created_by?: number | null;
  morning_dispatcher_id?: number | null;
  settled_by?: number | null;
  created_at: string;
  updated_at: string;
  items: LoadingSheetItemDto[];

  // Extended Salesman, Financial & Multi-Edit Lifecycle Properties
  salesman_id?: number | null;
  salesman_name?: string | null;
  salesman_khata_id?: number | null;
  total_sales_revenue_paisa?: Paisa;
  cash_deposited_paisa?: Paisa;
  unpaid_balance_paisa?: Paisa;
  khata_transaction_id?: number | null;
  edit_count?: number;
  last_edited_at?: string | null;
}

export interface LoadingSheetSummaryDto {
  id: number;
  sheet_number: string;
  sheet_date: string;
  route_id: number;
  route_name: string;
  vehicle_number: string;
  driver_name: string;
  status: string;
  total_items_count: number;
  total_loaded_base: number;
  empty_crates_loaded: number;
  total_load_retail_paisa: Paisa;
  dispatched_at?: string | null;
}

export interface LoadingSheetFilterDto {
  route_id?: number;
  date_from?: string;
  date_to?: string;
  status?: string;
  vehicle_number?: string;
  driver_id?: number;
}

// ============================================================================
// 4. VAN SETTLEMENT & RECONCILIATION DTOs
// ============================================================================
export interface VanSettlementReturnItemDto {
  product_id: number;
  returned_packs: number;
  returned_loose: number;
  breakage_base: number;
  notes?: string;
}

export interface CalculateSettlementRequestDto {
  sheet_id: number;
  settlement_date?: string;
  returns: VanSettlementReturnItemDto[];
  actual_cash_paisa: Paisa;
  empty_crates_returned: number;
  route_expenses_paisa?: Paisa;
}

export interface StockReconciliationLineDto {
  product_id: number;
  product_name: string;
  sku_code: string;
  units_per_pack: number;
  loaded_packs: number;
  loaded_loose: number;
  total_loaded_base: number;
  sold_base: number;
  returned_packs: number;
  returned_loose: number;
  total_returned_base: number;
  breakage_base: number;
  expected_return_base: number;
  variance_base: number;
  unit_rate_paisa: Paisa;
  shortage_value_paisa: Paisa;
  status: "BALANCED" | "SHORTAGE" | "EXCESS";
}

export interface SettlementReconciliationDto {
  sheet_id: number;
  sheet_number: string;
  route_id: number;
  route_name: string;
  driver_id: number;
  driver_name: string;
  vehicle_number: string;
  settlement_date: string;
  stock_items: StockReconciliationLineDto[];
  total_stock_variance_base: number;
  total_stock_shortage_value_paisa: Paisa;
  route_cash_sales_paisa: Paisa;
  route_credit_sales_paisa: Paisa;
  route_recoveries_collected_paisa: Paisa;
  route_crate_deposits_collected_paisa: Paisa;
  route_expenses_deducted_paisa: Paisa;
  expected_cash_paisa: Paisa;
  actual_cash_paisa: Paisa;
  cash_variance_paisa: Paisa;
  cash_variance_type: "BALANCED" | "SHORTAGE" | "EXCESS";
  empty_crates_expected: number;
  empty_crates_returned: number;
  crates_variance: number;
  crate_penalty_rate_paisa: Paisa;
  crate_shortage_value_paisa: Paisa;
  total_driver_shortage_liability_paisa: Paisa;
  is_balanced: boolean;
}

export interface SubmitVanSettlementDto {
  sheet_id: number;
  settlement_date: string;
  closing_km?: number;
  returns: VanSettlementReturnItemDto[];
  actual_cash_paisa: Paisa;
  empty_crates_returned: number;
  route_expenses_paisa?: Paisa;
  settlement_notes?: string;
  shortage_action?: "CHARGE_DRIVER" | "EXPENSE_WAIVER";
  user_id?: number;
}

export interface VanSettlementResultDto {
  sheet_id: number;
  sheet_number: string;
  settlement_id: number;
  status: string;
  settled_at: string;
  cash_book_entry_id?: number | null;
  shortage_journal_entry_id?: number | null;
  cashier_journal_entry_id?: number | null;
  restocked_items_count: number;
  empty_crates_restocked: number;
  cash_variance_paisa: Paisa;
  total_stock_variance_base: number;
  total_shortage_paisa: Paisa;
}

// ============================================================================
// 5. UNIFIED DISPATCH, RETURN & MULTI-EDIT LIFECYCLE DTOs
// ============================================================================
export interface DispatchLineItem {
  productId: number;
  productSku: string;
  productName: string;
  packName: string;
  unitsPerPack: number;
  wholesalePackPricePaisa: number;
  isGlass: boolean;
  // Morning inputs
  dispatchedPacks: number;
  dispatchedLoose: number;
  totalDispatchedBase: number;
  // Evening return inputs
  soldPacks: number;
  soldLoose: number;
  totalSoldBase: number;
  returnedIntactPacks: number;
  returnedIntactLoose: number;
  totalReturnedIntactBase: number;
  damagedPacks: number;
  damagedLoose: number;
  totalDamagedBase: number;
  // Financial calculation
  lineRevenuePaisa: number;
}

export interface DailyDispatchRecord {
  id: number;
  sheetNumber: string;
  date: string;
  routeId: number;
  routeName: string;
  salesmanId: number;
  salesmanName: string;
  salesmanKhataId?: number;
  vehicleNumber: string;
  status: "DRAFT" | "OPEN" | "ISSUED" | "SETTLED" | "FINALIZED";
  emptyCratesLoaded: number;
  emptyCratesReturned: number;
  items: DispatchLineItem[];
  totalSalesRevenuePaisa: number;
  cashDepositedPaisa: number;
  unpaidBalancePaisa: number;
  khataTransactionId?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecalibrateSheetItemPayload {
  productId: number;
  dispatchedPacks: number;
  dispatchedLoose: number;
  returnedIntactPacks: number;
  returnedIntactLoose: number;
  damagedPacks: number;
  damagedLoose: number;
  wholesalePackPricePaisa?: number;
  unitsPerPack?: number;
}

export interface RecalibrateSheetPayload {
  sheetId: number | string;
  items: RecalibrateSheetItemPayload[];
  cashDepositedPaisa?: number;
  notes?: string;
  status?: "DRAFT" | "OPEN" | "ISSUED" | "SETTLED" | "FINALIZED";
  salesmanKhataId?: number;
}
