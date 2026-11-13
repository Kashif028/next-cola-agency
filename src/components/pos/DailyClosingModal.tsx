import React, { useState } from "react";
import { useSalesStore } from "../../store/useSalesStore";
import { X, Lock, Coins, CheckCircle, AlertTriangle, ShieldAlert } from "lucide-react";
import { DenominationCountsDto } from "../../types/sales";

interface DenomRow {
  key: keyof DenominationCountsDto;
  label: string;
  valuePkr: number;
  isCoin?: boolean;
}

const DENOM_LIST: DenomRow[] = [
  { key: "note_5000", label: "₨ 5,000 Note", valuePkr: 5000 },
  { key: "note_1000", label: "₨ 1,000 Note", valuePkr: 1000 },
  { key: "note_500", label: "₨ 500 Note", valuePkr: 500 },
  { key: "note_100", label: "₨ 100 Note", valuePkr: 100 },
  { key: "note_50", label: "₨ 50 Note", valuePkr: 50 },
  { key: "note_20", label: "₨ 20 Note", valuePkr: 20 },
  { key: "note_10", label: "₨ 10 Note", valuePkr: 10 },
  { key: "coin_10", label: "₨ 10 Coin", valuePkr: 10, isCoin: true },
  { key: "coin_5", label: "₨ 5 Coin", valuePkr: 5, isCoin: true },
  { key: "coin_2", label: "₨ 2 Coin", valuePkr: 2, isCoin: true },
  { key: "coin_1", label: "₨ 1 Coin", valuePkr: 1, isCoin: true },
];

