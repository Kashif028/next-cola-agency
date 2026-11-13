import React, { useEffect, useState } from "react";
import { useInventoryStore } from "../../store/useInventoryStore";
import { formatPkr, pkrToPaisa } from "../../types/domain";
import {
  Boxes,
  ShieldCheck,
  RotateCcw,
  PlusCircle,
  FileText,
  DollarSign,
  X,
} from "lucide-react";

const INITIAL_CUSTOMERS = [
  { id: 1, name: "Bismillah Kiryana Store", code: "CUST-101" },
  { id: 2, name: "Al-Madina Super Mart", code: "CUST-102" },
  { id: 3, name: "Subhanallah Cold Corner", code: "CUST-103" },
];

export const EmptiesCrateTracker: React.FC = () => {
  const {
    emptiesOverview,
    activeCustomerCrateLedger,
    isLoading,
    error,
    fetchEmptiesOverview,
    recordCrateTransaction,
    fetchCustomerCrateLedger,
    recordSecurityDeposit,
    refundSecurityDeposit,
    clearError,
  } = useInventoryStore();

  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(1);
  const [cratesOut, setCratesOut] = useState<number>(0);
  const [cratesIn, setCratesIn] = useState<number>(0);
  const [voucherRef, setVoucherRef] = useState<string>("CRT-MANUAL-01");
  const [notes, setNotes] = useState<string>("");

  // Deposit modal state
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositMode, setDepositMode] = useState<"RECEIVE" | "REFUND">("RECEIVE");
  const [depCratesCount, setDepCratesCount] = useState<number>(10);
  const [depRatePkr, setDepRatePkr] = useState<number>(250);
  const [depPaymentMode, setDepPaymentMode] = useState<string>("CASH");
  const [depNotes, setDepNotes] = useState<string>("");

  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchEmptiesOverview();
    fetchCustomerCrateLedger(selectedCustomerId);
  }, [fetchEmptiesOverview, fetchCustomerCrateLedger, selectedCustomerId]);

  const handleCrateTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cratesOut === 0 && cratesIn === 0) {
      setFeedbackMsg("Please enter either Crates Out or Crates In.");
      return;
    }

    try {
      await recordCrateTransaction({
        customer_id: selectedCustomerId,
        crates_out: cratesOut,
        crates_in: cratesIn,
        voucher_ref: voucherRef || `CRT-${Date.now()}`,
        notes: notes || undefined,
      });
      setCratesOut(0);
      setCratesIn(0);
      setVoucherRef(`CRT-${Date.now().toString().slice(-6)}`);
      setNotes("");
      setFeedbackMsg("Crate movement recorded successfully!");
      fetchCustomerCrateLedger(selectedCustomerId);
    } catch (err: unknown) {
      setFeedbackMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ratePaisa = pkrToPaisa(depRatePkr);
    try {
      if (depositMode === "RECEIVE") {
        await recordSecurityDeposit({
          customer_id: selectedCustomerId,
          crates_count: depCratesCount,
          deposit_rate_per_crate_paisa: ratePaisa,
          payment_mode: depPaymentMode,
          notes: depNotes || undefined,
        });
        setFeedbackMsg("Security deposit collected and credited to Account 2100!");
      } else {
        await refundSecurityDeposit({
          customer_id: selectedCustomerId,
          crates_count: depCratesCount,
          deposit_rate_per_crate_paisa: ratePaisa,
          payment_mode: depPaymentMode,
          notes: depNotes || undefined,
        });
        setFeedbackMsg("Security deposit refunded and debited from Account 2100!");
      }
      setIsDepositModalOpen(false);
      fetchCustomerCrateLedger(selectedCustomerId);
    } catch (err: unknown) {
      setFeedbackMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Accounting Compliance Banner */}
      <div className="bg-slate-800 border-l-4 border-amber-500 p-4 rounded-r-xl border-y border-r border-slate-700 shadow-sm flex items-start space-x-3">
        <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <span className="font-bold text-amber-300 block mb-0.5">
            GAAP Fiduciary Liability Guarantee (Account 2100)
          </span>
          <span className="text-slate-300">
            Empty crates and returnable glass bottles circulate independently from salable drinks.
            Cash deposits collected for borrowed crates are held under{" "}
            <strong>Account 2100 (Customer Crate Security Deposits Payable)</strong> as Current
            Liabilities. They are strictly excluded from Operating Revenue (4010) and COGS (5010) to
            prevent financial distortion.
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Depot Empty Crates Yard</span>
            <Boxes className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-400">
            {emptiesOverview?.warehouse_empty_crates ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Available in Depot</div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Depot Empty Glass Bottles</span>
            <RotateCcw className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {emptiesOverview?.warehouse_empty_bottles ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Ready for Factory Refill</div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Market Crate Debts</span>
            <FileText className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {emptiesOverview?.total_customer_crates_outstanding ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Owed by Retailers</div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Deposit Liability (Acct 2100)</span>
            <DollarSign className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400">
            {formatPkr(emptiesOverview?.total_deposit_liability_paisa ?? 0)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Refundable Cash Held</div>
        </div>
      </div>

      {/* Notifications */}
      {feedbackMsg && (
        <div className="bg-cyan-950/80 border border-cyan-500/50 p-3 rounded-lg text-xs text-cyan-200 flex justify-between items-center">
          <span>{feedbackMsg}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-cyan-400 hover:text-white">
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

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Console: Crate Circulation & Deposit Recording */}
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-sm space-y-5 lg:col-span-1">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3">
            <h3 className="font-bold text-white text-sm">Issue / Return Empties</h3>
            <button
              onClick={() => {
                setDepositMode("RECEIVE");
                setIsDepositModalOpen(true);
              }}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Deposit Tx</span>
            </button>
          </div>

          <form onSubmit={handleCrateTxSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Select Retailer Customer
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {INITIAL_CUSTOMERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Crates Out (Issued)
                </label>
                <input
                  type="number"
                  min="0"
                  value={cratesOut}
                  onChange={(e) => setCratesOut(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Crates In (Returned)
                </label>
                <input
                  type="number"
                  min="0"
                  value={cratesIn}
                  onChange={(e) => setCratesIn(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Voucher Reference
              </label>
              <input
                type="text"
                value={voucherRef}
                onChange={(e) => setVoucherRef(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Transaction Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                placeholder="Delivery van receipt, direct shop swap, etc."
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white rounded-lg shadow transition active:scale-95"
            >
              Post Crate Movement
            </button>
          </form>
        </div>

        {/* Right Audit Table: Customer Crate Ledger History */}
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-sm lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3">
            <div>
              <h3 className="font-bold text-white text-sm">Customer Crate Ledger Audit</h3>
              <p className="text-xs text-slate-400">
                Running crate balance history for{" "}
                {INITIAL_CUSTOMERS.find((c) => c.id === selectedCustomerId)?.name}
              </p>
            </div>
            <button
              onClick={() => fetchCustomerCrateLedger(selectedCustomerId)}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 font-semibold border-b border-slate-700 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Voucher Ref</th>
                  <th className="py-2.5 px-3 text-right">Crates Out</th>
                  <th className="py-2.5 px-3 text-right">Crates In</th>
                  <th className="py-2.5 px-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 text-slate-200">
                {activeCustomerCrateLedger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No crate ledger entries found for this retailer.
                    </td>
                  </tr>
                ) : (
                  activeCustomerCrateLedger.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-700/30 transition">
                      <td className="py-2.5 px-3 font-mono text-slate-400">{row.entry_date}</td>
                      <td className="py-2.5 px-3 font-mono text-cyan-400">{row.voucher_ref}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                        {row.crates_out > 0 ? `+${row.crates_out}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                        {row.crates_in > 0 ? `-${row.crates_in}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                        {row.running_crate_balance} Crates
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Security Deposit Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="font-bold text-white text-base">
                {depositMode === "RECEIVE"
                  ? "Receive Refundable Crate Deposit"
                  : "Refund Customer Crate Deposit"}
              </h3>
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex space-x-2 border-b border-slate-700 pb-3">
              <button
                type="button"
                onClick={() => setDepositMode("RECEIVE")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                  depositMode === "RECEIVE"
                    ? "bg-cyan-600 text-white"
                    : "bg-slate-700 text-slate-300"
                }`}
              >
                Receive Deposit (Liability +)
              </button>
              <button
                type="button"
                onClick={() => setDepositMode("REFUND")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                  depositMode === "REFUND"
                    ? "bg-amber-600 text-white"
                    : "bg-slate-700 text-slate-300"
                }`}
              >
                Refund Deposit (Liability -)
              </button>
            </div>

            <form onSubmit={handleDepositSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Customer</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {INITIAL_CUSTOMERS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Crates Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={depCratesCount}
                    onChange={(e) =>
                      setDepCratesCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Deposit Rate (PKR / Crate)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={depRatePkr}
                    onChange={(e) =>
                      setDepRatePkr(Math.max(1, parseFloat(e.target.value) || 1))
                    }
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-700/60 flex justify-between items-center text-xs">
                <span className="text-slate-400">Total Deposit Amount:</span>
                <span className="font-bold font-mono text-cyan-400 text-sm">
                  ₨ {(depCratesCount * depRatePkr).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Payment Mode
                </label>
                <select
                  value={depPaymentMode}
                  onChange={(e) => setDepPaymentMode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="CASH">CASH (Physical Drawer)</option>
                  <option value="BANK">BANK (Raast / Online)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes</label>
                <input
                  type="text"
                  value={depNotes}
                  onChange={(e) => setDepNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                  placeholder="Security deposit receipt notes..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white rounded-lg shadow transition"
                >
                  Confirm & Post Journal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
