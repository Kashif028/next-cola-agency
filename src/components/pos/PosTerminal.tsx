import React, { useState, useEffect, useRef } from "react";
import { useSalesStore, CustomerSummary } from "../../store/useSalesStore";
import { inventoryService } from "../../services/inventoryService";
import {
  ShoppingCart,
  Search,
  Trash2,
  Receipt,
  AlertTriangle,
  Lock,
  CreditCard,
  Truck,
  RotateCcw,
  Banknote,
  Coins,
} from "lucide-react";
import { formatPkr } from "../../types/domain";
import { PurchaseEntryModal } from "./PurchaseEntryModal";
import { DailyClosingModal } from "./DailyClosingModal";
import { SplitPaymentModal } from "./SplitPaymentModal";
import { WasooliRaseedModal } from "./WasooliRaseedModal";
import { ThermalReceiptModal } from "./ThermalReceiptModal";

interface CatalogProduct {
  id: number;
  sku: string;
  name: string;
  brand: string;
  packName: string;
  unitsPerPack: number;
  wholesalePackPricePaisa: number;
  retailPackPricePaisa: number;
  requiresCrate: boolean;
  stockBaseUnits: number;
}

const DEFAULT_CATALOG: CatalogProduct[] = [
  {
    id: 1,
    sku: "NC-250-RGB",
    name: "Next Cola 250ml Glass Bottle",
    brand: "Next Cola",
    packName: "Crate",
    unitsPerPack: 24,
    wholesalePackPricePaisa: 216000,
    retailPackPricePaisa: 240000,
    requiresCrate: true,
    stockBaseUnits: 12000,
  },
  {
    id: 2,
    sku: "NC-1.5-PET",
    name: "Next Cola 1.5L PET Bottle",
    brand: "Next Cola",
    packName: "Pack",
    unitsPerPack: 6,
    wholesalePackPricePaisa: 105000,
    retailPackPricePaisa: 120000,
    requiresCrate: false,
    stockBaseUnits: 3000,
  },
  {
    id: 3,
    sku: "NC-500-PET",
    name: "Next Cola 500ml PET Bottle",
    brand: "Next Cola",
    packName: "Pack",
    unitsPerPack: 12,
    wholesalePackPricePaisa: 126000,
    retailPackPricePaisa: 144000,
    requiresCrate: false,
    stockBaseUnits: 6000,
  },
  {
    id: 4,
    sku: "NC-250-CAN",
    name: "Next Cola 250ml Sleek Can",
    brand: "Next Cola",
    packName: "Tray",
    unitsPerPack: 24,
    wholesalePackPricePaisa: 240000,
    retailPackPricePaisa: 264000,
    requiresCrate: false,
    stockBaseUnits: 2400,
  },
  {
    id: 5,
    sku: "FZ-250-RGB",
    name: "Fizz Up Lemon 250ml Glass Bottle",
    brand: "Fizz Up",
    packName: "Crate",
    unitsPerPack: 24,
    wholesalePackPricePaisa: 216000,
    retailPackPricePaisa: 240000,
    requiresCrate: true,
    stockBaseUnits: 7200,
  },
  {
    id: 6,
    sku: "FZ-1.5-PET",
    name: "Fizz Up Lemon 1.5L PET Bottle",
    brand: "Fizz Up",
    packName: "Pack",
    unitsPerPack: 6,
    wholesalePackPricePaisa: 105000,
    retailPackPricePaisa: 120000,
    requiresCrate: false,
    stockBaseUnits: 1800,
  },
  {
    id: 7,
    sku: "NO-250-RGB",
    name: "Next Orange 250ml Glass Bottle",
    brand: "Next Orange",
    packName: "Crate",
    unitsPerPack: 24,
    wholesalePackPricePaisa: 216000,
    retailPackPricePaisa: 240000,
    requiresCrate: true,
    stockBaseUnits: 4800,
  },
  {
    id: 8,
    sku: "NW-500-PET",
    name: "Next Pure Mineral Water 500ml",
    brand: "Next Pure",
    packName: "Pack",
    unitsPerPack: 24,
    wholesalePackPricePaisa: 96000,
    retailPackPricePaisa: 120000,
    requiresCrate: false,
    stockBaseUnits: 4800,
  },
  {
    id: 9,
    sku: "NW-1.5-PET",
    name: "Next Pure Mineral Water 1.5L",
    brand: "Next Pure",
    packName: "Pack",
    unitsPerPack: 6,
    wholesalePackPricePaisa: 60000,
    retailPackPricePaisa: 72000,
    requiresCrate: false,
    stockBaseUnits: 2400,
  },
];

