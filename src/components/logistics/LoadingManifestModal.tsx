// src/components/logistics/LoadingManifestModal.tsx
import { useState, useEffect, useMemo } from "react";
import { useLogisticsStore } from "../../store/useLogisticsStore";
import { formatPkr } from "../../types/domain";
import { LoadingItemInput } from "../../types/logistics";
import { loadSavedKhataAccounts } from "../../types/khata";
import { loadSavedProducts } from "../../types/products";
import {
  X,
  Trash2,
  Truck,
  CheckCircle,
  AlertTriangle,
  FileText,
  Layers,
  UserCheck,
} from "lucide-react";

interface ManifestLineItem {
  productId: number;
  productSku: string;
  productName: string;
  packName: string;
  unitsPerPack: number;
  wholesalePackPricePaisa: number;
  isGlass: boolean;
  packQty: number;
  looseQty: number;
}

const FALLBACK_BEVERAGE_CATALOG = [
  {
    productId: 1,
    productSku: "NC-250-RGB",
    productName: "Next Cola 250ml Glass Bottle",
    packName: "Crate",
    unitsPerPack: 24,
    wholesalePackPricePaisa: 216000,
    isGlass: true,
  },
  {
    productId: 2,
    productSku: "NC-1.5-PET",
    productName: "Next Cola 1.5L PET Bottle",
    packName: "Pack",
    unitsPerPack: 6,
    wholesalePackPricePaisa: 105000,
    isGlass: false,
  },
  {
    productId: 3,
    productSku: "NC-500-PET",
    productName: "Next Cola 500ml PET Bottle",
    packName: "Pack",
    unitsPerPack: 12,
    wholesalePackPricePaisa: 126000,
    isGlass: false,
  },
  {
    productId: 4,
    productSku: "NC-250-CAN",
    productName: "Next Cola 250ml Sleek Can",
    packName: "Tray",
    unitsPerPack: 24,
    wholesalePackPricePaisa: 240000,
    isGlass: false,
  },
  {
    productId: 5,
    productSku: "FZ-250-RGB",
    productName: "Fizz Up Lemon 250ml Glass Bottle",
    packName: "Crate",
    unitsPerPack: 24,
    wholesalePackPricePaisa: 216000,
    isGlass: true,
  },
  {
    productId: 8,
    productSku: "NW-500-PET",
    productName: "Next Pure Mineral Water 500ml",
    packName: "Pack",
    unitsPerPack: 24,
    wholesalePackPricePaisa: 96000,
    isGlass: false,
  },
];

export interface LoadingManifestModalProps {
  isOpen?: boolean;
}

