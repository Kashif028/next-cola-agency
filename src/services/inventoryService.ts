import { invokeCommand } from "./tauri";
import {
  ConvertPackToBaseDto,
  ConvertPackToBaseResult,
  ConvertBaseToPackDto,
  ConvertBaseToPackResult,
  PackagingUnitDto,
  StockFilterDto,
  StockItemOverviewDto,
  AdjustStockDto,
  StockAdjustmentResult,
  EmptiesOverviewDto,
  RecordCrateTransactionDto,
  CrateTransactionResult,
  CustomerCrateLedgerDto,
  RecordSecurityDepositDto,
  RefundSecurityDepositDto,
  SecurityDepositResult,
  RecordBreakageDto,
  BreakageResult,
  BreakageLogDto,
} from "../types/domain";

export const inventoryService = {
  convertPackToBase: (dto: ConvertPackToBaseDto): Promise<ConvertPackToBaseResult> =>
    invokeCommand<ConvertPackToBaseResult>("inventory_convert_pack_to_base", { request: dto }),

  convertBaseToPack: (dto: ConvertBaseToPackDto): Promise<ConvertBaseToPackResult> =>
    invokeCommand<ConvertBaseToPackResult>("inventory_convert_base_to_pack", { request: dto }),

  getPackagingUnits: (productId: number): Promise<PackagingUnitDto[]> =>
    invokeCommand<PackagingUnitDto[]>("inventory_get_packaging_units", { productId }),

  getStockOverview: (filter?: StockFilterDto): Promise<StockItemOverviewDto[]> =>
    invokeCommand<StockItemOverviewDto[]>("inventory_get_stock_overview", { filter }),

  adjustStock: (dto: AdjustStockDto): Promise<StockAdjustmentResult> =>
    invokeCommand<StockAdjustmentResult>("inventory_adjust_stock", { request: dto }),

  getEmptiesOverview: (): Promise<EmptiesOverviewDto> =>
    invokeCommand<EmptiesOverviewDto>("inventory_get_empties_overview"),

  recordCrateTransaction: (dto: RecordCrateTransactionDto): Promise<CrateTransactionResult> =>
    invokeCommand<CrateTransactionResult>("inventory_record_crate_transaction", { request: dto }),

  getCustomerCrateLedger: (customerId: number, limit = 100): Promise<CustomerCrateLedgerDto[]> =>
    invokeCommand<CustomerCrateLedgerDto[]>("inventory_get_customer_crate_ledger", {
      customerId,
      limit,
    }),

  recordSecurityDeposit: (dto: RecordSecurityDepositDto): Promise<SecurityDepositResult> =>
    invokeCommand<SecurityDepositResult>("inventory_record_security_deposit", { request: dto }),

  refundSecurityDeposit: (dto: RefundSecurityDepositDto): Promise<SecurityDepositResult> =>
    invokeCommand<SecurityDepositResult>("inventory_refund_security_deposit", { request: dto }),

  recordBreakage: (dto: RecordBreakageDto): Promise<BreakageResult> =>
    invokeCommand<BreakageResult>("inventory_record_breakage", { request: dto }),

  getBreakageLogs: (productId?: number, limit = 100): Promise<BreakageLogDto[]> =>
    invokeCommand<BreakageLogDto[]>("inventory_get_breakage_logs", { productId, limit }),
};
