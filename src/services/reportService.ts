// src/services/reportService.ts
import { invokeCommand } from "./tauri";
import {
  DailySalesSummaryDto,
  SalesTrendsDto,
  ProductSalesDto,
  CustomerSalesSummaryDto,
  SalesmanPerformanceDto,
  SalesReturnListItemDto,
  CustomerLedgerStatementDto,
  CustomerBalanceSummaryDto,
  SupplierLedgerStatementDto,
  SupplierBalanceSummaryDto,
  AgencyUdhaarAgingReportDto,
  CreditRiskAnalysisDto,
  RecoverySummaryDto,
  CashBookStatementDto,
  BankReconciliationReportDto,
  ExpenseListItemDto,
  MonthlyExpenseSummaryDto,
  ProfitAndLossStatementDto,
  StockItemOverviewDto,
  StockBinCardDto,
  LowStockAlertDto,
  InventoryVelocityDto,
  EmptiesOverviewDto,
  CustomerCrateLedgerDto,
  SupplierCrateSettlementDto,
  BreakageLogDto,
  DailyClosingSummaryDto,
  AuditLogResponseDto,
  ReportFilterParams,
} from "../types/reports";
import { LoadingSheetDetailDto, SettlementReconciliationDto } from "../types/logistics";
import * as mockData from "./mockReportData";
import { logisticsService } from "./logisticsService";

