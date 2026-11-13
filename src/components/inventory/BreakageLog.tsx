import React, { useEffect, useState } from "react";
import { useInventoryStore } from "../../store/useInventoryStore";
import { formatPkr } from "../../types/domain";
import {
  Flame,
  AlertOctagon,
  FileSpreadsheet,
  CheckCircle,
  X,
  PlusCircle,
} from "lucide-react";

export const BreakageLog: React.FC = () => {
  const { stockItems, breakageLogs, isLoading, error, fetchBreakageLogs, recordBreakage, clearError } =
    useInventoryStore();

  const [selectedProductId, setSelectedProductId] = useState<number>(stockItems[0]?.id || 1);
  const [brokenUnits, setBrokenUnits] = useState<number>(12);
  const [cause, setCause] = useState<string>("Pallet Stacking Slip");
  const [location, setLocation] = useState<string>("Warehouse Depot Bay 2");
  const [responsiblePerson, setResponsiblePerson] = useState<string>("Ghulam Abbas");
  const [actionTaken, setActionTaken] = useState<string>("EXPENSE");
  const [notes, setNotes] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchBreakageLogs();
  }, [fetchBreakageLogs]);

  const selectedProduct =
    stockItems.find((p) => p.id === selectedProductId) || stockItems[0];

  const unitCostPaisa = selectedProduct
    ? Math.floor(selectedProduct.purchase_price_pack_paisa / selectedProduct.units_per_pack)
    : 0;

  const totalLossPaisa = brokenUnits * unitCostPaisa;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (brokenUnits <= 0) {
      setFeedback("Broken base units must be strictly greater than zero.");
      return;
    }
    if (selectedProduct && brokenUnits > selectedProduct.current_stock_base_units) {
      setFeedback(
        `Broken units (${brokenUnits}) cannot exceed available stock (${selectedProduct.current_stock_base_units}).`
      );
      return;
    }

    try {
      await recordBreakage({
        product_id: selectedProductId,
        broken_base_units: brokenUnits,
        cause,
        incident_location: location,
        responsible_person: responsiblePerson || undefined,
        action_taken: actionTaken,
        notes: notes || undefined,
      });
      setFeedback("Breakage incident logged and posted to accounting!");
      setBrokenUnits(1);
      setNotes("");
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : String(err));
    }
  };

  const totalHistoricalLoss = breakageLogs.reduce((acc, log) => acc + log.total_loss_paisa, 0);

  return (
    <div className="space-y-6">
      {/* Informational Guidance */}
      <div className="bg-slate-800 border-l-4 border-rose-500 p-4 rounded-r-xl border-y border-r border-slate-700 shadow-sm flex items-start space-x-3">
        <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <span className="font-bold text-rose-300 block mb-0.5">
            Landed Purchase Cost Valuation & Dual-Route Allocation
          </span>
          <span className="text-slate-300">
            Breakage is valued strictly at <strong>historical landed purchase cost</strong> (never at
            retail sales price). Company operational losses post directly to{" "}
            <strong>Account 6050 (Breakage, Leakage & Loss Expense)</strong>. If charged to staff
            negligence, losses are debited to{" "}
            <strong>Account 1250 (Driver Shortage & Discrepancy Receivables)</strong> without
            inflating operating expenses.
          </span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Total Breakage Incidents</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400">{breakageLogs.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Recorded Loss Events</div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Cumulative Value of Losses</span>
            <FileSpreadsheet className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {formatPkr(totalHistoricalLoss)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Written Off at Landed Cost</div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Staff Recoveries</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {breakageLogs.filter((l) => l.action_taken === "STAFF_RECOVERY").length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Allocated to Account 1250</div>
        </div>
      </div>

      {feedback && (
        <div className="bg-cyan-950/80 border border-cyan-500/50 p-3 rounded-lg text-xs text-cyan-200 flex justify-between items-center">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-cyan-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-950/80 border border-rose-500/50 p-3 rounded-lg text-xs text-rose-200 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={clearError} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Form and History Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Incident Entry Console */}
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-sm space-y-4 lg:col-span-1">
          <h3 className="font-bold text-white text-sm border-b border-slate-700 pb-3 flex items-center space-x-2">
            <PlusCircle className="w-4 h-4 text-cyan-400" />
            <span>Record Breakage Incident</span>
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Damaged Product SKU
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {stockItems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku_code}) — {p.current_stock_base_units} in stock
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Broken Units ({selectedProduct?.base_unit_name || "Bottle"}s)
                </label>
                <input
                  type="number"
                  min="1"
                  value={brokenUnits}
                  onChange={(e) =>
                    setBrokenUnits(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Landed Unit Cost
                </label>
                <div className="px-3 py-2 bg-slate-900/60 border border-slate-700/60 rounded-lg text-xs font-mono text-cyan-400 font-bold">
                  {formatPkr(unitCostPaisa)}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-700/60 flex justify-between items-center text-xs">
              <span className="text-slate-400">Total Calculated Loss:</span>
              <span className="font-bold font-mono text-rose-400 text-sm">
                {formatPkr(totalLossPaisa)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Incident Cause
              </label>
              <select
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Pallet Stacking Slip">Pallet Stacking Slip</option>
                <option value="Transit Road Vibration">Transit Road Vibration</option>
                <option value="Warehouse Handling Slip">Warehouse Handling Slip</option>
                <option value="Defective Bottle/Leakage">Defective Bottle/Leakage</option>
                <option value="Vehicle Accident">Vehicle Accident</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Incident Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                placeholder="e.g. Warehouse Bay 2, Van Beat-01"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Responsible Person
              </label>
              <input
                type="text"
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                placeholder="Driver or warehouse handler"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Financial Loss Route
              </label>
              <select
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="EXPENSE">Write-Off (Account 6050 Operating Expense)</option>
                <option value="STAFF_RECOVERY">Charge Staff (Account 1250 Shortage Receivable)</option>
                <option value="COMPANY_CLAIM">Principal Factory Claim (Account 1150)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                placeholder="Damage description, supervisor approval, etc."
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white rounded-lg shadow transition active:scale-95"
            >
              Post Breakage Write-off
            </button>
          </form>
        </div>

        {/* History Register Table */}
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-sm lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3">
            <div>
              <h3 className="font-bold text-white text-sm">Breakage Audit Register</h3>
              <p className="text-xs text-slate-400">Historical register of recorded loss incidents</p>
            </div>
            <button
              onClick={() => fetchBreakageLogs()}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              Refresh Logs
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 font-semibold border-b border-slate-700 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Product SKU</th>
                  <th className="py-2.5 px-3 text-right">Units</th>
                  <th className="py-2.5 px-3 text-right">Loss Amount</th>
                  <th className="py-2.5 px-3">Cause / Location</th>
                  <th className="py-2.5 px-3">Responsible</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 text-slate-200">
                {breakageLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      No breakage incidents recorded yet.
                    </td>
                  </tr>
                ) : (
                  breakageLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-700/30 transition">
                      <td className="py-2.5 px-3 font-mono text-slate-400">{log.log_date}</td>
                      <td className="py-2.5 px-3 font-semibold text-white">{log.product_name}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-400 font-bold">
                        {log.broken_base_units}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400">
                        {formatPkr(log.total_loss_paisa)}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-white">{log.cause}</div>
                        <div className="text-[10px] text-slate-400">{log.incident_location}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {log.responsible_person || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.action_taken === "EXPENSE"
                              ? "bg-rose-950 text-rose-300 border border-rose-700"
                              : log.action_taken === "STAFF_RECOVERY"
                              ? "bg-amber-950 text-amber-300 border border-amber-700"
                              : "bg-cyan-950 text-cyan-300 border border-cyan-700"
                          }`}
                        >
                          {log.action_taken}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
