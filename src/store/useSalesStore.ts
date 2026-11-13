import { create } from "zustand";
import { salesService } from "../services/salesService";
import {
  CreateSalesInvoiceDto,
  CreateSalesInvoiceItemDto,
  SalesInvoiceReceiptDto,
  SalesInvoiceListItemDto,
  CreditStatusCheckResult,
  PaymentType,
  DenominationCountsDto,
  DailyClosingSummaryDto,
  SubmitClosingResult,
  DailyClosingHistoryItemDto,
  RecordPurchaseDto,
  RecordPurchaseResult,
  LandedCostBreakdownDto,
  PurchaseItemInputDto,
  RecordSalesReturnDto,
  SalesReturnResult,
} from "../types/sales";

export interface CartItem {
  productId: number;
  productName: string;
  skuCode: string;
  unitsPerPack: number;
  packName: string;
  packQty: number;
  looseQty: number;
  unitPricePaisa: number;
  lineDiscountPaisa: number;
}

export interface CustomerSummary {
  id: number;
  name: string;
  shopName: string;
  priceTier: string;
  creditLimitPaisa: number;
  currentBalancePaisa: number;
  currentCrateBalance: number;
}

const DEFAULT_DENOMINATIONS: DenominationCountsDto = {
  note_5000: 0,
  note_1000: 0,
  note_500: 0,
  note_100: 0,
  note_50: 0,
  note_20: 0,
  note_10: 0,
  coin_10: 0,
  coin_5: 0,
  coin_2: 0,
  coin_1: 0,
};

export const calculatePhysicalCashPaisa = (d: DenominationCountsDto): number => {
  return (
    d.note_5000 * 500_000 +
    d.note_1000 * 100_000 +
    d.note_500 * 50_000 +
    d.note_100 * 10_000 +
    d.note_50 * 5_000 +
    d.note_20 * 2_000 +
    d.note_10 * 1_000 +
    d.coin_10 * 1_000 +
    d.coin_5 * 500 +
    d.coin_2 * 200 +
    d.coin_1 * 100
  );
};

interface SalesState {
  // POS Cart State
  cart: CartItem[];
  selectedCustomer: CustomerSummary;
  invoiceDiscountPaisa: number;
  crateDepositChargedPaisa: number;
  paymentType: PaymentType;
  paidAmountPaisa: number;
  cratesIssued: number;
  cratesReturned: number;
  adminOverridePin: string;
  creditStatus: CreditStatusCheckResult | null;

  // Invoices & Receipts
  invoices: SalesInvoiceListItemDto[];
  activeReceipt: SalesInvoiceReceiptDto | null;
  isReceiptModalOpen: boolean;

  // Modals & Sub-states
  isPurchaseModalOpen: boolean;
  isClosingModalOpen: boolean;
  isReturnModalOpen: boolean;

  // Daily Closing State
  closingSummary: DailyClosingSummaryDto | null;
  denominations: DenominationCountsDto;
  physicalCashPaisa: number;
  variancePaisa: number;
  varianceReason: string;
  closingHistory: DailyClosingHistoryItemDto[];

  // Purchase State
  purchaseDraftItems: PurchaseItemInputDto[];
  landedCostPreview: LandedCostBreakdownDto | null;

  // Status
  isLoading: boolean;
  error: string | null;

  // Actions
  addToCart: (item: Omit<CartItem, "packQty" | "looseQty" | "lineDiscountPaisa">) => void;
  updateCartItem: (productId: number, updates: Partial<CartItem>) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;

  setSelectedCustomer: (cust: CustomerSummary) => void;
  setPaymentType: (type: PaymentType) => void;
  setPaidAmountPaisa: (amount: number) => void;
  setInvoiceDiscountPaisa: (amount: number) => void;
  setCrateDepositChargedPaisa: (amount: number) => void;
  setCratesIssued: (count: number) => void;
  setCratesReturned: (count: number) => void;
  setAdminOverridePin: (pin: string) => void;

  checkCredit: () => Promise<CreditStatusCheckResult | null>;
  checkout: () => Promise<SalesInvoiceReceiptDto>;
  cancelInvoice: (invoiceId: number, reason: string, adminPin: string) => Promise<void>;
  fetchInvoices: (limit?: number) => Promise<void>;

  // Daily Closing Actions
  openClosingModal: () => Promise<void>;
  closeClosingModal: () => void;
  setDenominationCount: (key: keyof DenominationCountsDto, count: number) => void;
  setVarianceReason: (reason: string) => void;
  submitClosing: (adminPin?: string) => Promise<SubmitClosingResult>;
  fetchClosingHistory: () => Promise<void>;

