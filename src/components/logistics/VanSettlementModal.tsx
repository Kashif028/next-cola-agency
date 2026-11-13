// src/components/logistics/VanSettlementModal.tsx
import { useState } from "react";
import { useLogisticsStore } from "../../store/useLogisticsStore";
import { formatPkr } from "../../types/domain";
import {
  X,
  FileCheck,
  CheckCircle2,
  Coins,
  Banknote,
  ShieldAlert,
} from "lucide-react";


export function VanSettlementModal() {
  const {
    isSettlementModalOpen,
    closeSettlementModal,
    selectedSheetDetail,
    activeReconciliation,
    closingKm,
    physicalReturns,
    physicalCashPaisa,
    emptyCratesReturned,
    routeExpensesPaisa,
    shortageAction,
    supervisorPin,
    settlementNotes,
    updateReturnLine,
    updateSettlementFinancials,
    recalculateSettlement,
    submitSettlement,
    setShortageAction,
    setSupervisorPin,
    setSettlementNotes,
    isLoading,
    isCalculating,
    error,
  } = useLogisticsStore();

  const [activeTab, setActiveTab] = useState<"returns" | "cash" | "reconcile">("returns");

  if (!isSettlementModalOpen || !selectedSheetDetail) return null;

  const tripDistanceKm = Math.max(0, closingKm - (selectedSheetDetail.opening_km || 0));
  const recon = activeReconciliation;

  const handleCashChange = (pkrStr: string) => {
    const valPaisa = Math.round((parseFloat(pkrStr) || 0) * 100);
    updateSettlementFinancials(valPaisa, emptyCratesReturned, routeExpensesPaisa);
  };

  const handleExpensesChange = (pkrStr: string) => {
    const valPaisa = Math.round((parseFloat(pkrStr) || 0) * 100);
    updateSettlementFinancials(physicalCashPaisa, emptyCratesReturned, valPaisa);
  };

  const handleCratesChange = (cratesStr: string) => {
    const valCrates = Math.max(0, parseInt(cratesStr, 10) || 0);
    updateSettlementFinancials(physicalCashPaisa, valCrates, routeExpensesPaisa);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3 text-white">
            <div className="p-2 bg-emerald-600/20 text-emerald-400 rounded-lg">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold">Evening Van Settlement & 3-Way Reconciliation</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-500/40 font-bold">
                  {selectedSheetDetail.sheet_number}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Route: {selectedSheetDetail.route_name} • Driver: {selectedSheetDetail.driver_name} • Vehicle: {selectedSheetDetail.vehicle_number}
              </p>
            </div>
          </div>
          <button
            onClick={closeSettlementModal}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Trip Stats Bar */}
        <div className="bg-slate-850 bg-slate-900/90 border-b border-slate-800 px-6 py-2.5 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center space-x-6 font-mono">
            <div>
              <span className="text-slate-500 block text-[10px]">Opening Odometer</span>
              <span className="font-bold text-slate-200">{selectedSheetDetail.opening_km} KM</span>
            </div>
            <div className="flex items-center space-x-2">
              <div>
                <span className="text-slate-500 block text-[10px]">Closing Odometer</span>
                <input
                  type="number"
                  value={closingKm}
                  onChange={(e) =>
                    updateSettlementFinancials(
                      physicalCashPaisa,
                      emptyCratesReturned,
                      routeExpensesPaisa,
                      Number(e.target.value)
                    )
                  }
                  className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white font-bold"
                />
              </div>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Trip Distance</span>
              <span className="font-bold text-cyan-400">{tripDistanceKm} KM</span>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-xs font-semibold">
            <button
              onClick={() => setActiveTab("returns")}
              className={`px-3 py-1 rounded-md transition ${
                activeTab === "returns" ? "bg-cyan-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              1. Physical Returns
            </button>
            <button
              onClick={() => setActiveTab("cash")}
              className={`px-3 py-1 rounded-md transition ${
                activeTab === "cash" ? "bg-cyan-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              2. Cash Handover
            </button>
            <button
              onClick={() => {
                setActiveTab("reconcile");
                recalculateSettlement();
              }}
              className={`px-3 py-1 rounded-md transition ${
                activeTab === "reconcile" ? "bg-cyan-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              3. Reconciliation & Approval
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* TAB 1: PHYSICAL RETURNS & BREAKAGE */}
          {activeTab === "returns" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">
                  Physical Stock Returns Count (Unsold Drinks & Breakage)
                </span>
                <button
                  type="button"
                  onClick={recalculateSettlement}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-lg font-bold"
                >
                  Recalculate Variances
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-700 rounded-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-800 text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="p-3">Product</th>
                      <th className="p-3 text-right">Morning Load</th>
                      <th className="p-3 text-right">Invoiced Sold</th>
                      <th className="p-3 text-center">Returned Packs</th>
                      <th className="p-3 text-center">Returned Loose</th>
                      <th className="p-3 text-center">Road Breakage</th>
                      <th className="p-3 text-right">Variance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                    {selectedSheetDetail.items.map((item) => {
                      const ret = physicalReturns[item.product_id] || {
                        packs: 0,
                        loose: 0,
                        breakage: 0,
                        notes: "",
                      };
                      const reconLine = recon?.stock_items.find(
                        (s) => s.product_id === item.product_id
                      );

                      return (
                        <tr key={item.product_id} className="hover:bg-slate-800/40">
                          <td className="p-3">
                            <span className="font-bold text-white block">{item.product_name}</span>
                            <span className="text-[10px] text-cyan-400">{item.product_sku}</span>
                          </td>
                          <td className="p-3 text-right font-bold text-slate-300">
                            {item.total_loaded_base} btls
                          </td>
                          <td className="p-3 text-right text-emerald-400 font-bold">
                            {item.sold_base} btls
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={ret.packs}
                              onChange={(e) => {
                                updateReturnLine(item.product_id, "packs", parseInt(e.target.value) || 0);
                                recalculateSettlement();
                              }}
                              className="w-16 text-center bg-slate-800 border border-slate-700 rounded p-1 text-white font-bold"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={ret.loose}
                              onChange={(e) => {
                                updateReturnLine(item.product_id, "loose", parseInt(e.target.value) || 0);
                                recalculateSettlement();
                              }}
                              className="w-14 text-center bg-slate-800 border border-slate-700 rounded p-1 text-white"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={ret.breakage}
                              onChange={(e) => {
                                updateReturnLine(item.product_id, "breakage", parseInt(e.target.value) || 0);
                                recalculateSettlement();
                              }}
                              className="w-14 text-center bg-slate-800 border border-red-500/50 rounded p-1 text-red-300 font-bold"
                            />
                          </td>
                          <td className="p-3 text-right">
                            {reconLine ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  reconLine.status === "BALANCED"
                                    ? "bg-emerald-950 text-emerald-400"
                                    : "bg-red-950 text-red-400 border border-red-500/40"
                                }`}
                              >
                                {reconLine.status === "BALANCED"
                                  ? "BALANCED (0)"
                                  : `SHORT: ${reconLine.variance_base} (${formatPkr(reconLine.shortage_value_paisa)})`}
                              </span>
                            ) : (
                              <span className="text-slate-500">Pending</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Empty Crates Unloading Card */}
              <div className="bg-slate-850 bg-slate-800/80 border border-slate-700 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs block">
                    Physical Empty Crates Unloaded into Yard
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Morning: {selectedSheetDetail.empty_crates_loaded} Crates • Expected return:{" "}
                    {recon?.empty_crates_expected ?? selectedSheetDetail.empty_crates_loaded} Crates
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="0"
                    value={emptyCratesReturned}
                    onChange={(e) => handleCratesChange(e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded-lg p-2 text-amber-400 font-mono font-bold text-sm outline-none"
                  />
                  <span className="text-slate-400">Crates</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CASH HANDOVER & EXPENSES */}
          {activeTab === "cash" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Route Financial Auto-Summary */}
                <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-2.5">
                  <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center space-x-2">
                    <Banknote className="w-4 h-4 text-emerald-400" />
                    <span>Invoiced Route Collections Summary</span>
                  </h3>
                  <div className="flex justify-between py-1 border-b border-slate-700/60 font-mono">
                    <span className="text-slate-400">Invoiced Cash Sales:</span>
                    <span className="text-slate-200 font-bold">
                      {formatPkr(recon?.route_cash_sales_paisa || 8500000)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-700/60 font-mono">
                    <span className="text-slate-400">Route Udhaar Debt Recoveries:</span>
                    <span className="text-slate-200 font-bold">
                      {formatPkr(recon?.route_recoveries_collected_paisa || 2500000)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-700/60 font-mono">
                    <span className="text-slate-400">Approved Fuel & Route Expenses:</span>
                    <span className="text-amber-400 font-bold">
                      -{formatPkr(routeExpensesPaisa)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-600 font-mono font-bold text-sm text-cyan-400">
                    <span>Expected Cash Handover:</span>
                    <span>{formatPkr(recon?.expected_cash_paisa || 11000000)}</span>
                  </div>
                </div>

                {/* Actual Physical Cash Counted */}
                <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-3">
                  <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center space-x-2">
                    <Coins className="w-4 h-4 text-cyan-400" />
                    <span>Cashier Drawer Cash Handover</span>
                  </h3>

                  <div className="space-y-1">
                    <label className="text-slate-400 block font-medium">Approved Fuel / Toll Receipts (₨)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={routeExpensesPaisa ? routeExpensesPaisa / 100 : ""}
                      onChange={(e) => handleExpensesChange(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-emerald-400 font-bold block">
                      Physical Cash Handed Over into Drawer (₨)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={physicalCashPaisa ? physicalCashPaisa / 100 : ""}
                      onChange={(e) => handleCashChange(e.target.value)}
                      className="w-full bg-slate-900 border-2 border-emerald-500 rounded-lg p-2 text-emerald-300 font-mono font-bold text-lg outline-none"
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-700/60 flex justify-between items-center font-mono">
                    <span className="text-slate-400 font-medium">Cash Variance:</span>
                    <span
                      className={`text-sm font-bold ${
                        recon?.cash_variance_paisa === 0
                          ? "text-emerald-400"
                          : (recon?.cash_variance_paisa || 0) < 0
                          ? "text-red-400"
                          : "text-cyan-400"
                      }`}
                    >
                      {formatPkr(recon?.cash_variance_paisa || 0)} ({recon?.cash_variance_type || "BALANCED"})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 3-WAY RECONCILIATION SUMMARY & APPROVAL */}
          {activeTab === "reconcile" && recon && (
            <div className="space-y-4">
              {/* Liability Summary Grid */}
              <div className="grid grid-cols-4 gap-3 text-center font-mono">
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <span className="text-slate-400 block text-[10px] font-sans">Stock Shortage</span>
                  <span className="text-base font-bold text-slate-200">
                    {formatPkr(recon.total_stock_shortage_value_paisa)}
                  </span>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <span className="text-slate-400 block text-[10px] font-sans">Crate Shortage</span>
                  <span className="text-base font-bold text-slate-200">
                    {formatPkr(recon.crate_shortage_value_paisa)}
                  </span>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <span className="text-slate-400 block text-[10px] font-sans">Cash Shortage</span>
                  <span className="text-base font-bold text-slate-200">
                    {recon.cash_variance_paisa < 0 ? formatPkr(Math.abs(recon.cash_variance_paisa)) : "₨ 0.00"}
                  </span>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <span className="text-slate-400 block text-[10px] font-sans">Total Driver Liability</span>
                  <span
                    className={`text-base font-bold ${
                      recon.total_driver_shortage_liability_paisa === 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {formatPkr(recon.total_driver_shortage_liability_paisa)}
                  </span>
                </div>
              </div>

              {/* Status Alert Banner */}
              {recon.is_balanced ? (
                <div className="p-4 bg-emerald-950/60 border border-emerald-500/60 rounded-xl text-emerald-200 flex items-center space-x-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm">Trip Fully Balanced & Reconciled!</h4>
                    <p className="text-xs text-emerald-300">
                      Zero stock shortage, zero crate discrepancy, exact cash handover verified.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-950/60 border border-red-500/60 rounded-xl text-red-200 space-y-3">
                  <div className="flex items-center space-x-3">
                    <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm">Driver Shortage Liability Detected!</h4>
                      <p className="text-xs text-red-300">
                        Driver has an unresolved shortage of {formatPkr(recon.total_driver_shortage_liability_paisa)}. Select resolution action:
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <label className="flex items-center space-x-2 bg-slate-900/80 p-3 rounded-lg border border-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="shortage_action"
                        checked={shortageAction === "CHARGE_DRIVER"}
                        onChange={() => setShortageAction("CHARGE_DRIVER")}
                        className="text-red-500"
                      />
                      <div>
                        <span className="font-bold block text-white">Charge Driver Debt (Dr 1250)</span>
                        <span className="text-[10px] text-slate-400">Driver debt recorded on driver ledger</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-2 bg-slate-900/80 p-3 rounded-lg border border-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="shortage_action"
                        checked={shortageAction === "EXPENSE_WAIVER"}
                        onChange={() => setShortageAction("EXPENSE_WAIVER")}
                        className="text-red-500"
                      />
                      <div>
                        <span className="font-bold block text-white">Company Loss Waiver (Dr 6090)</span>
                        <span className="text-[10px] text-slate-400">Depot absorbs loss; requires PIN</span>
                      </div>
                    </label>
                  </div>

                  {/* Supervisor PIN Input */}
                  <div className="pt-2 flex items-center space-x-3">
                    <span className="font-semibold text-xs">Supervisor PIN (1234):</span>
                    <input
                      type="password"
                      placeholder="Admin PIN..."
                      value={supervisorPin}
                      onChange={(e) => setSupervisorPin(e.target.value)}
                      className="bg-slate-900 border border-red-400 rounded-lg px-3 py-1 text-white font-mono w-36 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Settlement Notes */}
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold block">Settlement Audit Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Fuel verified; 1 crate missing at retail stop, agreed by driver"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-950/60 border border-red-500/50 rounded-lg text-red-200 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-800 px-6 py-4 border-t border-slate-700 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Submitting settlement restocks returned drinks, injects cash into till, and finalizes delivery sheet.
          </div>
          <div className="flex space-x-3">
            <button
              onClick={closeSettlementModal}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={submitSettlement}
              disabled={isLoading || isCalculating}
              className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold rounded-lg shadow-lg transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Settle Van Trip</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