export const reportService = {
  // 1. Daily Sales Summary
  getDailySales: async (params?: ReportFilterParams): Promise<DailySalesSummaryDto[]> => {
    try {
      return await invokeCommand<DailySalesSummaryDto[]>("report_get_daily_sales", { date: params?.date });
    } catch {
      return mockData.MOCK_DAILY_SALES;
    }
  },

  // 2. Monthly Sales Performance
  getSalesTrends: async (params?: ReportFilterParams): Promise<SalesTrendsDto> => {
    try {
      return await invokeCommand<SalesTrendsDto>("report_get_sales_trends", { params });
    } catch {
      return mockData.MOCK_SALES_TRENDS;
    }
  },

  // 3. Product-Wise Sales
  getProductSales: async (params?: ReportFilterParams): Promise<ProductSalesDto[]> => {
    try {
      return await invokeCommand<ProductSalesDto[]>("report_get_product_sales", { params });
    } catch {
      return mockData.MOCK_PRODUCT_SALES;
    }
  },

  // 4. Customer-Wise Sales & Volume
  getCustomerSalesSummary: async (params?: ReportFilterParams): Promise<CustomerSalesSummaryDto[]> => {
    try {
      return await invokeCommand<CustomerSalesSummaryDto[]>("report_get_customer_sales_summary", { params });
    } catch {
      return mockData.MOCK_CUSTOMER_SALES;
    }
  },

  // 5. Salesman & Van Performance
  getSalesmanPerformance: async (params?: ReportFilterParams): Promise<SalesmanPerformanceDto[]> => {
    try {
      return await invokeCommand<SalesmanPerformanceDto[]>("report_get_salesman_performance", { params });
    } catch {
      return mockData.MOCK_SALESMAN_PERF;
    }
  },

  // 6. Sales Returns & Cancellations
  getSalesReturns: async (params?: ReportFilterParams): Promise<SalesReturnListItemDto[]> => {
    try {
      return await invokeCommand<SalesReturnListItemDto[]>("sales_list_returns", { limit: params?.limit || 50 });
    } catch {
      return mockData.MOCK_SALES_RETURNS;
    }
  },

  // 7. Customer Detailed Ledger
  getCustomerLedger: async (customerId = 1, fromDate?: string, toDate?: string): Promise<CustomerLedgerStatementDto> => {
    try {
      return await invokeCommand<CustomerLedgerStatementDto>("get_customer_ledger_statement", {
        customerId,
        fromDate,
        toDate,
      });
    } catch {
      return mockData.MOCK_CUSTOMER_LEDGER;
    }
  },

  // 8. Customer Balance Summary
  getCustomerBalanceSummary: async (params?: ReportFilterParams): Promise<CustomerBalanceSummaryDto[]> => {
    try {
      return await invokeCommand<CustomerBalanceSummaryDto[]>("report_get_customer_balance_summary", {
        routeId: params?.routeId,
      });
    } catch {
      return mockData.MOCK_CUSTOMER_BALANCES;
    }
  },

  // 9. Supplier Detailed Ledger
  getSupplierLedger: async (supplierId = 1, fromDate?: string, toDate?: string): Promise<SupplierLedgerStatementDto> => {
    try {
      return await invokeCommand<SupplierLedgerStatementDto>("get_supplier_ledger_statement", {
        supplierId,
        fromDate,
        toDate,
      });
    } catch {
      return mockData.MOCK_SUPPLIER_LEDGER;
    }
  },

  // 10. Supplier Balance Summary
  getSupplierBalanceSummary: async (_params?: ReportFilterParams): Promise<SupplierBalanceSummaryDto[]> => {
    try {
      return await invokeCommand<SupplierBalanceSummaryDto[]>("report_get_supplier_balance_summary");
    } catch {
      return mockData.MOCK_SUPPLIER_BALANCES;
    }
  },

  // 11. Udhaar Aging Analysis
  getUdhaarAging: async (asOfDate?: string, routeId?: number): Promise<AgencyUdhaarAgingReportDto> => {
    try {
      return await invokeCommand<AgencyUdhaarAgingReportDto>("get_all_customers_aging_summary", {
        asOfDate,
        routeId,
      });
    } catch {
      return mockData.MOCK_UDHAAR_AGING;
    }
  },

  // 12. Credit Limit & Exposure Risk
  getCreditRisk: async (_params?: ReportFilterParams): Promise<CreditRiskAnalysisDto[]> => {
    try {
      return await invokeCommand<CreditRiskAnalysisDto[]>("report_get_credit_risk_analysis");
    } catch {
      return mockData.MOCK_CREDIT_RISK;
    }
  },

  // 13. Payment Recovery & Collection
  getRecoveriesSummary: async (params?: ReportFilterParams): Promise<RecoverySummaryDto[]> => {
    try {
      return await invokeCommand<RecoverySummaryDto[]>("report_get_recoveries_summary", { params });
    } catch {
      return mockData.MOCK_RECOVERIES;
    }
  },

  // 14. Cash Book
  getCashBook: async (startDate: string, endDate: string): Promise<CashBookStatementDto> => {
    try {
      return await invokeCommand<CashBookStatementDto>("get_cash_book_statement", { startDate, endDate });
    } catch {
      return mockData.MOCK_CASH_BOOK;
    }
  },

  // 15. Bank Reconciliation (BRS)
  getBankReconciliation: async (bankAccountId = 1, asOfDate?: string): Promise<BankReconciliationReportDto> => {
    try {
      return await invokeCommand<BankReconciliationReportDto>("get_bank_reconciliation", {
        bankAccountId,
        asOfDate: asOfDate || "2026-11-10",
      });
    } catch {
      return mockData.MOCK_BANK_RECON;
    }
  },

  // 16. Daily Expenses
  getDailyExpenses: async (date?: string): Promise<ExpenseListItemDto[]> => {
    try {
      return await invokeCommand<ExpenseListItemDto[]>("get_operating_expenses", {
        startDate: date,
        endDate: date,
      });
    } catch {
      return mockData.MOCK_EXPENSES;
    }
  },

  // 17. Monthly Expenses Breakdown
  getMonthlyExpenses: async (params?: ReportFilterParams): Promise<MonthlyExpenseSummaryDto> => {
    try {
      return await invokeCommand<MonthlyExpenseSummaryDto>("report_get_monthly_expenses", { params });
    } catch {
      return mockData.MOCK_MONTHLY_EXPENSES;
    }
  },

  // 18. Profit & Loss Statement (P&L)
  getProfitAndLoss: async (startDate: string, endDate: string): Promise<ProfitAndLossStatementDto> => {
    try {
      return await invokeCommand<ProfitAndLossStatementDto>("get_profit_and_loss_report", {
        startDate,
        endDate,
      });
    } catch {
      return mockData.MOCK_PNL;
    }
  },

  // 19. Current Stock Valuation
  getStockValuation: async (): Promise<StockItemOverviewDto[]> => {
    try {
      return await invokeCommand<StockItemOverviewDto[]>("inventory_get_stock_overview");
    } catch {
      return mockData.MOCK_STOCK_OVERVIEW;
    }
  },

  // 20. Stock Movement & Ledger (Bin Card)
  getStockBinCard: async (productId = 1, fromDate?: string, toDate?: string): Promise<StockBinCardDto> => {
    try {
      return await invokeCommand<StockBinCardDto>("report_get_stock_bin_card", {
        productId,
        fromDate,
        toDate,
      });
    } catch {
      return mockData.MOCK_BIN_CARD;
    }
  },

  // 21. Reorder Level & Low Stock
  getLowStockAlerts: async (): Promise<LowStockAlertDto[]> => {
    try {
      return await invokeCommand<LowStockAlertDto[]>("report_get_low_stock_alerts");
    } catch {
      return mockData.MOCK_LOW_STOCK;
    }
  },

  // 22. Fast vs Slow Moving Beverages
  getInventoryVelocity: async (days = 30): Promise<InventoryVelocityDto[]> => {
    try {
      return await invokeCommand<InventoryVelocityDto[]>("report_get_inventory_velocity", { days });
    } catch {
      return mockData.MOCK_INVENTORY_VELOCITY;
    }
  },

  // 23. Crate & Bottle Balance Summary
  getEmptiesOverview: async (): Promise<EmptiesOverviewDto> => {
    try {
      return await invokeCommand<EmptiesOverviewDto>("inventory_get_empties_overview");
    } catch {
      return mockData.MOCK_EMPTIES;
    }
  },

  // 24. Customer Crate Circulation Ledger
  getCustomerCrateLedger: async (customerId = 1): Promise<CustomerCrateLedgerDto[]> => {
    try {
      return await invokeCommand<CustomerCrateLedgerDto[]>("inventory_get_customer_crate_ledger", {
        customerId,
      });
    } catch {
      return mockData.MOCK_CUSTOMER_CRATE_LEDGER;
    }
  },

  // 25. Supplier Empty Crate Settlement
  getSupplierCrateSettlement: async (supplierId = 1): Promise<SupplierCrateSettlementDto[]> => {
    try {
      return await invokeCommand<SupplierCrateSettlementDto[]>("report_get_supplier_crate_settlement", {
        supplierId,
      });
    } catch {
      return mockData.MOCK_SUPPLIER_CRATE_SETTLEMENT;
    }
  },

  // 26. Breakage, Leakage & Loss
  getBreakageLogs: async (): Promise<BreakageLogDto[]> => {
    try {
      return await invokeCommand<BreakageLogDto[]>("inventory_get_breakage_logs");
    } catch {
      return mockData.MOCK_BREAKAGE;
    }
  },

  // 27. Route Delivery Sheet Manifest
  getDeliverySheetManifest: async (sheetId = 1): Promise<LoadingSheetDetailDto> => {
    return logisticsService.getLoadingSheet(sheetId);
  },

  // 28. Driver Van Stock Reconciliation
  getVanSettlementReconciliation: async (sheetId = 1): Promise<SettlementReconciliationDto> => {
    return logisticsService.calculateVanSettlement({
      sheet_id: sheetId,
      actual_cash_paisa: 10750000,
      empty_crates_returned: 113,
      returns: [],
    });
  },

  // 29. Daily Cash Closing & Variance
  getDailyClosingSummary: async (closingDate?: string): Promise<DailyClosingSummaryDto> => {
    try {
      return await invokeCommand<DailyClosingSummaryDto>("closing_get_daily_summary", { closingDate });
    } catch {
      return mockData.MOCK_DAILY_CLOSING;
    }
  },

  // 30. System Audit Trail
  getAuditLogs: async (filter?: Record<string, unknown>): Promise<AuditLogResponseDto> => {
    try {
      return await invokeCommand<AuditLogResponseDto>("list_audit_logs", { filter });
    } catch {
      return mockData.MOCK_AUDIT_LOGS;
    }
  },
};
