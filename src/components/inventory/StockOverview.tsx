import React, { useEffect, useState } from "react";
import { useInventoryStore } from "../../store/useInventoryStore";
import { StockItemOverviewDto, formatPkr } from "../../types/domain";
import {
  Package,
  AlertTriangle,
  DollarSign,
  Search,
  Sliders,
  RefreshCw,
  X,
} from "lucide-react";

export const StockOverview: React.FC = () => {
  const { stockItems, isLoading, error, fetchStockOverview, adjustStock, clearError } =
    useInventoryStore();

  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedPkg, setSelectedPkg] = useState<string>("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Adjustment modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [adjProduct, setAdjProduct] = useState<StockItemOverviewDto | null>(null);
  const [deltaUnits, setDeltaUnits] = useState<number>(0);
  const [adjReason, setAdjReason] = useState("Physical Count Variance");
  const [adjNotes, setAdjNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchStockOverview({
      brand: selectedBrand || undefined,
      packaging_type: selectedPkg || undefined,
      low_stock_only: lowStockOnly || undefined,
      search_query: search || undefined,
    });
  }, [fetchStockOverview, selectedBrand, selectedPkg, lowStockOnly, search]);

  const totalBaseUnits = stockItems.reduce((acc, item) => acc + item.current_stock_base_units, 0);
  const totalValuation = stockItems.reduce((acc, item) => acc + item.inventory_valuation_paisa, 0);
  const lowStockCount = stockItems.filter((item) => item.is_low_stock).length;

  const handleOpenAdjust = (product: StockItemOverviewDto) => {
    setAdjProduct(product);
    setDeltaUnits(0);
    setAdjReason("Physical Count Variance");
    setAdjNotes("");
    setActionError(null);
    setIsModalOpen(true);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjProduct) return;
    if (deltaUnits === 0) {
      setActionError("Adjustment delta cannot be zero.");
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      await adjustStock({
        product_id: adjProduct.id,
        delta_base_units: deltaUnits,
        reason: adjReason,
        notes: adjNotes || undefined,
      });
      setIsModalOpen(false);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Active Beverage SKUs</span>
            <Package className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-400">{stockItems.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Catalog Varieties</div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Total Salable Stock</span>
            <Sliders className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {totalBaseUnits.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Bottles / Cans Base Units</div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Warehouse Valuation (Landed Cost)</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {formatPkr(totalValuation)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Excludes Deposits & Empties</div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Low Stock Reorders</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400">{lowStockCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Below Reorder Level</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by SKU, drink name or flavor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Brands</option>
            <option value="Next Cola">Next Cola</option>
            <option value="Fizz Up">Fizz Up</option>
            <option value="Next Orange">Next Orange</option>
            <option value="Next Pure">Next Pure Water</option>
          </select>

          <select
            value={selectedPkg}
            onChange={(e) => setSelectedPkg(e.target.value)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Packaging</option>
            <option value="RGB_GLASS">RGB Glass</option>
            <option value="PET_PLASTIC">PET Plastic</option>
            <option value="CAN_ALU">Aluminum Can</option>
          </select>

          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => setLowStockOnly(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-0"
            />
            <span>Low Stock Only</span>
          </label>

          <button
            onClick={() => fetchStockOverview()}
            disabled={isLoading}
            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition"
            title="Refresh Stock Table"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-950/80 border border-rose-500/50 p-4 rounded-lg text-xs text-rose-200 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={clearError} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stock Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 font-semibold border-b border-slate-700 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">SKU / Drink Name</th>
                <th className="py-3 px-4">Packaging Type</th>
                <th className="py-3 px-4">Pack Ratio</th>
                <th className="py-3 px-4">Warehouse Stock</th>
                <th className="py-3 px-4">Empties (Crates/Bottles)</th>
                <th className="py-3 px-4">Purchase Rate</th>
                <th className="py-3 px-4">Wholesale Rate</th>
                <th className="py-3 px-4">Valuation</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 text-slate-200">
              {stockItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    No beverage inventory records match the selected filter.
                  </td>
                </tr>
              ) : (
                stockItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-700/30 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{item.name}</div>
                      <div className="font-mono text-[11px] text-slate-400">{item.sku_code}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          item.packaging_type === "RGB_GLASS"
                            ? "bg-amber-950 text-amber-300 border border-amber-700/50"
                            : item.packaging_type === "PET_PLASTIC"
                            ? "bg-sky-950 text-sky-300 border border-sky-700/50"
                            : "bg-purple-950 text-purple-300 border border-purple-700/50"
                        }`}
                      >
                        {item.packaging_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      1 {item.pack_unit_name} = {item.units_per_pack} {item.base_unit_name}s
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">
                        {item.stock_in_packs} {item.pack_unit_name}s, {item.stock_loose_units}{" "}
                        {item.base_unit_name}s
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {item.current_stock_base_units.toLocaleString()} total {item.base_unit_name}
                        s
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {item.requires_crate ? (
                        <div>
                          <span className="text-amber-400">{item.empty_crates_stock} Crates</span> /{" "}
                          <span className="text-cyan-400">{item.empty_bottles_stock} Bottles</span>
                        </div>
                      ) : (
                        <span className="text-slate-500">— (Non-returnable)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {formatPkr(item.purchase_price_pack_paisa)} / {item.pack_unit_name}
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-400">
                      {formatPkr(item.wholesale_price_pack_paisa)} / {item.pack_unit_name}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-amber-300">
                      {formatPkr(item.inventory_valuation_paisa)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.is_low_stock ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-700">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Reorder
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                          In Stock
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenAdjust(item)}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-xs text-white rounded font-medium border border-slate-600 transition active:scale-95"
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      {isModalOpen && adjProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Adjust Stock: {adjProduct.name}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  Current Stock: {adjProduct.current_stock_base_units} {adjProduct.base_unit_name}s
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="bg-rose-950/80 border border-rose-500/50 p-3 rounded text-xs text-rose-200">
                {actionError}
              </div>
            )}

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Adjustment Delta in Base Units (Positive = Add, Negative = Deduct)
                </label>
                <input
                  type="number"
                  value={deltaUnits}
                  onChange={(e) => setDeltaUnits(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                  placeholder="e.g. -24 or 48"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  New stock will be:{" "}
                  <span className="font-mono text-cyan-400 font-semibold">
                    {adjProduct.current_stock_base_units + deltaUnits} {adjProduct.base_unit_name}s
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Adjustment Reason
                </label>
                <select
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Physical Count Variance">Physical Count Variance</option>
                  <option value="Warehouse Relocation">Warehouse Relocation</option>
                  <option value="Quality Sample Test">Quality Sample Test</option>
                  <option value="Opening Balance Correction">Opening Balance Correction</option>
                  <option value="Damaged / Write-off">Damaged / Write-off</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Audit Notes (Optional)
                </label>
                <textarea
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                  rows={2}
                  placeholder="Reference audit voucher, bay number or inspector name..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white rounded-lg shadow transition"
                >
                  {submitting ? "Saving..." : "Apply Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
