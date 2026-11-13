// src/components/pos/WasooliRaseedModal.tsx
import { useState, useEffect } from "react";
import { formatPkr } from "../../types/domain";
import { Paisa } from "../../types/ipc";
import { CustomerSummary } from "../../store/useSalesStore";
import {
  accountingService,
  CustomerUdhaarAgingDto,
  RecoveryReceiptDto,
} from "../../services/accountingService";
import {
  X,
  Receipt,
  Printer,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

interface WasooliRaseedModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerSummary[];
  preSelectedCustomerId?: number | null;
  onRecoveryComplete?: (receipt: RecoveryReceiptDto) => void;
}

export function WasooliRaseedModal({
  isOpen,
  onClose,
  customers,
  preSelectedCustomerId,
  onRecoveryComplete,
}: WasooliRaseedModalProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(1);
  const [agingData, setAgingData] = useState<CustomerUdhaarAgingDto | null>(null);
  const [amountPkr, setAmountPkr] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "BANK" | "CHEQUE">("CASH");
  const [allocationMode, setAllocationMode] = useState<"FIFO" | "SPECIFIC" | "ON_ACCOUNT">("FIFO");
  const [instrumentRef, setInstrumentRef] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<RecoveryReceiptDto | null>(null);

  useEffect(() => {
    if (isOpen) {
      const initialId = preSelectedCustomerId || (customers[0]?.id ?? 1);
      setSelectedCustomerId(initialId);
      setAmountPkr("");
      setActiveReceipt(null);
      setError(null);
      loadCustomerAging(initialId);
    }
  }, [isOpen, preSelectedCustomerId, customers]);

  const loadCustomerAging = async (customerId: number) => {
    setIsLoading(true);
    try {
      const res = await accountingService.getCustomerAging(customerId);
      setAgingData(res);
      setIsLoading(false);
    } catch {
      setIsLoading(false);
    }
  };

  const handleCustomerChange = (id: number) => {
    setSelectedCustomerId(id);
    loadCustomerAging(id);
  };

  const handleRecordRecovery = async () => {
    setError(null);
    const amountVal = parseFloat(amountPkr);
    if (!amountVal || amountVal <= 0) {
      setError("Please enter a valid recovery amount in PKR.");
      return;
    }

    const amountPaisa: Paisa = Math.round(amountVal * 100);
    setIsLoading(true);

    try {
      const receipt = await accountingService.recordCustomerRecovery({
        customer_id: selectedCustomerId,
        amount_paisa: amountPaisa,
        payment_mode: paymentMode,
        allocation_mode: allocationMode,
        instrument_number: instrumentRef || undefined,
        notes: notes || undefined,
        payment_date: new Date().toISOString(),
      });

      setActiveReceipt(receipt);
      setIsLoading(false);
      if (onRecoveryComplete) onRecoveryComplete(receipt);
      // Reload aging
      loadCustomerAging(selectedCustomerId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-white">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold">Wasooli Raseed — Debt Recovery (F10)</h2>
              <p className="text-[11px] text-slate-400">
                وصولی رسید برائے ادھار ریکوری — Official Retailer Khata Settlement
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm flex-1">
          {activeReceipt ? (
            /* Receipt Presentation Mode */
            <div className="space-y-4">
              <div className="bg-emerald-950/60 border border-emerald-500/50 p-4 rounded-xl flex items-center space-x-3 text-emerald-200">
                <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">Recovery Recorded Successfully!</h3>
                  <p className="text-xs text-emerald-300">
                    Voucher #{activeReceipt.recovery_number} | Cash Book & Customer Khata updated.
                  </p>
                </div>
              </div>

              {/* Thermal Receipt Preview Box */}
              <div className="bg-slate-950 border border-slate-700 rounded-xl p-4 font-mono text-xs text-slate-200 whitespace-pre overflow-x-auto shadow-inner leading-relaxed">
                {activeReceipt.formatted_thermal_receipt}
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Wasooli Raseed</span>
                </button>
                <button
                  onClick={() => {
                    setActiveReceipt(null);
                    setAmountPkr("");
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg transition"
                >
                  New Recovery
                </button>
              </div>
            </div>
          ) : (
            /* Input Form Mode */
            <>
              {/* Customer Selector */}
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block font-medium">Select Retailer / Customer Khata</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerChange(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.shopName} ({c.name}) — Due: {formatPkr(c.currentBalancePaisa)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Aging & Balance Snapshot Card */}
              {agingData && (
                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400 block">Total Outstanding Udhaar</span>
                      <span className="text-2xl font-mono font-bold text-red-400">
                        {formatPkr(agingData.total_outstanding_paisa)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Credit Limit</span>
                      <span className="text-sm font-mono text-slate-200">
                        {formatPkr(agingData.credit_limit_paisa)}
                      </span>
                    </div>
                  </div>

                  {/* 5-Bucket Pill Summary */}
                  <div className="pt-2 border-t border-slate-700/60 grid grid-cols-5 gap-2 text-center text-[11px]">
                    <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-700">
                      <span className="text-slate-400 block">0-7d</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {formatPkr(agingData.bucket_0_7_paisa)}
                      </span>
                    </div>
                    <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-700">
                      <span className="text-slate-400 block">8-15d</span>
                      <span className="font-mono text-cyan-400 font-bold">
                        {formatPkr(agingData.bucket_8_15_paisa)}
                      </span>
                    </div>
                    <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-700">
                      <span className="text-slate-400 block">16-30d</span>
                      <span className="font-mono text-amber-400 font-bold">
                        {formatPkr(agingData.bucket_16_30_paisa)}
                      </span>
                    </div>
                    <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-700">
                      <span className="text-slate-400 block">31-60d</span>
                      <span className="font-mono text-orange-400 font-bold">
                        {formatPkr(agingData.bucket_31_60_paisa)}
                      </span>
                    </div>
                    <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-700">
                      <span className="text-slate-400 block">60+d</span>
                      <span className="font-mono text-red-400 font-bold">
                        {formatPkr(agingData.bucket_60_plus_paisa)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Recovery Form Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-emerald-400 font-bold block">
                    Amount Recovered (وصول رقم ₨)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amountPkr}
                    onChange={(e) => setAmountPkr(e.target.value)}
                    placeholder="e.g. 25000"
                    autoFocus
                    className="w-full bg-slate-800 border-2 border-emerald-500/70 focus:border-emerald-400 rounded-lg px-3 py-2 text-lg font-mono font-bold text-emerald-300 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium block">Payment Channel</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none"
                  >
                    <option value="CASH">Liquid Cash (Till Drawer)</option>
                    <option value="BANK">Online Bank / Raast Transfer</option>
                    <option value="CHEQUE">Bank Cheque</option>
                  </select>
                </div>
              </div>

              {/* Allocation Mode & Reference */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium block">Invoice Knock-Off Mode</label>
                  <select
                    value={allocationMode}
                    onChange={(e) => setAllocationMode(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none"
                  >
                    <option value="FIFO">FIFO (Oldest Invoices Cleared First)</option>
                    <option value="SPECIFIC">Specific Overdue Bill</option>
                    <option value="ON_ACCOUNT">On Account (General Credit)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium block">
                    Instrument / Transaction Ref #
                  </label>
                  <input
                    type="text"
                    value={instrumentRef}
                    onChange={(e) => setInstrumentRef(e.target.value)}
                    placeholder="e.g. RAAST-8921 or CHQ-00124"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium block">Narration / Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Counter payment received from shop owner Muhammad Akram"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm outline-none"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-lg text-xs text-red-200 font-medium">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!activeReceipt && (
          <div className="bg-slate-800 px-6 py-4 border-t border-slate-700 flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition"
            >
              Cancel (Esc)
            </button>
            <button
              onClick={handleRecordRecovery}
              disabled={isLoading}
              className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white text-xs font-bold rounded-lg shadow-lg transition disabled:opacity-50"
            >
              <span>Record & Generate Wasooli Raseed</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
