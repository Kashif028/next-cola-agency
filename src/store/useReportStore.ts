// src/store/useReportStore.ts
import { create } from "zustand";
import { ReportCategory, ReportFilterParams, ReportMetadata, ReportSummaryKpi } from "../types/reports";
import { ALL_REPORTS } from "../components/reports/definitions/reportCatalog";
import { reportService } from "../services/reportService";

interface ReportState {
  activeReportId: string | null;
  activeReport: ReportMetadata | null;
  activeCategory: ReportCategory | "all";
  searchQuery: string;
  filterParams: ReportFilterParams;

  reportData: Record<string, unknown>[];
  summaryKpis: ReportSummaryKpi[];
  isLoading: boolean;
  error: string | null;

  setActiveReportId: (id: string | null) => void;
  setActiveCategory: (cat: ReportCategory | "all") => void;
  setSearchQuery: (query: string) => void;
  setFilterParams: (params: Partial<ReportFilterParams>) => void;
  loadActiveReportData: () => Promise<void>;
}

export const useReportStore = create<ReportState>((set, get) => ({
  activeReportId: null,
  activeReport: null,
  activeCategory: "all",
  searchQuery: "",
  filterParams: {
    date: new Date().toISOString().slice(0, 10),
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    asOfDate: new Date().toISOString().slice(0, 10),
  },

  reportData: [],
  summaryKpis: [],
  isLoading: false,
  error: null,

  setActiveReportId: (id: string | null) => {
    if (!id) {
      set({ activeReportId: null, activeReport: null, reportData: [], summaryKpis: [] });
      return;
    }
    const found = ALL_REPORTS.find((r) => r.id === id) || null;
    set({ activeReportId: id, activeReport: found, error: null });
    get().loadActiveReportData();
  },

  setActiveCategory: (cat) => set({ activeCategory: cat }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterParams: (params) => {
    set((state) => ({ filterParams: { ...state.filterParams, ...params } }));
    get().loadActiveReportData();
  },

  loadActiveReportData: async () => {
    const reportId = get().activeReportId;
    if (!reportId) return;

    set({ isLoading: true, error: null });
    const p = get().filterParams;

    try {
      let data: Record<string, unknown>[] = [];
      let kpis: ReportSummaryKpi[] = [];

      switch (reportId) {
        case "REP-01": {
          const res = await reportService.getDailySales(p);
          data = res as unknown as Record<string, unknown>[];
          const totalInvoices = res.length;
          const totalNet = res.reduce((acc, r) => acc + r.net_total_paisa, 0);
          const totalCash = res.reduce((acc, r) => acc + r.paid_cash_paisa, 0);
          const totalUdhaar = res.reduce((acc, r) => acc + r.due_udhaar_paisa, 0);
          kpis = [
            { label: "Total Invoices", value: totalInvoices, format: "integer" },
            { label: "Net Sales", value: totalNet, format: "currency" },
            { label: "Cash Collected", value: totalCash, format: "currency" },
            { label: "New Udhaar Due", value: totalUdhaar, format: "currency" },
          ];
          break;
        }

        case "REP-02": {
          const res = await reportService.getSalesTrends(p);
          data = [res] as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Period Invoices", value: res.invoice_count, format: "integer" },
            { label: "Cartons Sold", value: res.total_cartons, format: "integer" },
            { label: "Net Revenue", value: res.net_revenue_paisa, format: "currency" },
            { label: "Cash Ratio", value: res.cash_ratio_percent, format: "percentage" },
          ];
          break;
        }

        case "REP-03": {
          const res = await reportService.getProductSales(p);
          data = res as unknown as Record<string, unknown>[];
          const totalBtls = res.reduce((acc, r) => acc + r.total_base_units, 0);
          const totalRev = res.reduce((acc, r) => acc + r.total_revenue_paisa, 0);
          kpis = [
            { label: "Active SKUs", value: res.length, format: "integer" },
            { label: "Total Bottles Sold", value: totalBtls, format: "integer" },
            { label: "Total Sales Revenue", value: totalRev, format: "currency" },
          ];
          break;
        }

        case "REP-04": {
          const res = await reportService.getCustomerSalesSummary(p);
          data = res as unknown as Record<string, unknown>[];
          const totalCartons = res.reduce((acc, r) => acc + r.cartons_purchased, 0);
          const totalPurchases = res.reduce((acc, r) => acc + r.total_purchases_paisa, 0);
          const totalDue = res.reduce((acc, r) => acc + r.current_balance_paisa, 0);
          kpis = [
            { label: "Active Retailers", value: res.length, format: "integer" },
            { label: "Cartons Purchased", value: totalCartons, format: "integer" },
            { label: "Total Purchases", value: totalPurchases, format: "currency" },
            { label: "Total Khata Balance", value: totalDue, format: "currency" },
          ];
          break;
        }

        case "REP-05": {
          const res = await reportService.getSalesmanPerformance(p);
          data = res as unknown as Record<string, unknown>[];
          const totalCartons = res.reduce((acc, r) => acc + r.cartons_sold, 0);
          const totalInflow = res.reduce((acc, r) => acc + r.total_cash_inflow_paisa, 0);
          kpis = [
            { label: "Active Salesmen", value: res.length, format: "integer" },
            { label: "Total Cartons Delivered", value: totalCartons, format: "integer" },
            { label: "Total Cash Collected", value: totalInflow, format: "currency" },
          ];
          break;
        }

        case "REP-06": {
          const res = await reportService.getSalesReturns(p);
          data = res as unknown as Record<string, unknown>[];
          const totalReversed = res.reduce((acc, r) => acc + r.value_reversed_paisa, 0);
          kpis = [
            { label: "Returns Logged", value: res.length, format: "integer" },
            { label: "Reversed Value", value: totalReversed, format: "currency" },
          ];
          break;
        }

        case "REP-07": {
          const res = await reportService.getCustomerLedger(p.customerId || 1, p.startDate, p.endDate);
          data = res.entries as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Opening Khata", value: res.opening_balance_paisa, format: "currency" },
            { label: "Period Debits (Sales)", value: res.total_debits_paisa, format: "currency" },
            { label: "Period Credits (Wasooli)", value: res.total_credits_paisa, format: "currency" },
            { label: "Current Balance Due", value: res.closing_balance_paisa, format: "currency" },
          ];
          break;
        }

        case "REP-08": {
          const res = await reportService.getCustomerBalanceSummary(p);
          data = res as unknown as Record<string, unknown>[];
          const totalMarketDue = res.reduce((acc, r) => acc + r.closing_balance_paisa, 0);
          const totalLimit = res.reduce((acc, r) => acc + r.credit_limit_paisa, 0);
          kpis = [
            { label: "Total Retailers", value: res.length, format: "integer" },
            { label: "Total Market Udhaar", value: totalMarketDue, format: "currency" },
            { label: "Total Credit Facility", value: totalLimit, format: "currency" },
          ];
          break;
        }

        case "REP-09": {
          const res = await reportService.getSupplierLedger(p.supplierId || 1, p.startDate, p.endDate);
          data = res.entries as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Opening Payable", value: res.opening_payable_paisa, format: "currency" },
            { label: "Total Inward Purchases", value: res.total_purchases_paisa, format: "currency" },
            { label: "Total Payments Made", value: res.total_payments_paisa, format: "currency" },
            { label: "Closing Balance Owed", value: res.closing_payable_paisa, format: "currency" },
          ];
          break;
        }

        case "REP-10": {
          const res = await reportService.getSupplierBalanceSummary(p);
          data = res as unknown as Record<string, unknown>[];
          const totalPayables = res.reduce((acc, r) => acc + r.closing_payable_paisa, 0);
          kpis = [
            { label: "Active Suppliers", value: res.length, format: "integer" },
            { label: "Total Accounts Payable", value: totalPayables, format: "currency" },
          ];
          break;
        }

        case "REP-11": {
          const res = await reportService.getUdhaarAging(p.asOfDate, p.routeId);
          data = res.customers as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Total Receivables", value: res.total_receivables_paisa, format: "currency" },
            { label: "Current (0-7 Days)", value: res.total_current_0_7_paisa, format: "currency" },
            { label: "Overdue (8-30 Days)", value: res.total_overdue_8_15_paisa + res.total_overdue_16_30_paisa, format: "currency" },
            { label: "Critical (>30 Days)", value: res.total_overdue_31_60_paisa + res.total_critical_60_plus_paisa, format: "currency" },
          ];
          break;
        }

        case "REP-12": {
          const res = await reportService.getCreditRisk(p);
          data = res as unknown as Record<string, unknown>[];
          const nearBreach = res.filter((r) => r.utilization_percent >= 80).length;
          kpis = [
            { label: "Monitored Retailers", value: res.length, format: "integer" },
            { label: "High Risk / Near Limit", value: nearBreach, format: "integer" },
          ];
          break;
        }

        case "REP-13": {
          const res = await reportService.getRecoveriesSummary(p);
          data = res as unknown as Record<string, unknown>[];
          const totalRecovered = res.reduce((acc, r) => acc + r.recovered_amount_paisa, 0);
          kpis = [
            { label: "Recoveries Logged", value: res.length, format: "integer" },
            { label: "Total Debt Collected", value: totalRecovered, format: "currency" },
          ];
          break;
        }

        case "REP-14": {
          const res = await reportService.getCashBook(p.startDate || "2026-11-10", p.endDate || "2026-11-10");
          data = res.entries as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Opening Cash", value: res.opening_balance_paisa, format: "currency" },
            { label: "Total Cash In", value: res.total_cash_in_paisa, format: "currency" },
            { label: "Total Cash Out", value: res.total_cash_out_paisa, format: "currency" },
            { label: "Closing Cash In Hand", value: res.closing_balance_paisa, format: "currency" },
          ];
          break;
        }

        case "REP-15": {
          const res = await reportService.getBankReconciliation(1, p.asOfDate);
          data = res.entries as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Book Balance", value: res.book_balance_paisa, format: "currency" },
            { label: "Uncleared Deposits", value: res.uncleared_deposits_paisa, format: "currency" },
            { label: "Unpresented Cheques", value: res.unpresented_cheques_paisa, format: "currency" },
            { label: "Reconciled Balance", value: res.reconciled_statement_balance_paisa, format: "currency" },
          ];
          break;
        }

        case "REP-16": {
          const res = await reportService.getDailyExpenses(p.date);
          data = res as unknown as Record<string, unknown>[];
          const totalSpent = res.reduce((acc, r) => acc + r.amount_paisa, 0);
          kpis = [
            { label: "Vouchers Count", value: res.length, format: "integer" },
            { label: "Total Overhead Paid", value: totalSpent, format: "currency" },
          ];
          break;
        }

        case "REP-17": {
          const res = await reportService.getMonthlyExpenses(p);
          data = res.categories as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Total Overhead", value: res.total_overhead_paisa, format: "currency" },
            { label: "Categories", value: res.categories.length, format: "integer" },
          ];
          break;
        }

        case "REP-18": {
          const res = await reportService.getProfitAndLoss(p.startDate || "2026-11-01", p.endDate || "2026-11-10");
          data = [
            { account_name: "1. Gross Sales Revenue", amount_paisa: res.gross_sales_paisa },
            { account_name: "   Less: Trade Discounts", amount_paisa: -res.trade_discounts_paisa },
            { account_name: "   Less: Sales Returns", amount_paisa: -res.sales_returns_paisa },
            { account_name: ">> NET SALES REVENUE", amount_paisa: res.net_sales_revenue_paisa },
            { account_name: "2. Cost of Goods Sold (Beverage Material)", amount_paisa: res.cogs_material_paisa },
            { account_name: "   Inward Consignment Freight", amount_paisa: res.cogs_freight_paisa },
            { account_name: "   Warehouse Unloading Surcharge", amount_paisa: res.cogs_unloading_paisa },
            { account_name: ">> TOTAL COGS", amount_paisa: res.total_cogs_paisa },
            { account_name: ">> GROSS PROFIT", amount_paisa: res.gross_profit_paisa },
            { account_name: "3. Total Operating Overhead Expenses", amount_paisa: res.total_operating_expenses_paisa },
            { account_name: ">> NET OPERATING PROFIT", amount_paisa: res.net_operating_profit_paisa },
            { account_name: "4. [ISOLATED] Refundable Crate Deposits Held (Liability)", amount_paisa: res.crate_deposit_liabilities_paisa },
            { account_name: "5. [ISOLATED] Owner Capital Injections (Equity)", amount_paisa: res.capital_additions_paisa },
          ];
          kpis = [
            { label: "Gross Profit", value: res.gross_profit_paisa, format: "currency" },
            { label: "Gross Margin", value: res.gross_margin_percent, format: "percentage" },
            { label: "Net Operating Profit", value: res.net_operating_profit_paisa, format: "currency" },
            { label: "Net Margin", value: res.net_margin_percent, format: "percentage" },
          ];
          break;
        }

        case "REP-19": {
          const res = await reportService.getStockValuation();
          data = res as unknown as Record<string, unknown>[];
          const totalCost = res.reduce((acc, r) => acc + r.valuation_at_cost_paisa, 0);
          const totalWholesale = res.reduce((acc, r) => acc + r.valuation_at_wholesale_paisa, 0);
          const totalBtls = res.reduce((acc, r) => acc + r.total_base_units, 0);
          kpis = [
            { label: "Total Bottles in Stock", value: totalBtls, format: "integer" },
            { label: "Valuation at Cost", value: totalCost, format: "currency" },
            { label: "Potential Wholesale Value", value: totalWholesale, format: "currency" },
          ];
          break;
        }

        case "REP-20": {
          const res = await reportService.getStockBinCard(p.productId || 1, p.startDate, p.endDate);
          data = res.entries as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Opening Balance Bottles", value: res.opening_stock_base, format: "integer" },
            { label: "Current Balance Bottles", value: res.closing_stock_base, format: "integer" },
          ];
          break;
        }

        case "REP-21": {
          const res = await reportService.getLowStockAlerts();
          data = res as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Items Below Threshold", value: res.length, format: "integer" },
          ];
          break;
        }

        case "REP-22": {
          const res = await reportService.getInventoryVelocity(30);
          data = res as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Analyzed SKUs", value: res.length, format: "integer" },
            { label: "Fast-Moving Products", value: res.filter((r) => r.classification === "FAST").length, format: "integer" },
          ];
          break;
        }

        case "REP-23": {
          const res = await reportService.getEmptiesOverview();
          data = res.items as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Yard Stock Crates", value: res.total_yard_crates, format: "integer" },
            { label: "Retailer Debt Crates", value: res.total_market_debt_crates, format: "integer" },
            { label: "Deposit Liabilities", value: res.total_deposit_liabilities_paisa, format: "currency" },
          ];
          break;
        }

        case "REP-24": {
          const res = await reportService.getCustomerCrateLedger(p.customerId || 1);
          data = res as unknown as Record<string, unknown>[];
          const latest = res[res.length - 1];
          kpis = [
            { label: "Current Crates Owed", value: latest?.running_crate_balance || 0, format: "integer" },
            { label: "Crate Deposit Held", value: latest?.deposit_liability_paisa || 0, format: "currency" },
          ];
          break;
        }

        case "REP-25": {
          const res = await reportService.getSupplierCrateSettlement(p.supplierId || 1);
          data = res as unknown as Record<string, unknown>[];
          const totalDispatched = res.reduce((acc, r) => acc + r.crates_dispatched, 0);
          const totalAccepted = res.reduce((acc, r) => acc + r.net_accepted_by_factory, 0);
          kpis = [
            { label: "Dispatched to Factory", value: totalDispatched, format: "integer" },
            { label: "Accepted by Factory", value: totalAccepted, format: "integer" },
          ];
          break;
        }

        case "REP-26": {
          const res = await reportService.getBreakageLogs();
          data = res as unknown as Record<string, unknown>[];
          const totalLoss = res.reduce((acc, r) => acc + r.total_loss_paisa, 0);
          const totalBrokenBtls = res.reduce((acc, r) => acc + r.broken_base_units, 0);
          kpis = [
            { label: "Incidents Logged", value: res.length, format: "integer" },
            { label: "Broken Bottles", value: totalBrokenBtls, format: "integer" },
            { label: "Financial Loss Written Off", value: totalLoss, format: "currency" },
          ];
          break;
        }

        case "REP-27": {
          const res = await reportService.getDeliverySheetManifest(1);
          data = res.items as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Loaded Crates", value: res.empty_crates_loaded, format: "integer" },
            { label: "Loaded Value (₨)", value: res.total_load_retail_paisa, format: "currency" },
            { label: "Status", value: res.status, format: "text" },
          ];
          break;
        }

        case "REP-28": {
          const res = await reportService.getVanSettlementReconciliation(1);
          data = res.stock_items as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Cash Variance", value: res.cash_variance_paisa, format: "currency" },
            { label: "Driver Shortage Liability", value: res.total_driver_shortage_liability_paisa, format: "currency" },
            { label: "Trip Balanced", value: res.is_balanced ? "YES" : "NO", format: "text" },
          ];
          break;
        }

        case "REP-29": {
          const res = await reportService.getDailyClosingSummary(p.date);
          data = [
            { field_name: "1. Opening Cash in Hand", amount_paisa: res.opening_cash_paisa, notes: "Carried forward from yesterday" },
            { field_name: "2. Add: POS Counter Cash Sales", amount_paisa: res.pos_cash_sales_paisa, notes: "Cash tendered at till" },
            { field_name: "3. Add: Delivery Van Cash Collections", amount_paisa: res.route_van_cash_paisa, notes: "Route handovers" },
            { field_name: "4. Add: Customer Udhaar Recoveries", amount_paisa: res.customer_recoveries_paisa, notes: "Wasooli Raseed payments" },
            { field_name: "5. Add: Empty Crate Deposits Collected", amount_paisa: res.crate_deposits_received_paisa, notes: "Security deposit receipts" },
            { field_name: "6. Less: Supplier Cash Payments", amount_paisa: -res.supplier_payments_paisa, notes: "Cash paid out to vendors" },
            { field_name: "7. Less: Cash Operating Expenses", amount_paisa: -res.expenses_paid_paisa, notes: "Fuel, labor, utilities" },
            { field_name: "8. Less: Cash Deposited in Bank", amount_paisa: -res.bank_deposits_paisa, notes: "Transferred to HBL account" },
            { field_name: ">> MATHEMATICALLY EXPECTED CASH", amount_paisa: res.expected_cash_paisa, notes: "Calculated balance" },
            { field_name: ">> PHYSICAL CASH COUNTED", amount_paisa: res.physical_cash_paisa, notes: "Sum of counted currency notes" },
            { field_name: ">> AUDIT VARIANCE", amount_paisa: res.variance_paisa, notes: res.variance_paisa === 0 ? "BALANCED" : "VARIANCE DETECTED" },
          ];
          kpis = [
            { label: "Expected Cash", value: res.expected_cash_paisa, format: "currency" },
            { label: "Physical Counted", value: res.physical_cash_paisa, format: "currency" },
            { label: "Closing Variance", value: res.variance_paisa, format: "currency" },
            { label: "Day Lock Status", value: res.is_locked ? "LOCKED" : "OPEN", format: "text" },
          ];
          break;
        }

        case "REP-30": {
          const res = await reportService.getAuditLogs();
          data = res.logs as unknown as Record<string, unknown>[];
          kpis = [
            { label: "Audit Events Logged", value: res.total_count, format: "integer" },
          ];
          break;
        }

        default:
          data = [];
          kpis = [];
      }

      set({ reportData: data, summaryKpis: kpis, isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },
}));
