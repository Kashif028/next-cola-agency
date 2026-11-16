import React, { useState, useEffect, useRef } from "react";
import { useSalesStore, CustomerSummary } from "../../store/useSalesStore";
import {
  ShoppingCart,
  Search,
  Receipt,
  Plus,
  Coins,
  Truck,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { loadSavedProducts, ProductItem } from "../../types/products";
import { loadSavedTruckExpenses } from "../../types/truckExpense";
import { AddFlavorModal } from "./AddFlavorModal";
import { ThermalReceiptModal } from "./ThermalReceiptModal";

const CUSTOMER_OPTIONS: CustomerSummary[] = [
  {
    id: 1,
    name: "Walk-in Cash Customer",
    shopName: "Counter Sale",
    priceTier: "RETAIL",
    creditLimitPaisa: 0,
    currentBalancePaisa: 0,
    currentCrateBalance: 0,
  },
  {
    id: 2,
    name: "Haji Muhammad Aslam",
    shopName: "Bismillah Kiryana Store",
    priceTier: "WHOLESALE",
    creditLimitPaisa: 15000000,
    currentBalancePaisa: 4250000,
    currentCrateBalance: 24,
  },
  {
    id: 3,
    name: "Tariq Mehmood",
    shopName: "Madina Super Store",
    priceTier: "WHOLESALE",
    creditLimitPaisa: 25000000,
    currentBalancePaisa: 11200000,
    currentCrateBalance: 40,
  },
  {
    id: 4,
    name: "Al-Rehman Store",
    shopName: "Al-Rehman Cold Corner",
    priceTier: "RETAIL",
    creditLimitPaisa: 8000000,
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
    invoiceDiscountPaisa,
    setInvoiceDiscountPaisa,
    checkout,
    fetchInvoices,
    activeReceipt,
    isReceiptModalOpen,
    closeReceiptModal,
    isLoading,
  } = useSalesStore();

  const [products, setProducts] = useState<ProductItem[]>(loadSavedProducts());
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddFlavorModal, setShowAddFlavorModal] = useState(false);

  // Manual Quantity Editing on Flavor Card
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [cardQtyInput, setCardQtyInput] = useState<string>("");

  // Truck Expenses Allocation
  const truckExpenses = loadSavedTruckExpenses();
  const truckExpensePerPackPkr = truckExpenses[0]?.expensePerPackPkr || 20; // Default Rs. 20 per pack

  // Input refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const categories = ["All", "Next Cola", "Fizz Up", "Other Beverages", "Special"];

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    if (selectedCategory === "All") return matchesSearch;
    if (selectedCategory === "Next Cola") return matchesSearch && p.name.includes("Next Cola");
    if (selectedCategory === "Fizz Up") return matchesSearch && p.name.includes("Fizz Up");
    if (selectedCategory === "Other Beverages")
      return matchesSearch && !p.name.includes("Next Cola") && !p.name.includes("Fizz Up");
    return matchesSearch;
  });

  // Handle Card Click (Increment Quantity by 1 PET pack)
  const handleProductCardClick = (p: ProductItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isWholesale = selectedCustomer.priceTier === "WHOLESALE";
    const packPrice = isWholesale ? p.wholesalePackPricePaisa : p.retailPackPricePaisa;

    addToCart({
      productId: p.id,
      productName: p.name,
      skuCode: p.sku,
      unitsPerPack: p.bottlesPerPack || 12,
      packName: "PET",
      unitPricePaisa: packPrice,
    });
  };

  // Direct manual quantity edit on card
  const handleSaveCardQty = (productId: number) => {
    const qty = parseInt(cardQtyInput, 10);
    if (!isNaN(qty) && qty >= 0) {
      if (qty === 0) {
        removeFromCart(productId);
      } else {
        const itemInCart = cart.find((it) => it.productId === productId);
        if (itemInCart) {
          updateCartItem(productId, { packQty: qty });
        } else {
          const prod = products.find((p) => p.id === productId);
          if (prod) {
            const isWholesale = selectedCustomer.priceTier === "WHOLESALE";
            const packPrice = isWholesale ? prod.wholesalePackPricePaisa : prod.retailPackPricePaisa;
            for (let i = 0; i < qty; i++) {
              addToCart({
                productId: prod.id,
                productName: prod.name,
                skuCode: prod.sku,
                unitsPerPack: prod.bottlesPerPack || 12,
                packName: "PET",
                unitPricePaisa: packPrice,
              });
            }
          }
        }
      }
    }
    setEditingCardId(null);
    setCardQtyInput("");
  };

  // Cart financial calculations with Truck Landed Cost
  let totalItemsPacks = 0;
  let totalSalePaisa = 0;
  let totalPurchaseCostPaisa = 0;

  cart.forEach((it) => {
    totalItemsPacks += it.packQty;
    const lineGross = it.packQty * it.unitPricePaisa;
    totalSalePaisa += lineGross;

    const originalProd = products.find((p) => p.id === it.productId);
    const purchaseCost = originalProd ? originalProd.purchasePackPricePaisa : it.unitPricePaisa * 0.8;
    totalPurchaseCostPaisa += it.packQty * purchaseCost;
  });

  const totalTruckExpensesAllocatedPaisa = totalItemsPacks * Math.round(truckExpensePerPackPkr * 100);
  const totalLandedCostPaisa = totalPurchaseCostPaisa + totalTruckExpensesAllocatedPaisa;
  const netTotalPaisa = Math.max(0, totalSalePaisa - invoiceDiscountPaisa);

  // Profit Calculations
  const netProfitPaisa = Math.max(0, netTotalPaisa - totalLandedCostPaisa);
  const netProfitMargin =
    netTotalPaisa > 0 ? ((netProfitPaisa / netTotalPaisa) * 100).toFixed(2) : "0.00";
  const markupPercent =
    totalLandedCostPaisa > 0 ? ((netProfitPaisa / totalLandedCostPaisa) * 100).toFixed(2) : "0.00";

  const handleCheckout = async () => {
    try {
      await checkout();
    } catch {
      // error handled
    }
  };

  return (
    <div className="space-y-4 bg-[#F5F6FA] min-h-screen text-[#1F2937] p-2">
      {/* Top VIP Metrics Ribbon (Matching Reference Design) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Sales Card */}
        <div className="bg-[#2563EB] text-white rounded-xl p-3 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center font-bold">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider opacity-90 block">Sales</span>
            <div className="text-sm font-bold">Daily: ₨ 45,750</div>
            <div className="text-[10px] opacity-80">Weekly: ₨ 289,400</div>
          </div>
        </div>

        {/* Profit After Expenses Card */}
        <div className="bg-[#16A34A] text-white rounded-xl p-3 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider opacity-90 block">
              Profit (After Expenses)
            </span>
            <div className="text-sm font-bold">Daily: ₨ 7,350</div>
            <div className="text-[10px] opacity-80">Weekly: ₨ 52,200</div>
          </div>
        </div>

        {/* Purchase Card */}
        <div className="bg-[#EA580C] text-white rounded-xl p-3 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center font-bold">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider opacity-90 block">Purchase</span>
            <div className="text-sm font-bold">Daily: ₨ 38,600</div>
            <div className="text-[10px] opacity-80">Weekly: ₨ 274,800</div>
          </div>
        </div>

        {/* Recovery Card */}
        <div className="bg-[#7C3AED] text-white rounded-xl p-3 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center font-bold">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider opacity-90 block">Recovery</span>
            <div className="text-sm font-bold">Daily: ₨ 33,000</div>
            <div className="text-[10px] opacity-80">Weekly: ₨ 71,800</div>
          </div>
        </div>

        {/* Credit Given Card */}
        <div className="bg-[#0D9488] text-white rounded-xl p-3 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center font-bold">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider opacity-90 block">Credit Given</span>
            <div className="text-sm font-bold">Total Due: ₨ 86,200</div>
            <div className="text-[10px] opacity-80">Outstanding: ₨ 86,200</div>
          </div>
        </div>
      </div>

      {/* Main Billing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Side: Product Flavor Grid (7 Columns) */}
        <div className="lg:col-span-7 space-y-3">
          {/* Search & Add New Flavor Bar */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#6B7280] absolute left-3 top-2.5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search Product / SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#E5E7EB] rounded-lg pl-9 pr-3 py-2 text-xs text-[#1F2937] placeholder-[#6B7280] outline-none focus:border-[#D92D3A]"
              />
            </div>
            <button
              onClick={() => setShowAddFlavorModal(true)}
              className="flex items-center space-x-1.5 px-4 py-2 bg-[#D92D3A] hover:bg-[#B91C2B] text-white rounded-lg text-xs font-bold shadow transition shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add New Flavor</span>
            </button>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center space-x-2 overflow-x-auto text-xs pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                  selectedCategory === cat
                    ? "bg-[#D92D3A] text-white shadow"
                    : "bg-white text-[#1F2937] border border-[#E5E7EB] hover:bg-[#FDECEE]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Dynamic Flexible Card Grid */}
          <div
            className="grid gap-3 max-h-[550px] overflow-y-auto p-1"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            }}
          >
            {filteredProducts.map((p) => {
              const inCartItem = cart.find((it) => it.productId === p.id);
              const qtyInCart = inCartItem?.packQty || 0;
              const isSelected = qtyInCart > 0;
              const isLowStock = p.stockPacks < 50;

              return (
                <div
                  key={p.id}
                  onClick={(e) => handleProductCardClick(p, e)}
                  className={`relative bg-white rounded-xl p-3 border transition cursor-pointer flex flex-col items-center justify-between shadow-sm hover:shadow-md ${
                    isSelected ? "border-[#D92D3A] bg-[#FDECEE]" : "border-[#E5E7EB] hover:border-gray-300"
                  }`}
                  style={{ minHeight: "175px" }}
                >
                  {/* Selected Badge with Editable Quantity */}
                  {isSelected && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCardId(p.id);
                        setCardQtyInput(qtyInCart.toString());
                      }}
                      className="absolute top-2 right-2 bg-[#D92D3A] text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs shadow z-10 hover:scale-110 transition"
                      title="Click to manually edit quantity"
                    >
                      {qtyInCart}
                    </div>
                  )}

                  {/* Centered Realistic Bottle Visual */}
                  <div className="w-16 h-24 my-1 flex items-center justify-center relative">
                    <svg viewBox="0 0 60 140" className="w-full h-full drop-shadow">
                      {/* Bottle Cap */}
                      <rect x="22" y="2" width="16" height="8" rx="2" fill="#D92D3A" />
                      {/* Bottle Neck */}
                      <path d="M24 10 L24 28 L14 45 L14 125 A 8 8 0 0 0 22 135 L38 135 A 8 8 0 0 0 46 125 L46 45 L36 28 L36 10 Z" fill={p.bottleColor || "#1E293B"} opacity="0.9" />
                      {/* Bottle Label */}
                      <rect x="14" y="55" width="32" height="38" rx="2" fill="#D92D3A" />
                      <text x="30" y="72" fontSize="7" fill="#FFFFFF" fontWeight="bold" textAnchor="middle">
                        NEXT
                      </text>
                      <text x="30" y="82" fontSize="6" fill="#FDECEE" textAnchor="middle">
                        COLA
                      </text>
                    </svg>
                  </div>

                  {/* Title & Size */}
                  <div className="text-center w-full">
                    <h4 className="font-bold text-xs text-[#1F2937] leading-tight line-clamp-2">
                      {p.name}
                    </h4>
                    <span className="text-[11px] text-[#6B7280] font-mono block mt-0.5">
                      Stock: {p.stockPacks}
                    </span>
                  </div>

                  {/* Stock Status Pill */}
                  <div className="w-full mt-2">
                    <span
                      className={`block w-full py-0.5 rounded text-[10px] font-bold text-center ${
                        isLowStock
                          ? "bg-[#FEF3C7] text-[#B45309]"
                          : "bg-[#DCFCE7] text-[#16A34A]"
                      }`}
                    >
                      {isLowStock ? "Low Stock" : "In Stock"}
                    </span>
                  </div>

                  {/* Quick Inline Quantity Setter Modal / Popover */}
                  {editingCardId === p.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-xl p-3 flex flex-col justify-center items-center z-20 space-y-2 border border-[#D92D3A]"
                    >
                      <span className="text-xs font-bold text-[#1F2937]">Enter Quantity:</span>
                      <input
                        type="number"
                        min="0"
                        autoFocus
                        value={cardQtyInput}
                        onChange={(e) => setCardQtyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveCardQty(p.id);
                          if (e.key === "Escape") setEditingCardId(null);
                        }}
                        className="w-20 border border-[#D92D3A] rounded px-2 py-1 text-center font-bold font-mono text-sm outline-none"
                      />
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleSaveCardQty(p.id)}
                          className="px-2 py-1 bg-[#16A34A] text-white text-[10px] font-bold rounded"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCardId(null)}
                          className="px-2 py-1 bg-gray-200 text-[#1F2937] text-[10px] font-bold rounded"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* "+ Add New Flavor" Inline Card Button */}
            <div
              onClick={() => setShowAddFlavorModal(true)}
              className="bg-[#FDECEE] border-2 border-dashed border-[#D92D3A] rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-red-100/50 transition group"
              style={{ minHeight: "175px" }}
            >
              <div className="w-10 h-10 rounded-full bg-white text-[#D92D3A] flex items-center justify-center font-bold shadow group-hover:scale-110 transition">
                <Plus className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-[#D92D3A] text-center mt-2">
                + نیا فلیور شامل کریں
              </span>
              <span className="text-[10px] text-[#6B7280]">Add Flavor Card</span>
            </div>
          </div>
        </div>

        {/* Right Side: Active Invoice & Landed Profit Panel (5 Columns) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-4 space-y-3">
            {/* Invoice Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB]">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded bg-[#D92D3A] text-white flex items-center justify-center font-bold text-xs">
                  #
                </div>
                <h3 className="font-bold text-sm text-[#1F2937]">Invoice # 000125</h3>
              </div>

              <div className="flex items-center space-x-1 text-xs">
                <span className="text-[#6B7280] font-semibold">Customer:</span>
                <select
                  value={selectedCustomer.id}
                  onChange={(e) => {
                    const cust = CUSTOMER_OPTIONS.find((c) => c.id === Number(e.target.value));
                    if (cust) setSelectedCustomer(cust);
                  }}
                  className="border border-[#E5E7EB] rounded px-2 py-1 text-xs font-bold outline-none bg-white text-[#1F2937]"
                >
                  {CUSTOMER_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Invoice Line Items Table */}
            <div className="overflow-x-auto max-h-[160px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F6FA] text-[#6B7280] font-semibold border-b border-[#E5E7EB]">
                  <tr>
                    <th className="p-2 w-8">#</th>
                    <th className="p-2">Product</th>
                    <th className="p-2 text-center w-14">Qty</th>
                    <th className="p-2 text-right">Rate (₨)</th>
                    <th className="p-2 text-right">Amount (₨)</th>
                    <th className="p-2 text-right text-[#16A34A]">Profit</th>
                    <th className="p-2 w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] font-mono">
                  {cart.map((it, idx) => {
                    const lineAmount = it.packQty * it.unitPricePaisa;
                    const prod = products.find((p) => p.id === it.productId);
                    const cost = prod ? prod.purchasePackPricePaisa : it.unitPricePaisa * 0.8;
                    const lineProfit = Math.max(0, lineAmount - it.packQty * cost);

                    return (
                      <tr key={it.productId} className="hover:bg-[#F5F6FA]">
                        <td className="p-2 text-[#6B7280]">{idx + 1}</td>
                        <td className="p-2 font-sans font-medium text-[#1F2937]">{it.productName}</td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min="1"
                            value={it.packQty}
                            onChange={(e) =>
                              updateCartItem(it.productId, {
                                packQty: Math.max(1, parseInt(e.target.value) || 1),
                              })
                            }
                            className="w-12 border border-[#E5E7EB] rounded p-1 text-center font-bold text-xs"
                          />
                        </td>
                        <td className="p-2 text-right text-[#6B7280]">
                          {(it.unitPricePaisa / 100).toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-bold text-[#1F2937]">
                          {(lineAmount / 100).toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-bold text-[#16A34A]">
                          {(lineProfit / 100).toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => removeFromCart(it.productId)}
                            className="text-[#DC2626] hover:text-red-800"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {cart.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-xs text-[#6B7280] font-sans">
                        No products added yet. Click flavor cards on left to add.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Truck Expenses Strip */}
            <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-xl p-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <Truck className="w-4 h-4 text-[#B45309]" />
                <span className="font-bold text-[#B45309]">Truck Expenses:</span>
                <span className="text-[#6B7280]">Transport Allocation:</span>
              </div>
              <div className="font-mono font-bold text-[#B45309]">
                ₨ {(totalTruckExpensesAllocatedPaisa / 100).toFixed(2)} (₨ {truckExpensePerPackPkr}/pack)
              </div>
            </div>

            {/* Profit Calculation (After Expenses) Callout Box */}
            <div className="bg-[#DCFCE7] border border-[#BBF7D0] rounded-xl p-3 space-y-2 text-xs">
              <div className="flex items-center space-x-2 font-bold text-[#16A34A] border-b border-[#BBF7D0] pb-1.5">
                <DollarSign className="w-4 h-4" />
                <span>Profit Calculation (After Expenses)</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Total Sale Amount:</span>
                  <span className="font-mono font-bold text-[#1F2937]">
                    ₨ {(totalSalePaisa / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Total Expenses:</span>
                  <span className="font-mono font-bold text-[#B45309]">
                    ₨ {(totalTruckExpensesAllocatedPaisa / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Total Cost (Purchase):</span>
                  <span className="font-mono font-bold text-[#1F2937]">
                    ₨ {(totalPurchaseCostPaisa / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#16A34A] font-bold">Net Profit:</span>
                  <span className="font-mono font-bold text-[#16A34A] text-sm">
                    ₨ {(netProfitPaisa / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="text-center font-bold text-[11px] text-[#16A34A] pt-1 border-t border-[#BBF7D0]">
                Markup: {markupPercent}% | Profit Margin: {netProfitMargin}%
              </div>
            </div>

            {/* Summary Totals & Discount Bar */}
            <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-[#E5E7EB]">
              <div>
                <span className="text-[#6B7280] block">Total Items: {cart.length}</span>
                <span className="text-[#1F2937] font-bold block">Total Packs: {totalItemsPacks}</span>
              </div>
              <div className="text-right">
                <span className="text-[#6B7280] block">Subtotal: ₨ {(totalSalePaisa / 100).toFixed(2)}</span>
                <div className="flex items-center justify-end space-x-1 mt-0.5">
                  <span className="text-[#6B7280]">Discount (₨):</span>
                  <input
                    ref={discountInputRef}
                    type="number"
                    min="0"
                    value={invoiceDiscountPaisa ? invoiceDiscountPaisa / 100 : ""}
                    onChange={(e) =>
                      setInvoiceDiscountPaisa(Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)))
                    }
                    placeholder="0"
                    className="w-16 border border-[#E5E7EB] rounded p-0.5 text-right font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Grand Total Bar */}
            <div className="bg-[#D92D3A] text-white p-3 rounded-xl flex items-center justify-between shadow">
              <span className="font-bold text-sm tracking-wide">Grand Total:</span>
              <span className="font-mono text-2xl font-black">₨ {(netTotalPaisa / 100).toFixed(2)}</span>
            </div>

            {/* Action Buttons (Save, Print, Clear) */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={handleCheckout}
                disabled={isLoading || cart.length === 0}
                className="py-2.5 bg-[#2563EB] hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl shadow transition text-xs flex items-center justify-center space-x-1"
              >
                <span>Save Bill (F5)</span>
              </button>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={isLoading || cart.length === 0}
                className="py-2.5 bg-[#16A34A] hover:bg-green-700 active:scale-95 text-white font-bold rounded-xl shadow transition text-xs flex items-center justify-center space-x-1"
              >
                <span>Print Bill (F6)</span>
              </button>

              <button
                type="button"
                onClick={clearCart}
                className="py-2.5 bg-white border-2 border-[#DC2626] text-[#DC2626] hover:bg-red-50 font-bold rounded-xl transition text-xs flex items-center justify-center space-x-1"
              >
                <span>Clear (ESC)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Flavor Modal */}
      <AddFlavorModal
        isOpen={showAddFlavorModal}
        onClose={() => setShowAddFlavorModal(false)}
        onFlavorAdded={(newProd) => {
          setProducts(loadSavedProducts());
          // Auto add 1 pack to cart for immediate billing
          addToCart({
            productId: newProd.id,
            productName: newProd.name,
            skuCode: newProd.sku,
            unitsPerPack: newProd.bottlesPerPack || 12,
            packName: "PET",
            unitPricePaisa: newProd.wholesalePackPricePaisa,
          });
        }}
      />

      {/* Thermal Receipt Print Modal */}
      {isReceiptModalOpen && activeReceipt && (
        <ThermalReceiptModal receipt={activeReceipt} onClose={closeReceiptModal} />
      )}
    </div>
  );
};
