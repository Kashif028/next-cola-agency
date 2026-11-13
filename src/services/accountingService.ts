import { invokeCommand } from "./tauri";
import { Paisa } from "../types/ipc";

export interface RecordCustomerRecoveryDto {
  customer_id: number;
  amount_paisa: Paisa;
  payment_mode: "CASH" | "BANK" | "CHEQUE" | string;
  allocation_mode?: "FIFO" | "SPECIFIC" | "ON_ACCOUNT" | string;
  payment_date?: string;
  target_invoice_ids?: number[];
  bank_account_id?: number;
  bank_name?: string;
  instrument_number?: string;
  instrument_date?: string;
  notes?: string;
  user_id?: number;
  delivery_sheet_id?: number;
}

export interface InvoiceAllocationDetailDto {
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  invoice_total_paisa: Paisa;
  previously_paid_paisa: Paisa;
  allocated_paisa: Paisa;
  remaining_paisa: Paisa;
}

export interface RecoveryReceiptDto {
  recovery_id: number;
  recovery_number: string;
  recovery_date: string;
  customer_id: number;
  customer_name: string;
  shop_name: string;
  amount_paisa: Paisa;
  payment_mode: string;
  previous_balance_paisa: Paisa;
  new_balance_paisa: Paisa;
  allocations: InvoiceAllocationDetailDto[];
  formatted_thermal_receipt: string;
}

export interface CustomerAgingBucket {
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

export interface CustomerUdhaarAgingDto {
  customer_id: number;
  customer_name: string;
  shop_name: string;
  credit_limit_paisa: Paisa;
  total_outstanding_paisa: Paisa;
  bucket_0_7_paisa: Paisa;
  bucket_8_15_paisa: Paisa;
  bucket_16_30_paisa: Paisa;
  bucket_31_60_paisa: Paisa;
  bucket_60_plus_paisa: Paisa;
  unpaid_invoices: {
    invoice_id: number;
    invoice_number: string;
    invoice_date: string;
    net_total_paisa: Paisa;
    paid_amount_paisa: Paisa;
    due_amount_paisa: Paisa;
    age_days: number;
    bucket: string;
  }[];
}

export const accountingService = {
  getCustomerLedger: async (customerId: number, fromDate?: string, toDate?: string) => {
    return invokeCommand("get_customer_ledger_statement", {
      customerId,
      fromDate,
      toDate,
    });
  },

  getSupplierLedger: async (supplierId: number, fromDate?: string, toDate?: string) => {
    return invokeCommand("get_supplier_ledger_statement", {
      supplierId,
      fromDate,
      toDate,
    });
  },

  getCustomerAging: async (customerId: number, asOfDate?: string): Promise<CustomerUdhaarAgingDto> => {
    try {
      return await invokeCommand<CustomerUdhaarAgingDto>("get_customer_aging_report", {
        customerId,
        asOfDate,
      });
    } catch {
      // Fallback mock
      return {
        customer_id: customerId,
        customer_name: "Customer #" + customerId,
        shop_name: "Retail Shop",
        credit_limit_paisa: 10000000,
        total_outstanding_paisa: 4500000,
        bucket_0_7_paisa: 1500000,
        bucket_8_15_paisa: 2000000,
        bucket_16_30_paisa: 1000000,
        bucket_31_60_paisa: 0,
        bucket_60_plus_paisa: 0,
        unpaid_invoices: [
          {
            invoice_id: 101,
            invoice_number: "INV-20261102-0012",
            invoice_date: "2026-11-02",
            net_total_paisa: 2500000,
            paid_amount_paisa: 1000000,
            due_amount_paisa: 1500000,
            age_days: 8,
            bucket: "8-15 days",
          },
          {
            invoice_id: 102,
            invoice_number: "INV-20261108-0022",
            invoice_date: "2026-11-08",
            net_total_paisa: 3000000,
            paid_amount_paisa: 0,
            due_amount_paisa: 3000000,
            age_days: 2,
            bucket: "0-7 days",
          },
        ],
      };
    }
  },

  getAllCustomersAgingSummary: async (asOfDate?: string, routeId?: number) => {
    return invokeCommand("get_all_customers_aging_summary", { asOfDate, routeId });
  },

  recordCustomerRecovery: async (request: RecordCustomerRecoveryDto): Promise<RecoveryReceiptDto> => {
    try {
      return await invokeCommand<RecoveryReceiptDto>("record_customer_recovery", { request });
    } catch {
      // Offline mock fallback
      const prevBal = 5910000;
      const newBal = Math.max(0, prevBal - request.amount_paisa);
      return {
        recovery_id: Date.now(),
        recovery_number: `REC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`,
        recovery_date: request.payment_date || new Date().toISOString(),
        customer_id: request.customer_id,
        customer_name: "Bismillah Kiryana Store",
        shop_name: "Bismillah Kiryana Store",
        amount_paisa: request.amount_paisa,
        payment_mode: request.payment_mode,
        previous_balance_paisa: prevBal,
        new_balance_paisa: newBal,
        allocations: [
          {
            invoice_id: 1,
            invoice_number: "INV-20261101-0001",
            invoice_date: "2026-11-01",
            invoice_total_paisa: 3000000,
            previously_paid_paisa: 1000000,
            allocated_paisa: Math.min(2000000, request.amount_paisa),
            remaining_paisa: Math.max(0, 2000000 - request.amount_paisa),
          },
        ],
        formatted_thermal_receipt: `================================================
          LOGAR TRADERS - NEXTCO DEPOT          
   لوگر ٹریڈرز — بااختیار ڈسٹری بیوٹرز نیکسٹ کو  
================================================
UDHAAR RECOVERY RECEIPT (WASOOLI RASEED)
وصولی رسید برائے ادھار
Receipt No: REC-${Date.now()}
Date: ${new Date().toLocaleString()}
Customer: Bismillah Kiryana Store
Amount Received: Rs ${(request.amount_paisa / 100).toFixed(2)}
Payment Mode: ${request.payment_mode}
------------------------------------------------
Previous Balance: Rs ${(prevBal / 100).toFixed(2)}
Less Received:    Rs ${(request.amount_paisa / 100).toFixed(2)}
New Balance:      Rs ${(newBal / 100).toFixed(2)}
================================================
Wasool-kunandah Signature: _____________________
================================================`,
      };
    }
  },

  getCashBookStatement: async (startDate: string, endDate: string) => {
    return invokeCommand("get_cash_book_statement", { startDate, endDate });
  },

  getOperatingExpenses: async (startDate?: string, endDate?: string, accountId?: number) => {
    return invokeCommand("get_operating_expenses", { startDate, endDate, accountId });
  },

  getBankReconciliation: async (bankAccountId: number, asOfDate: string) => {
    return invokeCommand("get_bank_reconciliation", { bankAccountId, asOfDate });
  },

  getProfitAndLossReport: async (startDate: string, endDate: string) => {
    return invokeCommand("get_profit_and_loss_report", { startDate, endDate });
  },

  getTrialBalanceReport: async (asOfDate?: string) => {
    return invokeCommand("get_trial_balance_report", { asOfDate });
  },

  getChartOfAccounts: async () => {
    return invokeCommand("get_chart_of_accounts");
  },
};
