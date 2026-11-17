// src/components/logistics/EditDeliverySheetModal.tsx
import { useState, useEffect, useMemo } from "react";
import { useLogisticsStore } from "../../store/useLogisticsStore";
import { formatPkr } from "../../types/domain";
import {
  DailyDispatchRecord,
  LoadingSheetSummaryDto,
  RecalibrateSheetPayload,
  RecalibrateSheetItemPayload,
} from "../../types/logistics";
import { loadSavedProducts, ProductItem } from "../../types/products";
import {
  X,
  Edit2,
  Trash2,
  Plus,
  Truck,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  DollarSign,
  User,
  MapPin,
  Calendar,
} from "lucide-react";

export interface EditDeliverySheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: DailyDispatchRecord | LoadingSheetSummaryDto | null;
  onSuccess?: () => void;
}

interface EditableLineItem {
  productId: number;
  productSku: string;
  productName: string;
  packName: string;
  unitsPerPack: number;
  wholesalePackPricePaisa: number;
  isGlass: boolean;
  dispatchedPacks: number;
  dispatchedLoose: number;
  returnedIntactPacks: number;
  returnedIntactLoose: number;
  damagedPacks: number;
  damagedLoose: number;
}

export function EditDeliverySheetModal({
  isOpen,
  onClose,
  sheet,
  onSuccess,
}: EditDeliverySheetModalProps) {
  const {
    dailyDispatches,
    recalibrateSheetSnapshot,
    fetchLoadingSheets,
  } = useLogisticsStore();

  // Find full daily dispatch record if available
  const fullRecord = useMemo<DailyDispatchRecord | undefined>(() => {
    if (!sheet) return undefined;
    const sheetId = sheet.id;
    const sheetNum = "sheetNumber" in sheet ? sheet.sheetNumber : sheet.sheet_number;
    return (
      dailyDispatches.find((d) => d.id === sheetId || d.sheetNumber === sheetNum) ||
      ("items" in sheet && Array.isArray((sheet as any).items)
        ? (sheet as DailyDispatchRecord)
        : undefined)
    );
  }, [sheet, dailyDispatches]);

  // Initial state derived synchronously so it renders correctly on first pass (including SSR)
  const [items, setItems] = useState<EditableLineItem[]>(() => {
    const rec =
      (sheet && "items" in sheet && Array.isArray((sheet as any).items)
        ? (sheet as DailyDispatchRecord)
        : undefined) ||
      (sheet
        ? dailyDispatches.find(
            (d) =>
              d.id === sheet.id ||
              d.sheetNumber === ("sheetNumber" in sheet ? sheet.sheetNumber : sheet.sheet_number)
          )
        : undefined);

    if (rec && rec.items) {
      return rec.items.map((it) => ({
        productId: it.productId,
        productSku: it.productSku,
        productName: it.productName,
        packName: it.packName || "Pack",
        unitsPerPack: it.unitsPerPack || 1,
        wholesalePackPricePaisa: it.wholesalePackPricePaisa || 0,
        isGlass: it.isGlass || false,
        dispatchedPacks: it.dispatchedPacks || 0,
        dispatchedLoose: it.dispatchedLoose || 0,
        returnedIntactPacks: it.returnedIntactPacks || 0,
        returnedIntactLoose: it.returnedIntactLoose || 0,
        damagedPacks: it.damagedPacks || 0,
        damagedLoose: it.damagedLoose || 0,
      }));
    }
    return [];
  });

  const [cashDepositedRupees, setCashDepositedRupees] = useState<number>(() => {
    const rec =
      (sheet && "cashDepositedPaisa" in sheet
        ? (sheet as DailyDispatchRecord)
        : undefined) ||
      (sheet
        ? dailyDispatches.find(
            (d) =>
              d.id === sheet.id ||
              d.sheetNumber === ("sheetNumber" in sheet ? sheet.sheetNumber : sheet.sheet_number)
          )
        : undefined);
    return Math.round((rec?.cashDepositedPaisa || 0) / 100);
  });

  const [selectedProductToAdd, setSelectedProductToAdd] = useState<number>(0);

  const [notes, setNotes] = useState<string>(() => {
    const rec =
      (sheet && "notes" in sheet
        ? (sheet as DailyDispatchRecord)
        : undefined) ||
      (sheet
        ? dailyDispatches.find(
            (d) =>
              d.id === sheet.id ||
              d.sheetNumber === ("sheetNumber" in sheet ? sheet.sheetNumber : sheet.sheet_number)
          )
        : undefined);
    return rec?.notes || "";
  });

  const [sheetStatus, setSheetStatus] = useState<string>(() => {
    if (sheet && "status" in sheet) return sheet.status;
    return "ISSUED";
  });

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Available product catalog
  const catalogProducts = useMemo<ProductItem[]>(() => {
    return loadSavedProducts();
  }, []);

  // Synchronize state when modal opens or sheet changes
  useEffect(() => {
    if (!isOpen || !sheet) return;

    setFeedbackError(null);
    setIsSaving(false);

    if (fullRecord) {
      setSheetStatus(fullRecord.status);
      setCashDepositedRupees(Math.round((fullRecord.cashDepositedPaisa || 0) / 100));
      setNotes(fullRecord.notes || "");

      const mappedItems: EditableLineItem[] = fullRecord.items.map((it) => ({
        productId: it.productId,
        productSku: it.productSku,
        productName: it.productName,
        packName: it.packName || "Pack",
        unitsPerPack: it.unitsPerPack || 1,
        wholesalePackPricePaisa: it.wholesalePackPricePaisa || 0,
        isGlass: it.isGlass || false,
        dispatchedPacks: it.dispatchedPacks || 0,
        dispatchedLoose: it.dispatchedLoose || 0,
        returnedIntactPacks: it.returnedIntactPacks || 0,
        returnedIntactLoose: it.returnedIntactLoose || 0,
        damagedPacks: it.damagedPacks || 0,
        damagedLoose: it.damagedLoose || 0,
      }));
      setItems(mappedItems);
    } else {
      // Fallback if not found in dailyDispatches
      const status = "status" in sheet ? sheet.status : "ISSUED";
      setSheetStatus(status);
      setCashDepositedRupees(0);
      setNotes("");
      setItems([]);
    }
  }, [isOpen, sheet, fullRecord]);

  if (!isOpen || !sheet) return null;

  const sheetNumber = "sheetNumber" in sheet ? sheet.sheetNumber : sheet.sheet_number;
  const routeName = "routeName" in sheet ? sheet.routeName : sheet.route_name;
  const driverName = "salesmanName" in sheet ? sheet.salesmanName : sheet.driver_name;
  const vehicleNumber = "vehicleNumber" in sheet ? sheet.vehicleNumber : sheet.vehicle_number;
  const dateStr = "date" in sheet ? sheet.date : sheet.sheet_date;
  const isDraft = sheetStatus === "DRAFT";

  // Financial calculations
  const lineCalculations = items.map((it) => {
    const unitsPerPack = it.unitsPerPack || 1;
    const unitPrice = Math.round((it.wholesalePackPricePaisa || 0) / unitsPerPack);
    const dispatchedBase = it.dispatchedPacks * unitsPerPack + it.dispatchedLoose;
    const returnedBase = it.returnedIntactPacks * unitsPerPack + it.returnedIntactLoose;
    const damagedBase = it.damagedPacks * unitsPerPack + it.damagedLoose;
    const soldBase = Math.max(0, dispatchedBase - returnedBase - damagedBase);
    const lineRevenuePaisa = soldBase * unitPrice;
    return {
      dispatchedBase,
      returnedBase,
      damagedBase,
      soldBase,
      lineRevenuePaisa,
    };
  });

  const totalLoadedBase = lineCalculations.reduce((acc, c) => acc + c.dispatchedBase, 0);
  const totalGrossRevenuePaisa = lineCalculations.reduce((acc, c) => acc + c.lineRevenuePaisa, 0);
  const cashDepositedPaisa = Math.max(0, Math.round(cashDepositedRupees * 100));
  const unpaidBalancePaisa = sheetStatus === "SETTLED" || sheetStatus === "FINALIZED"
    ? Math.max(0, totalGrossRevenuePaisa - cashDepositedPaisa)
    : 0;

  // Handlers for modifying line items
  const handleUpdateItem = (
    index: number,
    field: keyof EditableLineItem,
    value: number
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: Math.max(0, value),
      };
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddProduct = () => {
    if (!selectedProductToAdd) return;
    const prod = catalogProducts.find((p) => p.id === Number(selectedProductToAdd));
    if (!prod) return;

    // Check if already in items
    const exists = items.some((it) => it.productId === prod.id);
    if (exists) {
      setFeedbackError(`Product ${prod.name} is already in the sheet.`);
      return;
    }

    const newItem: EditableLineItem = {
      productId: prod.id,
      productSku: prod.sku,
      productName: prod.name,
      packName: prod.requiresCrate ? "Crate" : "Pack",
      unitsPerPack: prod.bottlesPerPack || 1,
      wholesalePackPricePaisa: prod.wholesalePackPricePaisa || 0,
      isGlass: prod.requiresCrate || false,
      dispatchedPacks: 0,
      dispatchedLoose: 0,
      returnedIntactPacks: 0,
      returnedIntactLoose: 0,
      damagedPacks: 0,
      damagedLoose: 0,
    };

    setItems((prev) => [...prev, newItem]);
    setSelectedProductToAdd(0);
    setFeedbackError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFeedbackError(null);

    try {
      const itemsPayload: RecalibrateSheetItemPayload[] = items.map((it) => ({
        productId: it.productId,
        dispatchedPacks: it.dispatchedPacks,
        dispatchedLoose: it.dispatchedLoose,
        returnedIntactPacks: it.returnedIntactPacks,
        returnedIntactLoose: it.returnedIntactLoose,
        damagedPacks: it.damagedPacks,
        damagedLoose: it.damagedLoose,
        wholesalePackPricePaisa: it.wholesalePackPricePaisa,
        unitsPerPack: it.unitsPerPack,
      }));

      const payload: RecalibrateSheetPayload = {
        sheetId: sheet.id,
        status: sheetStatus as "DRAFT" | "OPEN" | "ISSUED" | "SETTLED" | "FINALIZED",
        items: itemsPayload,
        cashDepositedPaisa,
        notes,
        salesmanKhataId: fullRecord?.salesmanKhataId || fullRecord?.salesmanId || 5,
      };

      await recalibrateSheetSnapshot(payload);
      await fetchLoadingSheets();

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 max-w-4xl w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-800/90 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-white text-base">Edit Delivery Sheet Record</h3>
                <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-amber-950 text-amber-300 border border-amber-500/40" dir="rtl">
                  ایڈٹ ریکارڈ
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-500/40">
                  {sheetNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Persistent multi-edit interface: adjust dispatch loads, intact returns, damages, & cash reconciliation
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metadata ribbon */}
        <div className="bg-slate-850 bg-slate-900/60 border-b border-slate-700/80 px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <span className="text-slate-500 text-[10px] block">Route & Beat</span>
              <span className="font-semibold text-slate-200">{routeName}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <User className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="text-slate-500 text-[10px] block">Salesman / Driver</span>
              <span className="font-semibold text-slate-200">{driverName}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Truck className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="text-slate-500 text-[10px] block">Vehicle</span>
              <span className="font-mono font-bold text-slate-200">{vehicleNumber}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <span className="text-slate-500 text-[10px] block">Status / Date</span>
              <div className="flex items-center space-x-1">
                <span className="font-mono text-slate-300">{dateStr}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                  {sheetStatus}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {feedbackError && (
            <div className="bg-rose-950/80 border border-rose-600/50 text-rose-300 p-3 rounded-xl flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{feedbackError}</span>
            </div>
          )}

          {/* Add SKU Selector Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/60 border border-slate-700/80 p-3 rounded-xl">
            <div className="flex items-center space-x-2 text-slate-300">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span className="font-bold">Add Additional SKU to Sheet:</span>
            </div>
            <div className="flex items-center space-x-2">
              <select
                value={selectedProductToAdd}
                onChange={(e) => setSelectedProductToAdd(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white outline-none focus:border-cyan-500 text-xs"
              >
                <option value={0}>-- Select Product SKU --</option>
                {catalogProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) - ₨ {(p.wholesalePackPricePaisa / 100).toLocaleString()}/{p.requiresCrate ? "Crate" : "Pack"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddProduct}
                disabled={!selectedProductToAdd}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg font-bold transition flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add SKU</span>
              </button>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-700 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-800 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="p-3 font-sans w-52">Product / SKU</th>
                  <th className="p-3 text-center">Dispatched (صبح مال)</th>
                  {!isDraft && (
                    <>
                      <th className="p-3 text-center text-teal-300">Returned Intact (صحیح واپسی)</th>
                      <th className="p-3 text-center text-rose-300">Damaged (ٹوٹ پھوٹ)</th>
                      <th className="p-3 text-right text-amber-300">Sold (فروخت)</th>
                      <th className="p-3 text-right text-emerald-300">Revenue (آمدن)</th>
                    </>
                  )}
                  <th className="p-3 text-center w-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 bg-slate-900/40">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={isDraft ? 3 : 7} className="p-8 text-center text-slate-400 font-sans">
                      No products on this delivery sheet. Use the selector above to add products.
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => {
                    const calc = lineCalculations[idx];
                    return (
                      <tr key={it.productId} className="hover:bg-slate-800/40 transition">
                        {/* Product Info */}
                        <td className="p-3 font-sans">
                          <div className="font-bold text-white leading-tight">{it.productName}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {it.productSku} • {it.unitsPerPack} btls/{it.packName}
                          </div>
                        </td>

                        {/* Dispatched Inputs */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] text-slate-400">Packs</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={it.dispatchedPacks === 0 ? "" : it.dispatchedPacks}
                                placeholder="0"
                                onChange={(e) =>
                                  handleUpdateItem(
                                    idx,
                                    "dispatchedPacks",
                                    Math.max(0, parseInt(e.target.value, 10) || 0)
                                  )
                                }
                                className="w-14 bg-slate-950 border border-slate-700 rounded p-1 text-center font-bold text-white focus:border-cyan-500 outline-none"
                              />
                            </div>
                            <span className="text-slate-500 mt-3">+</span>
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] text-slate-400">Loose</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={it.dispatchedLoose === 0 ? "" : it.dispatchedLoose}
                                placeholder="0"
                                onChange={(e) =>
                                  handleUpdateItem(
                                    idx,
                                    "dispatchedLoose",
                                    Math.max(0, parseInt(e.target.value, 10) || 0)
                                  )
                                }
                                className="w-12 bg-slate-950 border border-slate-700 rounded p-1 text-center text-white focus:border-cyan-500 outline-none"
                              />
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Total: {calc.dispatchedBase} btls
                          </div>
                        </td>

                        {/* Return Intact Inputs (if not draft) */}
                        {!isDraft && (
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              <div className="flex flex-col items-center">
                                <span className="text-[9px] text-teal-400">Packs</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={it.returnedIntactPacks === 0 ? "" : it.returnedIntactPacks}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleUpdateItem(
                                      idx,
                                      "returnedIntactPacks",
                                      Math.max(0, parseInt(e.target.value, 10) || 0)
                                    )
                                  }
                                  className="w-14 bg-slate-950 border border-teal-800 rounded p-1 text-center font-bold text-teal-300 focus:border-teal-400 outline-none"
                                />
                              </div>
                              <span className="text-slate-500 mt-3">+</span>
                              <div className="flex flex-col items-center">
                                <span className="text-[9px] text-teal-400">Loose</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={it.returnedIntactLoose === 0 ? "" : it.returnedIntactLoose}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleUpdateItem(
                                      idx,
                                      "returnedIntactLoose",
                                      Math.max(0, parseInt(e.target.value, 10) || 0)
                                    )
                                  }
                                  className="w-12 bg-slate-950 border border-teal-800 rounded p-1 text-center text-teal-300 focus:border-teal-400 outline-none"
                                />
                              </div>
                            </div>
                            <div className="text-[10px] text-teal-400/80 font-mono mt-0.5">
                              {calc.returnedBase} btls returned
                            </div>
                          </td>
                        )}

                        {/* Damaged Inputs (if not draft) */}
                        {!isDraft && (
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              <div className="flex flex-col items-center">
                                <span className="text-[9px] text-rose-400">Packs</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={it.damagedPacks === 0 ? "" : it.damagedPacks}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleUpdateItem(
                                      idx,
                                      "damagedPacks",
                                      Math.max(0, parseInt(e.target.value, 10) || 0)
                                    )
                                  }
                                  className="w-14 bg-slate-950 border border-rose-800 rounded p-1 text-center font-bold text-rose-300 focus:border-rose-400 outline-none"
                                />
                              </div>
                              <span className="text-slate-500 mt-3">+</span>
                              <div className="flex flex-col items-center">
                                <span className="text-[9px] text-rose-400">Loose</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={it.damagedLoose === 0 ? "" : it.damagedLoose}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleUpdateItem(
                                      idx,
                                      "damagedLoose",
                                      Math.max(0, parseInt(e.target.value, 10) || 0)
                                    )
                                  }
                                  className="w-12 bg-slate-950 border border-rose-800 rounded p-1 text-center text-rose-300 focus:border-rose-400 outline-none"
                                />
                              </div>
                            </div>
                            <div className="text-[10px] text-rose-400/80 font-mono mt-0.5">
                              {calc.damagedBase} btls broken
                            </div>
                          </td>
                        )}

                        {/* Sold & Revenue */}
                        {!isDraft && (
                          <>
                            <td className="p-3 text-right font-bold text-amber-300 font-mono">
                              {calc.soldBase} btls
                            </td>
                            <td className="p-3 text-right font-bold text-emerald-400 font-mono">
                              {formatPkr(calc.lineRevenuePaisa)}
                            </td>
                          </>
                        )}

                        {/* Delete Row */}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                            title="Remove SKU line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Financial Reconciliation & Cash Deposited */}
          {!isDraft && (
            <div className="bg-slate-800/70 border border-slate-700 p-4 rounded-xl space-y-4">
              <div className="flex items-center space-x-2 text-slate-200 font-bold border-b border-slate-700 pb-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>Financial Reconciliation & Salesman Khata Posting</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-700/80 p-3 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Gross Sales Revenue</span>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {formatPkr(totalGrossRevenuePaisa)}
                  </div>
                  <span className="text-[10px] text-slate-500">Auto-calculated from net sold units</span>
                </div>

                <div className="bg-slate-900 border border-slate-700/80 p-3 rounded-lg">
                  <label className="text-[10px] uppercase font-bold text-cyan-400 block">
                    Cash Deposited / Collected (₨)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={cashDepositedRupees === 0 ? "" : cashDepositedRupees}
                    placeholder="0"
                    onChange={(e) => setCashDepositedRupees(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-cyan-500/70 rounded p-1.5 text-base font-bold text-cyan-300 font-mono outline-none mt-1"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {formatPkr(cashDepositedPaisa)}
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-700/80 p-3 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-amber-400 block">Unpaid Trip Balance</span>
                  <div className={`text-lg font-bold font-mono ${unpaidBalancePaisa > 0 ? "text-amber-400" : "text-slate-300"}`}>
                    {formatPkr(unpaidBalancePaisa)}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {unpaidBalancePaisa > 0 ? "Posts/Recalibrates Salesman Khata DEBIT" : "Fully paid / Zero balance"}
                  </span>
                </div>
              </div>

              {/* Status and Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-slate-400 font-semibold block mb-1">Sheet Lifecycle Status</label>
                  <select
                    value={sheetStatus}
                    onChange={(e) => setSheetStatus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="ISSUED">ISSUED (On Route)</option>
                    <option value="SETTLED">SETTLED (Reconciled & Finalized)</option>
                    <option value="OPEN">OPEN</option>
                    <option value="DRAFT">DRAFT</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 font-semibold block mb-1">Audit / Recalibration Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Corrected broken bottles count after physical re-audit"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Recalibration Notice */}
          <div className="bg-slate-800/40 border border-slate-700/60 p-3 rounded-xl flex items-center space-x-2 text-slate-400 text-[11px]">
            <RotateCcw className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              <strong>Zero Drift Multi-Edit Engine:</strong> Saving automatically rolls back previous inventory deductions and previous Khata transactions, then re-applies exact snapshot values. Edits can be performed multiple consecutive times with zero accumulation error.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-800/90 border-t border-slate-700 px-6 py-3.5 flex items-center justify-between">
          <div className="text-slate-400 text-xs">
            <span>Total Loaded: </span>
            <strong className="text-white font-mono">{totalLoadedBase} bottles</strong>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || items.length === 0}
              className="px-5 py-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 disabled:opacity-40 text-white rounded-lg font-bold shadow-lg transition flex items-center space-x-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isSaving ? "Recalibrating..." : "Save Record & Recalibrate (محفوظ کریں)"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
