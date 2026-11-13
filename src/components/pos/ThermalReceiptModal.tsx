// src/components/pos/ThermalReceiptModal.tsx
import { useState } from "react";
import { SalesInvoiceReceiptDto } from "../../types/sales";
import { formatPkr } from "../../types/domain";
import { X, Printer, CheckCircle } from "lucide-react";

interface ThermalReceiptModalProps {
  receipt: SalesInvoiceReceiptDto;
  onClose: () => void;
}

export function ThermalReceiptModal({ receipt, onClose }: ThermalReceiptModalProps) {
  const [paperWidth, setPaperWidth] = useState<"80mm" | "58mm">("80mm");

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header Bar */}
        <div className="bg-slate-800 px-6 py-3 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-white">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold">Transaction Complete — Thermal Receipt</h2>
          </div>
          <div className="flex items-center space-x-3">
            {/* 80mm vs 58mm Toggle */}
            <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs font-semibold">
              <button
                onClick={() => setPaperWidth("80mm")}
                className={`px-3 py-1 rounded-md transition ${
                  paperWidth === "80mm" ? "bg-cyan-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                80mm Standard
              </button>
              <button
                onClick={() => setPaperWidth("58mm")}
                className={`px-3 py-1 rounded-md transition ${
                  paperWidth === "58mm" ? "bg-cyan-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                58mm Compact
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Receipt Content Container */}
        <div className="p-6 overflow-y-auto flex-1 flex justify-center bg-slate-950/60">
          <div
            className={`bg-white text-slate-950 font-mono text-xs leading-relaxed p-6 rounded-lg shadow-xl border border-slate-200 transition-all ${
              paperWidth === "80mm" ? "w-[360px]" : "w-[260px] text-[11px]"
            }`}
          >
            {/* Receipt Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-400">
              <div className="font-bold text-sm tracking-wider uppercase">
                LOGAR TRADERS — NEXTCO DEPOT
              </div>
              <div className="text-[11px] font-sans font-bold text-slate-700">
                لوگر ٹریڈرز — بااختیار ڈسٹری بیوٹرز نیکسٹ کو
              </div>
              <div className="text-[10px] text-slate-600">
                Main Bypass, Rahim Yar Khan | Ph: +92 300 1234567
              </div>
              <div className="text-[10px] text-slate-600">NTN: 7483921-5 | STRN: Seeded</div>
            </div>

            {/* Bill Meta */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Inv #:</span>
                <span className="font-bold">{receipt.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date().toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Retailer:</span>
                <span className="font-bold">{receipt.shop_name || receipt.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Owner:</span>
                <span>{receipt.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment:</span>
                <span className="font-bold uppercase">{receipt.payment_type}</span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-2">
              <div className="flex justify-between font-bold text-[10px] border-b border-slate-300 pb-1">
                <span>ITEM / SKU</span>
                <span>QTY x RATE</span>
                <span>TOTAL</span>
              </div>
              {receipt.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-[11px]">
                  <div className="truncate max-w-[140px]">
                    <span className="block font-medium truncate">{String(item.product_name)}</span>
                    <span className="text-[10px] text-slate-500">
                      {item.pack_qty > 0 && `${item.pack_qty} Pk `}
                      {item.loose_qty > 0 && `${item.loose_qty} Btl `}
                      (@ {formatPkr(item.unit_price_paisa)})
                    </span>
                  </div>
                  <div className="text-right font-semibold">
                    {formatPkr(item.line_total_paisa)}
                  </div>
                </div>
              ))}
            </div>

            {/* Financial Totals */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Subtotal (Drink):</span>
                <span>{formatPkr(receipt.subtotal_paisa)}</span>
              </div>
              {receipt.discount_paisa > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount:</span>
                  <span>-{formatPkr(receipt.discount_paisa)}</span>
                </div>
              )}
              {receipt.crate_deposit_charged_paisa > 0 && (
                <div className="flex justify-between text-slate-700">
                  <span>Crate Security Deposit:</span>
                  <span>+{formatPkr(receipt.crate_deposit_charged_paisa)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-300">
                <span>NET TOTAL:</span>
                <span>{formatPkr(receipt.net_total_paisa)}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span>Cash Paid (Naqad):</span>
                <span className="font-bold">{formatPkr(receipt.paid_amount_paisa)}</span>
              </div>
              <div className="flex justify-between">
                <span>Khata Udhaar:</span>
                <span className="font-bold text-red-700">{formatPkr(receipt.due_amount_paisa)}</span>
              </div>
            </div>

            {/* Retailer Khata Summary */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
              <div className="font-bold uppercase text-slate-700">Retailer Khata (کھاتہ کا حساب)</div>
              <div className="flex justify-between">
                <span>Total Balance Due:</span>
                <span className="font-bold">{formatPkr(receipt.new_customer_balance_paisa)}</span>
              </div>
            </div>

            {/* Empty Crate Account */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
              <div className="font-bold uppercase text-slate-700">Crate Account (خالی کریٹ کھاتہ)</div>
              <div className="flex justify-between">
                <span>Issued: {receipt.crates_issued} | Returned: {receipt.crates_returned}</span>
                <span className="font-bold">Debt: {receipt.new_crate_balance} Crates</span>
              </div>
            </div>

            {/* Footer Terms */}
            <div className="text-center pt-3 space-y-1 text-[10px] text-slate-600">
              <div className="font-sans font-semibold">مال بکا ہوا واپس نہیں ہوگا۔ بغیر رسید دعویٰ قابل قبول نہیں۔</div>
              <div>Thank you for choosing Logar Traders!</div>
              <div className="text-[9px] text-slate-400 font-sans">Powered by Logar POS Engine</div>
            </div>
          </div>
        </div>

        {/* Footer Action Buttons */}
        <div className="bg-slate-800 px-6 py-3 border-t border-slate-700 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Press <span className="font-mono text-cyan-400 font-bold">Esc</span> to close or start new bill
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition"
            >
              Done (Esc)
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg shadow-lg transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print Receipt (Enter)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