  // Purchase Actions
  openPurchaseModal: () => void;
  closePurchaseModal: () => void;
  submitPurchase: (dto: RecordPurchaseDto) => Promise<RecordPurchaseResult>;
  previewLandedCost: (
    items: PurchaseItemInputDto[],
    freight: number,
    unloading: number,
    tax: number
  ) => Promise<void>;

  // Return Actions
  openReturnModal: () => void;
  closeReturnModal: () => void;
  submitSalesReturn: (dto: RecordSalesReturnDto) => Promise<SalesReturnResult>;

  closeReceiptModal: () => void;
  clearError: () => void;
}

export const useSalesStore = create<SalesState>((set, get) => ({
  cart: [],
  selectedCustomer: {
    id: 1,
    name: "Bismillah Kiryana Store",
    shopName: "Bismillah Kiryana Store",
    priceTier: "WHOLESALE",
    creditLimitPaisa: 20000000,
    currentBalancePaisa: 0,
    currentCrateBalance: 15,
  },
  invoiceDiscountPaisa: 0,
  crateDepositChargedPaisa: 0,
  paymentType: "CASH",
  paidAmountPaisa: 0,
  cratesIssued: 0,
  cratesReturned: 0,
  adminOverridePin: "",
  creditStatus: null,

  invoices: [],
  activeReceipt: null,
  isReceiptModalOpen: false,

  isPurchaseModalOpen: false,
  isClosingModalOpen: false,
  isReturnModalOpen: false,

  closingSummary: null,
  denominations: DEFAULT_DENOMINATIONS,
  physicalCashPaisa: 0,
  variancePaisa: 0,
  varianceReason: "",
  closingHistory: [],

  purchaseDraftItems: [],
  landedCostPreview: null,

  isLoading: false,
  error: null,

  addToCart: (item) => {
    const existing = get().cart.find((c) => c.productId === item.productId);
    if (existing) {
      set({
        cart: get().cart.map((c) =>
          c.productId === item.productId ? { ...c, packQty: c.packQty + 1 } : c
        ),
      });
    } else {
      set({
        cart: [
          ...get().cart,
          {
            ...item,
            packQty: 1,
            looseQty: 0,
            lineDiscountPaisa: 0,
          },
        ],
      });
    }
  },

  updateCartItem: (productId, updates) => {
    set({
      cart: get().cart.map((c) =>
        c.productId === productId ? { ...c, ...updates } : c
      ),
    });
  },

  removeFromCart: (productId) => {
    set({ cart: get().cart.filter((c) => c.productId !== productId) });
  },

  clearCart: () => {
    set({
      cart: [],
      invoiceDiscountPaisa: 0,
      crateDepositChargedPaisa: 0,
      paidAmountPaisa: 0,
      cratesIssued: 0,
      cratesReturned: 0,
      adminOverridePin: "",
      creditStatus: null,
    });
  },

  setSelectedCustomer: (cust) => set({ selectedCustomer: cust }),
  setPaymentType: (type) => set({ paymentType: type }),
  setPaidAmountPaisa: (amount) => set({ paidAmountPaisa: amount }),
  setInvoiceDiscountPaisa: (amount) => set({ invoiceDiscountPaisa: amount }),
  setCrateDepositChargedPaisa: (amount) => set({ crateDepositChargedPaisa: amount }),
  setCratesIssued: (count) => set({ cratesIssued: count }),
  setCratesReturned: (count) => set({ cratesReturned: count }),
  setAdminOverridePin: (pin) => set({ adminOverridePin: pin }),

  checkCredit: async () => {
    const { selectedCustomer, cart, invoiceDiscountPaisa, crateDepositChargedPaisa, paymentType, paidAmountPaisa } = get();
    let subtotal = 0;
    for (const it of cart) {
      const baseRate = it.unitsPerPack > 0 ? Math.floor(it.unitPricePaisa / it.unitsPerPack) : 0;
      const gross = it.packQty * it.unitPricePaisa + it.looseQty * baseRate;
      subtotal += Math.max(0, gross - it.lineDiscountPaisa);
    }
    const netTotal = Math.max(0, subtotal - invoiceDiscountPaisa) + crateDepositChargedPaisa;
    const dueAmount = paymentType === "CASH" ? 0 : paymentType === "CREDIT" ? netTotal : Math.max(0, netTotal - paidAmountPaisa);

    try {
      const res = await salesService.checkCreditStatus(selectedCustomer.id, dueAmount);
      set({ creditStatus: res });
      return res;
    } catch {
      return null;
    }
  },

  checkout: async () => {
    const {
      cart,
      selectedCustomer,
      invoiceDiscountPaisa,
      crateDepositChargedPaisa,
      paymentType,
      paidAmountPaisa,
      cratesIssued,
      cratesReturned,
      adminOverridePin,
    } = get();

    if (cart.length === 0) {
      throw new Error("Cart is empty. Add beverages before completing sale.");
    }

    set({ isLoading: true, error: null });

    try {
      const items: CreateSalesInvoiceItemDto[] = cart.map((c) => ({
        product_id: c.productId,
        pack_qty: c.packQty,
        loose_qty: c.looseQty,
        unit_price_paisa: c.unitPricePaisa,
        line_discount_paisa: c.lineDiscountPaisa,
      }));

      const dto: CreateSalesInvoiceDto = {
        customer_id: selectedCustomer.id,
        items,
        invoice_discount_paisa: invoiceDiscountPaisa,
        crate_deposit_charged_paisa: crateDepositChargedPaisa,
        payment_type: paymentType,
        paid_amount_paisa: paymentType === "CASH" ? undefined : paidAmountPaisa,
        crates_issued: cratesIssued,
        crates_returned: cratesReturned,
        admin_override_pin: adminOverridePin ? adminOverridePin : undefined,
      };

      const receipt = await salesService.createSalesInvoice(dto);
      set({
        activeReceipt: receipt,
        isReceiptModalOpen: true,
        isLoading: false,
      });
      get().clearCart();
      await get().fetchInvoices();
      return receipt;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  cancelInvoice: async (invoiceId, reason, adminPin) => {
    set({ isLoading: true, error: null });
    try {
      await salesService.cancelSalesInvoice({
        invoice_id: invoiceId,
        reason,
        cancelled_by: 1,
        admin_pin: adminPin,
      });
      await get().fetchInvoices();
      set({ isLoading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  fetchInvoices: async (limit = 50) => {
    try {
      const list = await salesService.listSalesInvoices(limit);
      set({ invoices: list });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  // Daily Closing Actions
  openClosingModal: async () => {
    set({ isClosingModalOpen: true, isLoading: true, error: null });
    try {
      const summary = await salesService.getDailyClosingSummary();
      const physical = calculatePhysicalCashPaisa(get().denominations);
      const variance = physical - summary.expected_closing_cash_paisa;
      set({
        closingSummary: summary,
        physicalCashPaisa: physical,
        variancePaisa: variance,
        isLoading: false,
      });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  closeClosingModal: () => set({ isClosingModalOpen: false }),

  setDenominationCount: (key, count) => {
    const updated = { ...get().denominations, [key]: Math.max(0, count) };
    const physical = calculatePhysicalCashPaisa(updated);
    const expected = get().closingSummary?.expected_closing_cash_paisa || 0;
    set({
      denominations: updated,
      physicalCashPaisa: physical,
      variancePaisa: physical - expected,
    });
  },

  setVarianceReason: (reason) => set({ varianceReason: reason }),

  submitClosing: async (adminPin) => {
    const { closingSummary, denominations, varianceReason } = get();
    if (!closingSummary) throw new Error("Closing summary not loaded");

    set({ isLoading: true, error: null });
    try {
      const res = await salesService.submitDailyClosing({
        closing_date: closingSummary.closing_date,
        physical_denominations: denominations,
        variance_reason: varianceReason || undefined,
        admin_pin: adminPin || undefined,
        user_id: 1,
      });
      set({ isClosingModalOpen: false, isLoading: false });
      await get().fetchInvoices();
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  fetchClosingHistory: async () => {
    try {
      const history = await salesService.getDailyClosingHistory();
      set({ closingHistory: history });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  // Purchase Actions
  openPurchaseModal: () => set({ isPurchaseModalOpen: true, error: null }),
  closePurchaseModal: () => set({ isPurchaseModalOpen: false }),

  submitPurchase: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      const res = await salesService.recordPurchase(dto);
      set({ isPurchaseModalOpen: false, isLoading: false });
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  previewLandedCost: async (items, freight, unloading, tax) => {
    try {
      const res = await salesService.calculateLandedCostPreview(
        items,
        freight,
        unloading,
        tax
      );
      set({ landedCostPreview: res });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  // Return Actions
  openReturnModal: () => set({ isReturnModalOpen: true, error: null }),
  closeReturnModal: () => set({ isReturnModalOpen: false }),

  submitSalesReturn: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      const res = await salesService.recordSalesReturn(dto);
      set({ isReturnModalOpen: false, isLoading: false });
      await get().fetchInvoices();
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  closeReceiptModal: () => set({ isReceiptModalOpen: false, activeReceipt: null }),
  clearError: () => set({ error: null }),
}));