export function LoadingManifestModal(props: LoadingManifestModalProps = {}) {
  const store = useLogisticsStore();
  const {
    closeCreateManifestModal,
    routes,
    vehicles,
    createManifestDraft,
    issueManifestDispatch,
    isLoading,
    error,
  } = store;

  const isOpen = props?.isOpen !== undefined ? props.isOpen : store.isLoadingManifestModalOpen;

  // Load Salesman Khata Accounts (category === "SALESMAN")
  const salesmanAccounts = useMemo(() => {
    try {
      const allAccounts = loadSavedKhataAccounts();
      const salesmen = allAccounts.filter((a) => a.category === "SALESMAN");
      return salesmen.length > 0
        ? salesmen
        : [
            {
              id: 5,
              holderName: "Muhammad Ali",
              shopName: "City Center & Shahi Bazaar (Beat 01)",
              villageName: "Rahim Yar Khan",
              shopAddress: "Beat 01 Depot",
              streetArea: "Commercial Zone",
              mobileNumber: "0300-1112233",
              accountOpeningDate: "2026-01-01",
              openingBalance: 0,
              currentBalance: 0,
              category: "SALESMAN" as const,
              notes: "Primary salesman for Beat 01",
              createdAt: "2026-01-01T08:00:00Z",
              updatedAt: "2026-01-01T08:00:00Z",
            },
          ];
    } catch {
      return [];
    }
  }, [isOpen]);

  // Load Dynamic Beverage Catalog from System Products
  const beverageCatalog = useMemo(() => {
    try {
      const products = loadSavedProducts();
      if (products && products.length > 0) {
        return products.map((p) => ({
          productId: p.id,
          productSku: p.sku,
          productName: `${p.name} ${p.sizeLabel || ""}`.trim(),
          packName: p.requiresCrate ? "Crate" : "Pack",
          unitsPerPack: p.bottlesPerPack || 1,
          wholesalePackPricePaisa: p.wholesalePackPricePaisa || 0,
          isGlass: p.requiresCrate || false,
        }));
      }
    } catch {
      // Fallback
    }
    return FALLBACK_BEVERAGE_CATALOG;
  }, [isOpen]);

  const [selectedRouteId, setSelectedRouteId] = useState<number>(1);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number>(1);
  const [selectedSalesmanId, setSelectedSalesmanId] = useState<number>(5);
  const [driverName, setDriverName] = useState("Muhammad Ali");
  const [helperName, setHelperName] = useState("Tariq (Conductor)");
  const [openingKm, setOpeningKm] = useState<number>(45200);
  const [emptyCratesLoaded, setEmptyCratesLoaded] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Strict Manual Entry Control: start with clean empty state [] (Zero Pre-fill)
  const [items, setItems] = useState<ManifestLineItem[]>([]);

  // Session Isolation: Whenever modal opens, load pristine clean state (zero leakage from prior sessions)
  useEffect(() => {
    if (isOpen) {
      setItems([]);
      setNotes("");
      setEmptyCratesLoaded(0);
      setSubmissionError(null);
      if (salesmanAccounts.length > 0) {
        setSelectedSalesmanId(salesmanAccounts[0].id);
        setDriverName(salesmanAccounts[0].holderName);
      }
    }
  }, [isOpen, salesmanAccounts]);

  // Sync route changes
  useEffect(() => {
    const route = routes.find((r) => r.id === selectedRouteId);
    if (route) {
      if (route.default_vehicle_id) setSelectedVehicleId(route.default_vehicle_id);
      if (route.default_driver_name) setDriverName(route.default_driver_name);
    }
  }, [selectedRouteId, routes]);

  // Sync vehicle changes
  useEffect(() => {
    const veh = vehicles.find((v) => v.id === selectedVehicleId);
    if (veh) {
      setOpeningKm(veh.current_odometer_km || 45200);
      if (veh.default_driver_name) setDriverName(veh.default_driver_name);
    }
  }, [selectedVehicleId, vehicles]);

  // Sync salesman selection
  useEffect(() => {
    const salesman = salesmanAccounts.find((s) => s.id === selectedSalesmanId);
    if (salesman) {
      setDriverName(salesman.holderName);
    }
  }, [selectedSalesmanId, salesmanAccounts]);

  if (!isOpen) return null;

  const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0];
  const maxCrates = currentVehicle?.capacity_crates || 120;
  const maxWeightKg = currentVehicle?.capacity_weight_kg || 850;

  // Capacity calculations
  let totalLoadedCrates = emptyCratesLoaded;
  let totalEstimatedWeightKg = emptyCratesLoaded * 2.0; // 2kg empty plastic crate
  let totalWholesaleValuePaisa = 0;
  let totalBaseBottles = 0;

  items.forEach((it) => {
    const baseRate = Math.floor(it.wholesalePackPricePaisa / (it.unitsPerPack || 1));
    const lineVal = it.packQty * it.wholesalePackPricePaisa + it.looseQty * baseRate;
    totalWholesaleValuePaisa += lineVal;

    const bottles = it.packQty * it.unitsPerPack + it.looseQty;
    totalBaseBottles += bottles;

    if (it.isGlass) {
      totalLoadedCrates += it.packQty;
      totalEstimatedWeightKg += it.packQty * 18.0 + (it.looseQty * 18.0) / 24;
    } else {
      totalEstimatedWeightKg += it.packQty * 10.0 + (it.looseQty * 10.0) / (it.unitsPerPack || 1);
    }
  });

  const cratePercent = Math.min(100, Math.round((totalLoadedCrates * 100) / maxCrates));
  const isCrateOverload = totalLoadedCrates > maxCrates;

  const weightPercent = Math.min(100, Math.round((totalEstimatedWeightKg * 100) / maxWeightKg));
  const isWeightOverload = totalEstimatedWeightKg > maxWeightKg;

  // Explicit Product Selection: When product is added, quantity defaults strictly to 0
  const handleAddItem = (productId: number) => {
    if (items.some((it) => it.productId === productId)) return;
    const prod = beverageCatalog.find((p) => p.productId === productId);
    if (!prod) return;

    setItems((prev) => [
      ...prev,
      {
        ...prod,
        packQty: 0, // Strict requirement: Default to 0
        looseQty: 0, // Strict requirement: Default to 0
      },
    ]);
  };

  const handleRemoveItem = (productId: number) => {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  // Clean Overwrite Entry: Parses input and strictly overwrites prior value without appending
  const handleUpdateQty = (productId: number, field: "packQty" | "looseQty", rawVal: string) => {
    const numericVal = Math.max(0, parseInt(rawVal, 10) || 0);
    setItems((prev) =>
      prev.map((it) =>
        it.productId === productId ? { ...it, [field]: numericVal } : it
      )
    );
  };

  // Completely exclude unentered or zero-quantity items from saved records
  const getNonZeroItems = () => {
    return items.filter((it) => it.packQty > 0 || it.looseQty > 0);
  };

  const buildDto = (validItems: ManifestLineItem[]) => {
    const itemInputs: LoadingItemInput[] = validItems.map((it) => ({
      product_id: it.productId,
      pack_qty: it.packQty,
      loose_qty: it.looseQty,
    }));

    return {
      route_id: selectedRouteId,
      sheet_date: new Date().toISOString().slice(0, 10),
      vehicle_id: selectedVehicleId,
      vehicle_number: currentVehicle?.vehicle_number || "LES-2489",
      driver_id: selectedSalesmanId,
      driver_name: driverName,
      helper_name: helperName,
      opening_km: openingKm,
      empty_crates_loaded: emptyCratesLoaded,
      items: itemInputs,
      notes: notes || undefined,
    };
  };

  const handleSaveDraft = async () => {
    const validItems = getNonZeroItems();
    if (validItems.length === 0) {
      setSubmissionError("Please add at least one product with quantity greater than zero before saving draft.");
      return;
    }
    setSubmissionError(null);
    const dto = buildDto(validItems);
    await createManifestDraft(dto);
  };

  const handleIssueDispatch = async () => {
    const validItems = getNonZeroItems();
    if (validItems.length === 0) {
      setSubmissionError("Please enter quantities greater than zero before issuing dispatch.");
      return;
    }
    setSubmissionError(null);
    const dto = buildDto(validItems);
    const sheet = await createManifestDraft(dto);
    await issueManifestDispatch({
      sheet_id: sheet.id,
      opening_km: openingKm,
      empty_crates_loaded: emptyCratesLoaded,
      departure_time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  };

  const nonZeroCount = getNonZeroItems().length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3 text-white">
            <div className="p-2 bg-cyan-600/20 text-cyan-400 rounded-lg">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Morning Route Loading Manifest & Gate Pass</h2>
              <p className="text-xs text-slate-400">
                صبح مال ڈسپیچ • Warehouse Stock Transfer (Loc 1 $\to$ Van Mobile Loc 2)
              </p>
            </div>
          </div>
          <button
            onClick={closeCreateManifestModal}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Top Route & Salesman Khata Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-800/60 p-4 rounded-xl border border-slate-700/80">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Delivery Route (Beat)</label>
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-medium outline-none focus:border-cyan-500"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.route_code}: {r.route_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Delivery Vehicle & Fleet</label>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono outline-none focus:border-cyan-500"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vehicle_number} ({v.capacity_crates} Crates / {v.capacity_weight_kg}kg)
                  </option>
                ))}
              </select>
            </div>

            {/* Salesman Selection Dropdown from KhataAccounts (category === "SALESMAN") */}
            <div className="space-y-1">
              <label className="text-cyan-400 font-semibold block flex items-center space-x-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Salesman / Driver (سیلز مین کھاتہ)</span>
              </label>
              <select
                value={selectedSalesmanId}
                onChange={(e) => setSelectedSalesmanId(Number(e.target.value))}
                className="w-full bg-slate-800 border border-cyan-500/60 rounded-lg p-2 text-white font-medium outline-none focus:border-cyan-400"
              >
                {salesmanAccounts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.holderName} — {s.shopName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Driver Name (Manifest Line)</label>
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-cyan-500 font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Helper / Conductor</label>
              <input
                type="text"
                value={helperName}
                onChange={(e) => setHelperName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-cyan-500 font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Opening Odometer (KM)</label>
              <input
                type="number"
                value={openingKm}
                onChange={(e) => setOpeningKm(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1 md:col-span-3">
              <label className="text-slate-400 font-semibold block">Manifest Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional delivery notes / morning gate pass remarks"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Vehicle Capacity Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Crate Capacity Gauge */}
            <div className="bg-slate-800/80 border border-slate-700 p-3.5 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Crate Stacking Capacity</span>
                </span>
                <span className="font-mono font-bold text-white">
                  {totalLoadedCrates} / {maxCrates} Crates ({Math.round((totalLoadedCrates * 100) / maxCrates)}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isCrateOverload
                      ? "bg-red-500 animate-pulse"
                      : cratePercent > 85
                      ? "bg-amber-500"
                      : "bg-cyan-500"
                  }`}
                  style={{ width: `${Math.min(100, (totalLoadedCrates * 100) / maxCrates)}%` }}
                />
              </div>
              {isCrateOverload && (
                <span className="text-[10px] text-red-400 font-bold block flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>OVERLOAD WARNING: Vehicle crate capacity exceeded!</span>
                </span>
              )}
            </div>

            {/* Weight Capacity Gauge */}
            <div className="bg-slate-800/80 border border-slate-700 p-3.5 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold flex items-center space-x-1.5">
                  <Truck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Payload Weight Capacity</span>
                </span>
                <span className="font-mono font-bold text-white">
                  {Math.round(totalEstimatedWeightKg)} / {maxWeightKg} KG ({Math.round((totalEstimatedWeightKg * 100) / maxWeightKg)}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isWeightOverload
                      ? "bg-red-500 animate-pulse"
                      : weightPercent > 85
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, (totalEstimatedWeightKg * 100) / maxWeightKg)}%` }}
                />
              </div>
              {isWeightOverload && (
                <span className="text-[10px] text-red-400 font-bold block flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>WEIGHT OVERLOAD: Vehicle safe payload limit exceeded!</span>
                </span>
              )}
            </div>
          </div>

          {/* Loading Manifest Table with Explicit Product Selection */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-white text-xs flex items-center space-x-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>
                  Loaded Beverage SKUs ({items.length} Selected, {nonZeroCount} Active, {totalBaseBottles} Bottles)
                </span>
              </span>

              {/* Explicit Product Selection Dropdown */}
              <div className="flex items-center space-x-2">
                <select
                  onChange={(e) => {
                    if (e.target.value) handleAddItem(Number(e.target.value));
                    e.target.value = "";
                  }}
                  className="bg-slate-800 border border-cyan-500/50 rounded-lg px-2.5 py-1.5 text-cyan-300 font-medium outline-none focus:border-cyan-400"
                >
                  <option value="">+ Add Beverage SKU (پروڈکٹ منتخب کریں)...</option>
                  {beverageCatalog
                    .filter((b) => !items.some((it) => it.productId === b.productId))
                    .map((b) => (
                      <option key={b.productId} value={b.productId}>
                        {b.productSku}: {b.productName} ({b.packName} of {b.unitsPerPack})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-700 rounded-xl">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-800/90 text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="p-3">Product / SKU</th>
                    <th className="p-3">Packaging</th>
                    <th className="p-3 text-center">Pack Qty</th>
                    <th className="p-3 text-center">Loose Units</th>
                    <th className="p-3 text-right">Total Base Btls</th>
                    <th className="p-3 text-right">Wholesale Rate</th>
                    <th className="p-3 text-right">Line Valuation</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-sans">
                        <div className="flex flex-col items-center justify-center space-y-1">
                          <span className="font-semibold text-slate-300">
                            No products added yet (کوئی پراڈکٹ منتخب نہیں کی گئی)
                          </span>
                          <span className="text-slate-500 text-[11px]">
                            Use the &quot;+ Add Beverage SKU...&quot; dropdown above to add products. Initial quantity defaults to 0.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const baseRate = Math.floor(it.wholesalePackPricePaisa / (it.unitsPerPack || 1));
                      const lineVal = it.packQty * it.wholesalePackPricePaisa + it.looseQty * baseRate;
                      const btls = it.packQty * it.unitsPerPack + it.looseQty;

                      return (
                        <tr key={it.productId} className="hover:bg-slate-800/40">
                          <td className="p-3">
                            <span className="font-bold text-white block">{it.productName}</span>
                            <span className="text-[10px] text-cyan-400">{it.productSku}</span>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              {it.packName} of {it.unitsPerPack}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={it.packQty === 0 ? "" : it.packQty}
                              placeholder="0"
                              onChange={(e) =>
                                handleUpdateQty(it.productId, "packQty", e.target.value)
                              }
                              className="w-16 text-center bg-slate-800 border border-slate-700 rounded p-1 text-white font-bold outline-none focus:border-cyan-500"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={it.looseQty === 0 ? "" : it.looseQty}
                              placeholder="0"
                              onChange={(e) =>
                                handleUpdateQty(it.productId, "looseQty", e.target.value)
                              }
                              className="w-14 text-center bg-slate-800 border border-slate-700 rounded p-1 text-white outline-none focus:border-cyan-500"
                            />
                          </td>
                          <td className="p-3 text-right font-bold text-slate-200">{btls}</td>
                          <td className="p-3 text-right text-slate-400">
                            {formatPkr(it.wholesalePackPricePaisa)}
                          </td>
                          <td className="p-3 text-right font-bold text-emerald-400">
                            {formatPkr(lineVal)}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(it.productId)}
                              className="text-slate-400 hover:text-red-400 p-1"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Empty Crates Loading Section */}
          <div className="bg-slate-800/60 border border-slate-700/80 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="font-bold text-white text-xs block">
                Morning Empty Crates Loaded (خالی کریٹ)
              </span>
              <span className="text-[11px] text-slate-400">
                Issued to driver for customer empty crate swaps & returns on route
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="0"
                value={emptyCratesLoaded === 0 ? "" : emptyCratesLoaded}
                placeholder="0"
                onChange={(e) => setEmptyCratesLoaded(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-24 text-center bg-slate-800 border border-slate-700 rounded-lg p-2 text-amber-400 font-mono font-bold text-sm outline-none focus:border-amber-400"
              />
              <span className="text-slate-400 font-medium">Crates</span>
            </div>
          </div>

          {/* Total Valuation Card */}
          <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700 font-mono text-sm">
            <div>
              <span className="text-xs text-slate-400 block font-sans">Total Load Wholesale Valuation</span>
              <span className="text-2xl font-bold text-emerald-400">
                {formatPkr(totalWholesaleValuePaisa)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block font-sans">Total Liquid Stock</span>
              <span className="text-lg font-bold text-white">{totalBaseBottles} Base Bottles</span>
            </div>
          </div>

          {submissionError && (
            <div className="p-3 bg-red-950/60 border border-red-500/50 rounded-lg text-red-200 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{submissionError}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-950/60 border border-red-500/50 rounded-lg text-red-200 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer Action Buttons */}
        <div className="bg-slate-800 px-6 py-4 border-t border-slate-700 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Draft creation does not deduct warehouse stock. Dispatching transfers stock to van and deducts warehouse inventory.
          </div>
          <div className="flex space-x-3">
            <button
              onClick={closeCreateManifestModal}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={isLoading || nonZeroCount === 0}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-cyan-300 border border-cyan-500/50 font-bold rounded-lg transition disabled:opacity-40"
            >
              Save Draft
            </button>
            <button
              onClick={handleIssueDispatch}
              disabled={isLoading || nonZeroCount === 0}
              className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-lg shadow-lg transition disabled:opacity-40"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Issue Dispatch & Print Gate Pass</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