const CUSTOMER_OPTIONS: CustomerSummary[] = [
  {
    id: 1,
    name: "Muhammad Akram",
    shopName: "Bismillah Kiryana Store",
    priceTier: "WHOLESALE",
    creditLimitPaisa: 20000000, // ₨ 200,000
    currentBalancePaisa: 4500000,
    currentCrateBalance: 15,
  },
  {
    id: 2,
    name: "Haji Abdul Sattar",
    shopName: "Madina Super Store",
    priceTier: "WHOLESALE",
    creditLimitPaisa: 30000000, // ₨ 300,000
    currentBalancePaisa: 1200000,
    currentCrateBalance: 0,
  },
  {
    id: 3,
    name: "Rehman Ullah",
    shopName: "Al-Rehman Cold Corner",
    priceTier: "RETAIL",
    creditLimitPaisa: 8000000, // ₨ 80,000
    currentBalancePaisa: 6800000,
    currentCrateBalance: 8,
  },
];

export const PosTerminal: React.FC = () => {
  const {
    cart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    selectedCustomer,
    setSelectedCustomer,
    paymentType,
    setPaymentType,
    paidAmountPaisa,
    setPaidAmountPaisa,
    invoiceDiscountPaisa,
    setInvoiceDiscountPaisa,
    crateDepositChargedPaisa,
    cratesIssued,
    setCratesIssued,
    cratesReturned,
    setCratesReturned,
    adminOverridePin,
    setAdminOverridePin,
    creditStatus,
    checkCredit,
    checkout,
    cancelInvoice,
    invoices,
    fetchInvoices,
    activeReceipt,
    isReceiptModalOpen,
    closeReceiptModal,
    openPurchaseModal,
    openClosingModal,
    isLoading,
    error,
  } = useSalesStore();

  const [catalogItems, setCatalogItems] = useState<CatalogProduct[]>(DEFAULT_CATALOG);
  const [searchQuery, setSearchQuery] = useState("");
  const [cashTenderedPaisa, setCashTenderedPaisa] = useState<number>(0);
  const [cancelModalInvoiceId, setCancelModalInvoiceId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelAdminPin, setCancelAdminPin] = useState("1234");
  const [showInvoicesDrawer, setShowInvoicesDrawer] = useState(false);

  // New M6 Modals
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isWasooliModalOpen, setIsWasooliModalOpen] = useState(false);

  // Input Refs for Keyboard Navigation
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerSelectRef = useRef<HTMLSelectElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const cashTenderedRef = useRef<HTMLInputElement>(null);
  const cratesReturnedRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Load dynamic stock catalog
  useEffect(() => {
    const loadStock = async () => {
      try {
        const stock = await inventoryService.getStockOverview();
        if (stock && stock.length > 0) {
          const mapped: CatalogProduct[] = stock.map((s, idx) => ({
            id: idx + 1,
            sku: s.sku_code,
            name: s.name,
            brand: s.brand || "Nextco",
            packName: s.pack_unit_name || "Crate",
            unitsPerPack: s.units_per_pack || 24,
            wholesalePackPricePaisa: s.wholesale_price_pack_paisa || 216000,
            retailPackPricePaisa: s.retail_price_pack_paisa || 240000,
            requiresCrate:
              s.requires_crate ??
              (s.packaging_type === "RGB_GLASS" ||
                s.pack_unit_name?.toLowerCase().includes("crate") ||
                false),
            stockBaseUnits: s.current_stock_base_units || 1000,
          }));
          setCatalogItems(mapped);
        }
      } catch {
        // Retain default catalog
      }
    };
    loadStock();
  }, []);

  // Compute Cart Calculations
  let subtotalPaisa = 0;
  let totalBottlesInCart = 0;
  let glassCratesCount = 0;

  for (const it of cart) {
    const baseRate = it.unitsPerPack > 0 ? Math.floor(it.unitPricePaisa / it.unitsPerPack) : 0;
    const lineGross = it.packQty * it.unitPricePaisa + it.looseQty * baseRate;
    const lineNet = Math.max(0, lineGross - it.lineDiscountPaisa);
    subtotalPaisa += lineNet;
    totalBottlesInCart += it.packQty * it.unitsPerPack + it.looseQty;

    const prod = catalogItems.find((c) => c.id === it.productId);
    if (prod?.requiresCrate) {
      glassCratesCount += it.packQty;
    }
  }

  const netTotalPaisa = Math.max(0, subtotalPaisa - invoiceDiscountPaisa) + crateDepositChargedPaisa;

  // Auto-sync crates issued default if user hasn't typed manually
  useEffect(() => {
    if (cratesIssued === 0 && glassCratesCount > 0) {
      setCratesIssued(glassCratesCount);
    }
  }, [glassCratesCount, cratesIssued, setCratesIssued]);

  // Check credit status when due amount changes
  useEffect(() => {
    if (paymentType === "CREDIT" || paymentType === "SPLIT") {
      checkCredit();
    }
  }, [paymentType, netTotalPaisa, paidAmountPaisa, checkCredit]);

  // Global Keyboard Shortcuts (F1-F12, Esc) and Barcode Scanner Buffer
  useEffect(() => {
    let barcodeBuffer = "";
    let lastKeyTime = 0;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Hotkeys
      if (e.key === "F1") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchQuery("");
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        customerSelectRef.current?.focus();
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        discountInputRef.current?.focus();
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        setPaymentType("CASH");
        cashTenderedRef.current?.focus();
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        setPaymentType("CREDIT");
        return;
      }
      if (e.key === "F6") {
        e.preventDefault();
        setIsSplitModalOpen(true);
        return;
      }
      if (e.key === "F7") {
        e.preventDefault();
        cratesReturnedRef.current?.focus();
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        setShowInvoicesDrawer((prev) => !prev);
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        openPurchaseModal();
        return;
      }
      if (e.key === "F10") {
        e.preventDefault();
        setIsWasooliModalOpen(true);
        return;
      }
      if (e.key === "F11") {
        e.preventDefault();
        openClosingModal();
        return;
      }
      if (e.key === "F12" || (e.ctrlKey && e.key === "Enter")) {
        e.preventDefault();
        if (cart.length > 0 && !isLoading) {
          handleCheckout();
        }
        return;
      }
      if (e.key === "Escape") {
        if (isSplitModalOpen) {
          setIsSplitModalOpen(false);
          return;
        }
        if (isWasooliModalOpen) {
          setIsWasooliModalOpen(false);
          return;
        }
        if (showInvoicesDrawer) {
          setShowInvoicesDrawer(false);
          return;
        }
        if (cancelModalInvoiceId !== null) {
          setCancelModalInvoiceId(null);
          return;
        }
        setSearchQuery("");
        return;
      }

      // Barcode rapid scan listener (<50ms)
      const now = Date.now();
      if (now - lastKeyTime > 50) {
        barcodeBuffer = "";
      }
      lastKeyTime = now;

      if (e.key === "Enter" && barcodeBuffer.length >= 3) {
        const found = catalogItems.find(
          (p) => p.sku.toLowerCase() === barcodeBuffer.toLowerCase()
        );
        if (found) {
          e.preventDefault();
          handleProductClick(found);
          barcodeBuffer = "";
          return;
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    cart,
    isLoading,
    isSplitModalOpen,
    isWasooliModalOpen,
    showInvoicesDrawer,
    cancelModalInvoiceId,
    catalogItems,
  ]);

  const filteredProducts = catalogItems.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleProductClick = (p: CatalogProduct, quantity = 1) => {
    const isWholesale = selectedCustomer.priceTier === "WHOLESALE";
    const packPrice = isWholesale ? p.wholesalePackPricePaisa : p.retailPackPricePaisa;

    for (let i = 0; i < quantity; i++) {
      addToCart({
        productId: p.id,
        productName: p.name,
        skuCode: p.sku,
        unitsPerPack: p.unitsPerPack,
        packName: p.packName,
        unitPricePaisa: packPrice,
      });
    }
  };

  // Omni-search input key handler with Multiplier Syntax (<Qty>*<SKU>)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = searchQuery.trim();

      // Multiplier regex: e.g. "10*NC-250" or "5*1"
      const multiplierMatch = trimmed.match(/^(\d+)\s*[\*xX]\s*(.+)$/);
      if (multiplierMatch) {
        const qty = parseInt(multiplierMatch[1], 10);
        const query = multiplierMatch[2].trim().toLowerCase();
        const matched = catalogItems.find(
          (p) =>
            p.sku.toLowerCase().includes(query) ||
            p.id.toString() === query ||
            p.name.toLowerCase().includes(query)
        );
        if (matched && qty > 0) {
          handleProductClick(matched, qty);
          setSearchQuery("");
          return;
        }
      } else if (filteredProducts.length === 1) {
        handleProductClick(filteredProducts[0], 1);
        setSearchQuery("");
        return;
      }
    }
  };

  const handleCheckout = async () => {
    try {
      await checkout();
    } catch {
      // handled
    }
  };

  const handleConfirmSplit = async (
    cashPaisa: number,
    _creditPaisa: number,
    overridePin?: string
  ) => {
    setPaymentType("SPLIT");
    setPaidAmountPaisa(cashPaisa);
    if (overridePin) {
      setAdminOverridePin(overridePin);
    }
    setTimeout(async () => {
      try {
        await checkout();
      } catch {
        // handled
      }
    }, 50);
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalInvoiceId) return;
    try {
      await cancelInvoice(cancelModalInvoiceId, cancelReason, cancelAdminPin);
      setCancelModalInvoiceId(null);
      setCancelReason("");
    } catch {
      // handled
    }
  };

  const changeDuePaisa = Math.max(0, cashTenderedPaisa - netTotalPaisa);

  return (
    <div className="space-y-4">
      {/* Top Cashier Cockpit Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 border border-slate-700 px-5 py-3 rounded-xl shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-600/20 text-red-500 rounded-lg">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span>POS Cockpit & Billing Counter</span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-500/40 rounded-full">
                ONLINE
              </span>
            </h2>
            <p className="text-xs text-slate-400">High-speed beverage billing, crates & debt accounting (PKR ₨)</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 text-xs">
          <button
            onClick={() => setIsWasooliModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow transition"
          >
            <Banknote className="w-4 h-4" />
            <span>Wasooli Raseed (F10)</span>
          </button>
          <button
            onClick={() => setShowInvoicesDrawer(!showInvoicesDrawer)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg border border-slate-600 font-medium transition"
          >
            <Receipt className="w-4 h-4 text-cyan-400" />
            <span>Ledger (F8)</span>
          </button>
          <button
            onClick={openPurchaseModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg border border-slate-600 font-medium transition"
          >
            <Truck className="w-4 h-4" />
            <span>Inward (F9)</span>
          </button>
          <button
            onClick={openClosingModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow transition"
          >
            <Lock className="w-4 h-4" />
            <span>Cash Closing (F11)</span>
          </button>
        </div>
      </div>

      {/* Shortcut Badges Navigation Banner */}
      <div className="bg-slate-850 bg-slate-900 border border-slate-800 px-4 py-1.5 rounded-lg flex items-center justify-between overflow-x-auto text-[11px] text-slate-400 font-mono">
        <div className="flex items-center space-x-4">
          <span><kbd className="text-cyan-400 font-bold bg-slate-800 px-1 rounded">F1</kbd> Search</span>
          <span><kbd className="text-cyan-400 font-bold bg-slate-800 px-1 rounded">F2</kbd> Khata</span>
          <span><kbd className="text-cyan-400 font-bold bg-slate-800 px-1 rounded">F3</kbd> Disc</span>
          <span><kbd className="text-cyan-400 font-bold bg-slate-800 px-1 rounded">F4</kbd> Cash</span>
          <span><kbd className="text-cyan-400 font-bold bg-slate-800 px-1 rounded">F5</kbd> Udhaar</span>
          <span><kbd className="text-cyan-400 font-bold bg-slate-800 px-1 rounded">F6</kbd> Split</span>
          <span><kbd className="text-cyan-400 font-bold bg-slate-800 px-1 rounded">F7</kbd> Crates</span>
          <span><kbd className="text-cyan-400 font-bold bg-slate-800 px-1 rounded">F10</kbd> Wasooli</span>
          <span><kbd className="text-cyan-400 font-bold bg-slate-800 px-1 rounded">F12</kbd> Complete</span>
        </div>
        <div className="text-slate-500 text-[10px]">Syntax: &lt;Qty&gt;*&lt;SKU&gt; (e.g. 10*NC-250)</div>
      </div>

      {/* POS Grid: Catalog on Left, Cart & Payment on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Product Catalog (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Customer Selection & Credit Status Pill */}
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">
                Customer Khata Selector (Press <kbd className="text-cyan-400 font-mono">F2</kbd>)
              </label>
              {creditStatus && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    creditStatus.status === "ACTIVE"
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-500/40"
                      : creditStatus.status === "WARNING"
                      ? "bg-amber-950 text-amber-400 border border-amber-500/40"
                      : "bg-red-950 text-red-400 border border-red-500/40"
                  }`}
                >
                  Credit: {creditStatus.status} ({creditStatus.utilization_percentage}%)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                ref={customerSelectRef}
                value={selectedCustomer.id}
                onChange={(e) => {
                  const cust = CUSTOMER_OPTIONS.find((c) => c.id === Number(e.target.value));
                  if (cust) setSelectedCustomer(cust);
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs outline-none focus:border-cyan-500"
              >
                {CUSTOMER_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.shopName} ({c.name}) — {c.priceTier}
                  </option>
                ))}
              </select>

              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border border-slate-700/60 rounded-lg text-xs font-mono">
                <span className="text-slate-400">Khata Debt: {formatPkr(selectedCustomer.currentBalancePaisa)}</span>
                <span className="text-amber-400 font-semibold">{selectedCustomer.currentCrateBalance} Crates</span>
              </div>
            </div>
          </div>

          {/* Search Bar with Multiplier support */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search SKU (NC-250), barcode, or multiplier (10*NC-250)... [F1]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 font-medium"
            />
          </div>

          {/* Beverage SKU Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredProducts.map((p) => {
              const isWholesale = selectedCustomer.priceTier === "WHOLESALE";
              const packPrice = isWholesale ? p.wholesalePackPricePaisa : p.retailPackPricePaisa;
              const unitPrice = Math.floor(packPrice / p.unitsPerPack);

              return (
                <button
                  key={p.id}
                  onClick={() => handleProductClick(p)}
                  className="bg-slate-800 hover:bg-slate-750 active:scale-95 border border-slate-700 hover:border-cyan-500/60 p-3.5 rounded-xl text-left transition flex flex-col justify-between group shadow-sm"
                >
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-cyan-300">
                        {p.sku}
                      </span>
                      {p.requiresCrate && (
                        <span className="text-[10px] text-amber-400 font-semibold">RGB Crate</span>
                      )}
                    </div>
                    <h3 className="font-bold text-white text-xs group-hover:text-cyan-300 transition line-clamp-2">
                      {p.name}
                    </h3>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-emerald-400">
                      {formatPkr(packPrice)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ₨ {(unitPrice / 100).toFixed(0)}/btl
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Cart & Checkout (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <span className="font-bold text-white text-sm flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-cyan-400" />
                <span>Sales Cart ({cart.length} SKUs, {totalBottlesInCart} Bottles)</span>
              </span>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-slate-400 hover:text-red-400 text-xs flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Cart Table */}
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <ShoppingCart className="w-8 h-8 mx-auto opacity-30 text-slate-500" />
                <p>Cart is currently empty.</p>
                <p className="text-[11px] text-slate-500">
                  Scan barcode, click SKU on left, or enter <code className="text-cyan-400">10*NC-250</code>
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {cart.map((it) => {
                  const baseRate =
                    it.unitsPerPack > 0 ? Math.floor(it.unitPricePaisa / it.unitsPerPack) : 0;
                  const lineGross = it.packQty * it.unitPricePaisa + it.looseQty * baseRate;
                  const lineNet = Math.max(0, lineGross - it.lineDiscountPaisa);
                  const totalLineBottles = it.packQty * it.unitsPerPack + it.looseQty;

                  return (
                    <div
                      key={it.productId}
                      className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-3 text-xs space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-white">{it.productName}</span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {it.skuCode} • {it.packName} of {it.unitsPerPack}
                          </span>
                        </div>
                        <button
                          onClick={() => removeFromCart(it.productId)}
                          className="text-slate-400 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Multi-packaging Dual Inputs */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                        <div>
                          <label className="text-[10px] text-slate-400 block font-medium">
                            {it.packName}s (Packs)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={it.packQty}
                            onChange={(e) =>
                              updateCartItem(it.productId, {
                                packQty: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 font-mono text-white text-xs outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block font-medium">Loose (Bottles)</label>
                          <input
                            type="number"
                            min="0"
                            value={it.looseQty}
                            onChange={(e) =>
                              updateCartItem(it.productId, {
                                looseQty: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 font-mono text-white text-xs outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800 font-mono">
                        <span className="text-slate-400">= {totalLineBottles} btl total</span>
                        <span className="font-bold text-emerald-400">{formatPkr(lineNet)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empties Counter Exchange */}
            <div className="bg-slate-900/60 border border-slate-700/60 p-3 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300 font-medium">
                <span className="flex items-center space-x-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>Crate Counter Exchange (Press <kbd className="text-cyan-400 font-mono">F7</kbd>)</span>
                </span>
                <span className="font-mono text-amber-400">Required: {glassCratesCount}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">Issued</label>
                  <input
                    type="number"
                    min="0"
                    value={cratesIssued}
                    onChange={(e) => setCratesIssued(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 font-mono text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Returned</label>
                  <input
                    ref={cratesReturnedRef}
                    type="number"
                    min="0"
                    value={cratesReturned}
                    onChange={(e) => setCratesReturned(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 font-mono text-white text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Totals & Discounts */}
            <div className="space-y-2 pt-2 border-t border-slate-700 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal (Drinks):</span>
                <span className="font-mono font-semibold">{formatPkr(subtotalPaisa)}</span>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-slate-400 flex items-center space-x-1">
                  <span>Bill Discount (₨)</span>
                  <kbd className="text-cyan-400 text-[10px] font-mono">F3</kbd>
                </label>
                <input
                  ref={discountInputRef}
                  type="number"
                  min="0"
                  step="any"
                  value={invoiceDiscountPaisa ? invoiceDiscountPaisa / 100 : ""}
                  onChange={(e) =>
                    setInvoiceDiscountPaisa(Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)))
                  }
                  placeholder="0.00"
                  className="w-28 text-right bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-white text-xs outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-between items-center text-sm font-bold pt-2 border-t border-slate-700 text-white">
                <span>NET TOTAL PAYABLE:</span>
                <span className="font-mono text-lg text-emerald-400">{formatPkr(netTotalPaisa)}</span>
              </div>
            </div>

            {/* Payment Mode Selector Buttons */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Payment Channel
              </label>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setPaymentType("CASH")}
                  className={`py-2 px-1 rounded-lg font-bold transition flex flex-col items-center space-y-0.5 ${
                    paymentType === "CASH"
                      ? "bg-emerald-600 text-white shadow"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  <span>CASH</span>
                  <span className="text-[10px] opacity-75 font-mono">F4</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType("CREDIT")}
                  className={`py-2 px-1 rounded-lg font-bold transition flex flex-col items-center space-y-0.5 ${
                    paymentType === "CREDIT"
                      ? "bg-amber-600 text-white shadow"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  <span>UDHAAR</span>
                  <span className="text-[10px] opacity-75 font-mono">F5</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSplitModalOpen(true)}
                  className={`py-2 px-1 rounded-lg font-bold transition flex flex-col items-center space-y-0.5 ${
                    paymentType === "SPLIT"
                      ? "bg-cyan-600 text-white shadow"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  <span>SPLIT</span>
                  <span className="text-[10px] opacity-75 font-mono">F6</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType("BANK")}
                  className={`py-2 px-1 rounded-lg font-bold transition flex flex-col items-center space-y-0.5 ${
                    paymentType === "BANK"
                      ? "bg-purple-600 text-white shadow"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  <span>BANK</span>
                  <span className="text-[10px] opacity-75 font-mono">Raast</span>
                </button>
              </div>

              {/* Cash Tendered & Change Return if CASH */}
              {paymentType === "CASH" && (
                <div className="p-3 bg-slate-900/80 border border-slate-700 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Cash Received at Counter (₨):</span>
                    <input
                      ref={cashTenderedRef}
                      type="number"
                      min="0"
                      step="any"
                      value={cashTenderedPaisa ? cashTenderedPaisa / 100 : ""}
                      onChange={(e) =>
                        setCashTenderedPaisa(Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)))
                      }
                      placeholder={(netTotalPaisa / 100).toString()}
                      className="w-28 text-right bg-slate-800 border border-slate-600 rounded px-2 py-1 font-mono text-emerald-300 font-bold"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                    <span className="text-slate-400">Baqaya / Change to Return:</span>
                    <span className="font-mono font-bold text-cyan-400">{formatPkr(changeDuePaisa)}</span>
                  </div>
                </div>
              )}

              {/* Supervisor PIN Alert if Credit Limit Breached */}
              {creditStatus?.status === "BREACHED" && (
                <div className="p-3 bg-red-950/70 border border-red-600/50 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-red-300 font-bold">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>Credit Limit Breached! Admin Override Required</span>
                  </div>
                  <input
                    type="password"
                    placeholder="Enter Supervisor / Admin PIN (1234)"
                    value={adminOverridePin}
                    onChange={(e) => setAdminOverridePin(e.target.value)}
                    className="w-full bg-slate-900 border border-red-500 rounded p-2 text-white font-mono text-center"
                  />
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-2.5 bg-red-950/80 border border-red-500/50 rounded-lg text-red-200 text-xs">
                {error}
              </div>
            )}

            {/* Complete Sale Button (F12) */}
            <button
              onClick={handleCheckout}
              disabled={isLoading || cart.length === 0}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg transition flex items-center justify-center space-x-2 text-sm"
            >
              <CreditCard className="w-4 h-4" />
              <span>{isLoading ? "Finalizing Invoice..." : "Complete Sale & Print Receipt (F12)"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* M6 Modals */}
      {/* 1. Thermal Receipt Modal */}
      {isReceiptModalOpen && activeReceipt && (
        <ThermalReceiptModal receipt={activeReceipt} onClose={closeReceiptModal} />
      )}

      {/* 2. Split Payment Modal */}
      <SplitPaymentModal
        isOpen={isSplitModalOpen}
        onClose={() => setIsSplitModalOpen(false)}
        totalPayablePaisa={netTotalPaisa}
        customer={selectedCustomer}
        onConfirmSplit={handleConfirmSplit}
      />

      {/* 3. Wasooli Raseed Modal */}
      <WasooliRaseedModal
        isOpen={isWasooliModalOpen}
        onClose={() => setIsWasooliModalOpen(false)}
        customers={CUSTOMER_OPTIONS}
        preSelectedCustomerId={selectedCustomer.id}
        onRecoveryComplete={() => {
          fetchInvoices();
        }}
      />

      {/* Recent Invoices Ledger Drawer */}
      {showInvoicesDrawer && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg space-y-3">
          <div className="flex justify-between items-center border-b border-slate-700 pb-2">
            <h3 className="font-bold text-white text-sm">Recent POS Sales Invoices</h3>
            <button onClick={() => setShowInvoicesDrawer(false)} className="text-slate-400 hover:text-white text-xs">
              Close (Esc)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="p-2">Invoice #</th>
                  <th className="p-2">Customer</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Net Total</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-750">
                    <td className="p-2 font-bold text-cyan-300">{inv.invoice_number}</td>
                    <td className="p-2 font-sans">{inv.customer_name}</td>
                    <td className="p-2 text-slate-400">{inv.invoice_date}</td>
                    <td className="p-2">{inv.payment_type}</td>
                    <td className="p-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inv.status === "PAID"
                            ? "bg-emerald-950 text-emerald-400"
                            : inv.status === "CANCELLED"
                            ? "bg-red-950 text-red-400"
                            : "bg-amber-950 text-amber-400"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-2 text-right font-bold text-white">
                      {formatPkr(inv.net_total_paisa)}
                    </td>
                    <td className="p-2 text-center">
                      {!inv.is_cancelled && !inv.is_locked && (
                        <button
                          onClick={() => setCancelModalInvoiceId(inv.id)}
                          className="px-2 py-0.5 bg-red-700/80 hover:bg-red-600 text-white rounded text-[10px] font-bold"
                        >
                          Cancel Bill
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bill Cancellation Dialog */}
      {cancelModalInvoiceId !== null && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs font-sans">
            <div className="flex items-center space-x-2 text-red-400 font-bold text-sm">
              <RotateCcw className="w-5 h-5" />
              <span>Supervisor Bill Cancellation</span>
            </div>
            <p className="text-slate-300">
              Cancelling this invoice will atomically restore warehouse drink stock, reverse customer ledger debt,
              and record an immutable audit log entry.
            </p>

            <div>
              <label className="text-slate-400 block mb-1">Mandatory Cancellation Reason</label>
              <input
                type="text"
                placeholder="e.g. Retailer order canceled prior to departure"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Supervisor / Admin PIN</label>
              <input
                type="password"
                placeholder="Admin PIN (e.g. 1234)"
                value={cancelAdminPin}
                onChange={(e) => setCancelAdminPin(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setCancelModalInvoiceId(null)}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={!cancelReason.trim()}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-lg"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-modals */}
      <PurchaseEntryModal />
      <DailyClosingModal />
    </div>
  );
};
