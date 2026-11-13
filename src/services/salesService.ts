import { invokeCommand } from "./tauri";
import {
  CreateSalesInvoiceDto,
  SalesInvoiceReceiptDto,
  SalesInvoiceListItemDto,
  CreditStatusCheckResult,
  RecordPurchaseDto,
  RecordPurchaseResult,
  LandedCostBreakdownDto,
  PurchaseItemInputDto,
  PurchaseInvoiceListItemDto,
  CancelInvoiceDto,
  CancelInvoiceResult,
  RecordSalesReturnDto,
  SalesReturnResult,
  SalesReturnListItemDto,
  DailyClosingSummaryDto,
  SubmitClosingDto,
  SubmitClosingResult,
  DailyClosingHistoryItemDto,
} from "../types/sales";

export const salesService = {
  // Sales Invoicing
  createSalesInvoice: (dto: CreateSalesInvoiceDto): Promise<SalesInvoiceReceiptDto> =>
    invokeCommand<SalesInvoiceReceiptDto>("sales_create_invoice", { request: dto }),

  getSalesInvoice: (invoiceId: number): Promise<SalesInvoiceReceiptDto> =>
    invokeCommand<SalesInvoiceReceiptDto>("sales_get_invoice", { invoiceId }),

  listSalesInvoices: (limit = 50): Promise<SalesInvoiceListItemDto[]> =>
    invokeCommand<SalesInvoiceListItemDto[]>("sales_list_invoices", { limit }),

  checkCreditStatus: (
    customerId: number,
    attemptedCreditPaisa: number
  ): Promise<CreditStatusCheckResult> =>
    invokeCommand<CreditStatusCheckResult>("sales_check_credit_status", {
      customerId,
      attemptedCreditPaisa,
    }),

  // Purchases (Landed Cost)
  recordPurchase: (dto: RecordPurchaseDto): Promise<RecordPurchaseResult> =>
    invokeCommand<RecordPurchaseResult>("purchase_create_invoice", { request: dto }),

  calculateLandedCostPreview: (
    items: PurchaseItemInputDto[],
    freightPaisa: number,
    unloadingLaborPaisa: number,
    transitTaxPaisa: number
  ): Promise<LandedCostBreakdownDto> =>
    invokeCommand<LandedCostBreakdownDto>("purchase_calculate_landed_cost", {
      request: {
        items,
        freight_paisa: freightPaisa,
        unloading_labor_paisa: unloadingLaborPaisa,
        transit_tax_paisa: transitTaxPaisa,
      },
    }),

  listPurchases: (limit = 50): Promise<PurchaseInvoiceListItemDto[]> =>
    invokeCommand<PurchaseInvoiceListItemDto[]>("purchase_list_invoices", { limit }),

  // Cancellations
  cancelSalesInvoice: (dto: CancelInvoiceDto): Promise<CancelInvoiceResult> =>
    invokeCommand<CancelInvoiceResult>("sales_cancel_invoice", { request: dto }),

  // Returns
  recordSalesReturn: (dto: RecordSalesReturnDto): Promise<SalesReturnResult> =>
    invokeCommand<SalesReturnResult>("sales_record_return", { request: dto }),

  listSalesReturns: (limit = 50): Promise<SalesReturnListItemDto[]> =>
    invokeCommand<SalesReturnListItemDto[]>("sales_list_returns", { limit }),

  // Daily Closing
  getDailyClosingSummary: (closingDate?: string): Promise<DailyClosingSummaryDto> =>
    invokeCommand<DailyClosingSummaryDto>("closing_get_daily_summary", {
      closingDate: closingDate || null,
    }),

  submitDailyClosing: (dto: SubmitClosingDto): Promise<SubmitClosingResult> =>
    invokeCommand<SubmitClosingResult>("closing_submit_closing", { request: dto }),

  getDailyClosingHistory: (limit = 30): Promise<DailyClosingHistoryItemDto[]> =>
    invokeCommand<DailyClosingHistoryItemDto[]>("closing_get_history", { limit }),
};