export const DailyClosingModal: React.FC = () => {
  const {
    isClosingModalOpen,
    closeClosingModal,
    closingSummary,
    denominations,
    setDenominationCount,
    varianceReason,
    setVarianceReason,
    physicalCashPaisa,
    variancePaisa,
    submitClosing,
    isLoading,
    error,
  } = useSalesStore();

  const [adminPin, setAdminPin] = useState("1234");
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  if (!isClosingModalOpen || !closingSummary) return null;

  const expectedPkr = closingSummary.expected_closing_cash_paisa / 100;
  const physicalPkr = physicalCashPaisa / 100;
  const variancePkr = variancePaisa / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessInfo(null);
    try {
      const res = await submitClosing(adminPin);
      setSuccessInfo(
        `Accounting Day ${res.closing_date} successfully LOCKED! Variance: ₨ ${(res.variance_paisa / 100).toFixed(
          2
        )} (${res.variance_type}). ${res.locked_invoices_count} invoices locked.`
      );
      setTimeout(() => {
        closeClosingModal();
      }, 2000);
    } catch {
      // error handled in store
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col text-xs font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-600/20 text-amber-400 rounded-lg">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Daily Cash Closing & Day Lock Ceremony ({closingSummary.closing_date})
              </h2>
              <p className="text-xs text-slate-400">
                Reconcile physical cash drawer against expected cash formula and lock accounting date
              </p>
            </div>
          </div>
          <button onClick={closeClosingModal} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1">
          {error && (
            <div className="bg-red-950/80 border border-red-500/50 p-3 rounded-lg text-red-200 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          {successInfo && (
            <div className="bg-emerald-950/80 border border-emerald-500/50 p-3 rounded-lg text-emerald-200 flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successInfo}</span>
            </div>
          )}

          {/* Expected Cash Flow Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono">
            <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl">
              <span className="text-slate-400 text-[11px] block font-sans">Opening Float</span>
              <span className="text-sm font-bold text-slate-100">
                ₨ {(closingSummary.opening_cash_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl">
              <span className="text-slate-400 text-[11px] block font-sans">(+) Verified Cash In</span>
              <span className="text-sm font-bold text-emerald-400">
                +₨ {(closingSummary.cash_in.total_cash_in_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-400 block font-sans">
                POS: ₨ {(closingSummary.cash_in.pos_cash_sales_paisa / 100).toLocaleString()}
              </span>
            </div>
            <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl">
              <span className="text-slate-400 text-[11px] block font-sans">(-) Verified Cash Out</span>
              <span className="text-sm font-bold text-red-400">
                -₨ {(closingSummary.cash_out.total_cash_out_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-400 block font-sans">
                Purchases & Expenses
              </span>
            </div>
            <div className="p-3 bg-cyan-950/40 border border-cyan-600/50 rounded-xl">
              <span className="text-cyan-300 text-[11px] block font-sans font-bold">(=) Expected Cash Drawer</span>
              <span className="text-base font-bold text-cyan-300">
                ₨ {expectedPkr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Physical Cash Denomination Counter Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
                <Coins className="w-4 h-4 text-amber-400" />
                <span>Physical Cash Denomination Count</span>
              </h3>
              <div className="text-right">
                <span className="text-slate-400 mr-2">Physical Cash Total:</span>
                <span className="text-base font-bold text-white font-mono">
                  ₨ {physicalPkr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {DENOM_LIST.map((d) => {
                const count = denominations[d.key] || 0;
                const subtotal = count * d.valuePkr;

                return (
                  <div
                    key={d.key}
                    className="p-2.5 bg-slate-800/70 border border-slate-700/80 rounded-xl flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-slate-300">{d.label}</span>
                      <span className="text-[10px] text-slate-400 font-mono">× {d.valuePkr}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min={0}
                        value={count === 0 ? "" : count}
                        placeholder="0"
                        onChange={(e) => setDenominationCount(d.key, Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-center font-mono font-bold text-white focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                    <div className="text-right text-[11px] font-mono text-cyan-400 mt-1">
                      ₨ {subtotal.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Variance Analysis Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              variancePaisa === 0
                ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                : variancePaisa < 0
                ? "bg-red-950/50 border-red-500/60 text-red-200"
                : "bg-amber-950/40 border-amber-500/50 text-amber-300"
            }`}
          >
            <div className="flex items-center space-x-3">
              {variancePaisa === 0 ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <div>
                <div className="font-bold text-sm">
                  {variancePaisa === 0
                    ? "Drawer Perfectly Reconciled (Zero Variance)"
                    : variancePaisa < 0
                    ? `Physical Cash Shortage: -₨ ${Math.abs(variancePkr).toFixed(2)}`
                    : `Physical Cash Excess: +₨ ${variancePkr.toFixed(2)}`}
                </div>
                <p className="text-[11px] opacity-80 mt-0.5">
                  {variancePaisa === 0
                    ? "Physical currency matches verified expected ledger cash exactly."
                    : variancePaisa < 0
                    ? "Shortage will be debited to Account 1250 (Cashier Shortage Receivables) and credited to Cash on Hand."
                    : "Excess will be credited to Account 4090 (Miscellaneous Income / Cash Excess) and debited to Cash on Hand."}
                </p>
              </div>
            </div>

            <div className="text-right font-mono font-bold text-base">
              {variancePaisa > 0 ? `+₨ ${variancePkr.toFixed(2)}` : `₨ ${variancePkr.toFixed(2)}`}
            </div>
          </div>

          {/* Variance Reason & Admin PIN */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">
                Variance Explanation / Audit Reason {variancePaisa !== 0 && <span className="text-red-400">*</span>}
              </label>
              <input
                type="text"
                placeholder={variancePaisa === 0 ? "Reconciled with zero variance" : "State reason for shortage or excess"}
                value={varianceReason}
                onChange={(e) => setVarianceReason(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Supervisor Authorization PIN</label>
              <input
                type="password"
                placeholder="Admin PIN (e.g. 1234)"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
              />
            </div>
          </div>

          {/* Day Lock Warning & Submit */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 flex items-center space-x-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Locking permanently prevents retroactive edits on this date</span>
            </span>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={closeClosingModal}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-semibold"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-lg transition flex items-center space-x-2 disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>{isLoading ? "Locking Day..." : "Finalize Closing & Lock Day"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
