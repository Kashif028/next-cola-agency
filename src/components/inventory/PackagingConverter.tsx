import React, { useState } from "react";
import { useInventoryStore } from "../../store/useInventoryStore";
import { inventoryService } from "../../services/inventoryService";
import { Calculator, ArrowRightLeft, CheckCircle, AlertCircle } from "lucide-react";

export const PackagingConverter: React.FC = () => {
  const { stockItems } = useInventoryStore();

  const [selectedProductId, setSelectedProductId] = useState<number>(
    stockItems[0]?.id || 1
  );

  const selectedProduct =
    stockItems.find((p) => p.id === selectedProductId) || stockItems[0];

  // Tab state: "pack_to_base" | "base_to_pack"
  const [activeTab, setActiveTab] = useState<"pack_to_base" | "base_to_pack">(
    "pack_to_base"
  );

  // Tab 1 state
  const [packQty, setPackQty] = useState<number>(3);
  const [looseQty, setLooseQty] = useState<number>(7);
  const [packToBaseResult, setPackToBaseResult] = useState<{
    total: number;
    formula: string;
  } | null>(null);

  // Tab 2 state
  const [baseUnitsInput, setBaseUnitsInput] = useState<number>(530);
  const [baseToPackResult, setBaseToPackResult] = useState<{
    packs: number;
    loose: number;
    displayText: string;
  } | null>(null);

  const [calcError, setCalcError] = useState<string | null>(null);

  const handleConvertPackToBase = async () => {
    setCalcError(null);
    if (!selectedProduct) return;
    if (packQty < 0 || looseQty < 0) {
      setCalcError("Quantities cannot be negative.");
      return;
    }
    try {
      const res = await inventoryService.convertPackToBase({
        product_id: selectedProduct.id,
        pack_qty: packQty,
        loose_qty: looseQty,
      });
      setPackToBaseResult({
        total: res.total_base_units,
        formula: res.formula_applied,
      });
    } catch (err: unknown) {
      setCalcError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConvertBaseToPack = async () => {
    setCalcError(null);
    if (!selectedProduct) return;
    if (baseUnitsInput < 0) {
      setCalcError("Base units cannot be negative.");
      return;
    }
    try {
      const res = await inventoryService.convertBaseToPack({
        product_id: selectedProduct.id,
        base_units: baseUnitsInput,
      });
      setBaseToPackResult({
        packs: res.packs,
        loose: res.loose,
        displayText: res.display_text,
      });
    } catch (err: unknown) {
      setCalcError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-cyan-950/80 border border-cyan-500/30 rounded-xl text-cyan-400">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              Multi-Tier Packaging Converter
            </h2>
            <p className="text-xs text-slate-400">
              Zero-drift canonical integer conversions between packs, cartons, crates, and loose base units.
            </p>
          </div>
        </div>

        {/* Product Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Select Beverage SKU / Packaging Specification:
          </label>
          <select
            value={selectedProductId}
            onChange={(e) => {
              setSelectedProductId(parseInt(e.target.value, 10));
              setPackToBaseResult(null);
              setBaseToPackResult(null);
              setCalcError(null);
            }}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            {stockItems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku_code}) — 1 {p.pack_unit_name} = {p.units_per_pack} {p.base_unit_name}s [{p.packaging_type}]
              </option>
            ))}
          </select>
        </div>

        {selectedProduct && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-700/60 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Pack Unit</span>
              <span className="font-semibold text-cyan-400">{selectedProduct.pack_unit_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Base Unit</span>
              <span className="font-semibold text-emerald-400">{selectedProduct.base_unit_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Multiplier Ratio</span>
              <span className="font-semibold text-amber-400">1 : {selectedProduct.units_per_pack}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Packaging Form</span>
              <span className="font-semibold text-purple-400">{selectedProduct.packaging_type}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 space-x-2">
        <button
          onClick={() => setActiveTab("pack_to_base")}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-t border-l border-r ${
            activeTab === "pack_to_base"
              ? "bg-slate-800 border-slate-700 text-cyan-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Pack & Loose ➔ Base Units
        </button>
        <button
          onClick={() => setActiveTab("base_to_pack")}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-t border-l border-r ${
            activeTab === "base_to_pack"
              ? "bg-slate-800 border-slate-700 text-cyan-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Base Units ➔ Pack & Loose Display
        </button>
      </div>

      {calcError && (
        <div className="bg-rose-950/80 border border-rose-500/50 p-3 rounded-lg text-xs text-rose-200 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{calcError}</span>
        </div>
      )}

      {/* Tab 1 Content */}
      {activeTab === "pack_to_base" && (
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Full {selectedProduct?.pack_unit_name || "Pack"} Quantity
              </label>
              <input
                type="number"
                min="0"
                value={packQty}
                onChange={(e) => setPackQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Loose {selectedProduct?.base_unit_name || "Base"} Quantity
              </label>
              <input
                type="number"
                min="0"
                value={looseQty}
                onChange={(e) => setLooseQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <button
            onClick={handleConvertPackToBase}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white rounded-lg shadow transition flex items-center justify-center space-x-2 active:scale-95"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Calculate Canonical Base Units</span>
          </button>

          {packToBaseResult && (
            <div className="bg-slate-900 border border-cyan-500/40 p-5 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-cyan-400 text-xs font-bold">
                <CheckCircle className="w-4 h-4" />
                <span>Conversion Result</span>
              </div>
              <div className="text-3xl font-bold font-mono text-white">
                {packToBaseResult.total.toLocaleString()} {selectedProduct?.base_unit_name}s
              </div>
              <div className="text-xs font-mono text-slate-400">
                Formula Applied: <span className="text-emerald-400">{packToBaseResult.formula}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2 Content */}
      {activeTab === "base_to_pack" && (
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-sm space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Raw Base Units Count ({selectedProduct?.base_unit_name || "Bottle"}s)
            </label>
            <input
              type="number"
              min="0"
              value={baseUnitsInput}
              onChange={(e) =>
                setBaseUnitsInput(Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
              placeholder="e.g. 530"
            />
          </div>

          <button
            onClick={handleConvertBaseToPack}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white rounded-lg shadow transition flex items-center justify-center space-x-2 active:scale-95"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Decompose Into Packs & Loose Display</span>
          </button>

          {baseToPackResult && (
            <div className="bg-slate-900 border border-emerald-500/40 p-5 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold">
                <CheckCircle className="w-4 h-4" />
                <span>Decomposition Result</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {baseToPackResult.displayText}
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs font-mono text-slate-300 pt-2 border-t border-slate-800">
                <div>
                  Whole Packs (⌊B / m⌋):{" "}
                  <span className="text-cyan-400 font-bold">{baseToPackResult.packs}</span>
                </div>
                <div>
                  Loose Remainder (B % m):{" "}
                  <span className="text-amber-400 font-bold">{baseToPackResult.loose}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
