// src/components/pos/SplitPaymentModal.tsx
import { useState, useEffect } from "react";
import { formatPkr } from "../../types/domain";
import { Paisa } from "../../types/ipc";
import { CustomerSummary } from "../../store/useSalesStore";
import { X, CreditCard, AlertTriangle, ShieldAlert } from "lucide-react";

interface SplitPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalPayablePaisa: Paisa;
  customer: CustomerSummary | null;
  onConfirmSplit: (cashPaisa: Paisa, creditPaisa: Paisa, supervisorPin?: string) => void;
}

export function SplitPaymentModal({
  isOpen,
  onClose,
  totalPayablePaisa,
  customer,
  onConfirmSplit,
}: SplitPaymentModalProps) {
  const [cashInputPkr, setCashInputPkr] = useState<string>("");
  const [supervisorPin, setSupervisorPin] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Default to 50% cash
      const defaultCashPkr = Math.floor(totalPayablePaisa / 200);
      setCashInputPkr(defaultCashPkr.toString());
      setSupervisorPin("");
      setError(null);
    }
  }, [isOpen, totalPayablePaisa]);

  if (!isOpen) return null;

  const cashPaisa = Math.max(0, Math.round((parseFloat(cashInputPkr) || 0) * 100));
  const creditPaisa = Math.max(0, totalPayablePaisa - cashPaisa);

  // Credit limit calculation
  const currentDebt = customer?.currentBalancePaisa || 0;
  const creditLimit = customer?.creditLimitPaisa || 0;
  const projectedExposure = currentDebt + creditPaisa;
  const isLimitBreached = creditLimit > 0 && projectedExposure > creditLimit;
  const breachAmount = Math.max(0, projectedExposure - creditLimit);

  const handleQuickPercent = (percent: number) => {
    const calculatedPaisa = Math.round((totalPayablePaisa * percent) / 100);
    setCashInputPkr((calculatedPaisa / 100).toString());
  };

  const handleConfirm = () => {
    setError(null);
    if (cashPaisa < 0 || creditPaisa < 0) {
      setError("Invalid payment amounts.");
      return;
    }
    if (isLimitBreached && (!supervisorPin || supervisorPin !== "1234")) {
      setError("Credit limit is breached! Valid supervisor PIN (1234) is required.");
      return;
    }
    onConfirmSplit(cashPaisa, creditPaisa, isLimitBreached ? supervisorPin : undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-850 bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-white">
            <CreditCard className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold">Split Payment Checkout (F6)</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-sm">
          {/* Bill Total Banner */}
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider block">Net Bill Payable</span>
              <span className="text-2xl font-mono font-bold text-white">
                {formatPkr(totalPayablePaisa)}
              </span>
            </div>
            {customer && (
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Retailer Khata</span>
                <span className="text-sm font-semibold text-cyan-300">{customer.shopName}</span>
                <span className="text-xs text-slate-400 block">
                  Current Debt: {formatPkr(customer.currentBalancePaisa)}
                </span>
              </div>
            )}
          </div>

          {/* Quick Percent Buttons */}
          <div>
            <label className="text-xs text-slate-400 block mb-1 font-medium">Quick Cash Ratio</label>
            <div className="grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleQuickPercent(pct)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition"
                >
                  {pct}% Cash
                </button>
              ))}
            </div>
          </div>

          {/* Dual Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-emerald-400 font-bold block">
                Cash Tendered Now (Naqad ₨)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={cashInputPkr}
                onChange={(e) => setCashInputPkr(e.target.value)}
                autoFocus
                className="w-full bg-slate-800 border-2 border-emerald-500/60 focus:border-emerald-400 rounded-lg px-3 py-2 text-lg font-mono font-bold text-emerald-300 outline-none"
              />
              <span className="text-[11px] text-slate-400">
                Paisa: {cashPaisa.toLocaleString()}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-amber-400 font-bold block">
                Balance on Khata (Udhaar ₨)
              </label>
              <div className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-lg font-mono font-bold text-amber-300">
                {(creditPaisa / 100).toFixed(2)}
              </div>
              <span className="text-[11px] text-slate-400">
                Paisa: {creditPaisa.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Credit Limit Assessment */}
          {customer && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                isLimitBreached
                  ? "bg-red-950/50 border-red-500 text-red-200"
                  : "bg-slate-800/50 border-slate-700 text-slate-300"
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span>Authorized Credit Limit:</span>
                <span className="font-mono">{formatPkr(creditLimit)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Post-Transaction Exposure:</span>
                <span className="font-mono">{formatPkr(projectedExposure)}</span>
              </div>
              {isLimitBreached && (
                <div className="pt-2 border-t border-red-500/40 text-red-300 flex items-start space-x-2">
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">CREDIT LIMIT BREACHED!</span> Exceeds by{" "}
                    <span className="font-mono font-bold">{formatPkr(breachAmount)}</span>.
                    Supervisor PIN override required below.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Supervisor PIN Override if Breached */}
          {isLimitBreached && (
            <div className="space-y-1.5 bg-red-900/20 border border-red-700/60 p-3 rounded-xl">
              <label className="text-xs text-red-300 font-semibold block flex items-center space-x-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Admin / Supervisor PIN (1234)</span>
              </label>
              <input
                type="password"
                maxLength={6}
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
                placeholder="Enter 4-digit PIN..."
                className="w-full bg-slate-900 border border-red-500 rounded-lg px-3 py-1.5 text-sm font-mono text-white outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-lg text-xs text-red-200 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-800 px-6 py-4 border-t border-slate-700 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition"
          >
            Cancel (Esc)
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-95 text-white text-xs font-bold rounded-lg shadow-lg transition"
          >
            Confirm Split & Place Bill
          </button>
        </div>
      </div>
    </div>
  );
}
