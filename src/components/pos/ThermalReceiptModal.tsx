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

  // Determine if retailer name is provided
  const rawCustomer = (receipt.shop_name || receipt.customer_name || "").trim();
  const hasRetailer =
    rawCustomer.length > 0 &&
    !rawCustomer.toLowerCase().includes("walk-in") &&
    !rawCustomer.toLowerCase().includes("cash customer") &&
    !rawCustomer.toLowerCase().includes("counter");

  const hasRemainingBalance = receipt.due_amount_paisa > 0;
  const hasCashPaid = receipt.paid_amount_paisa > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {/* Inline Print Styles for 0-margin compact thermal roll */}
      <style>{`
        @media print {
          @page {
            margin: 0mm !important;
            size: ${paperWidth === "80mm" ? "80mm auto" : "58mm auto"} !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 100% !important;
            height: auto !important;
          }
          body > *:not(#dogar-thermal-print-area) {
            display: none !important;
          }
          #dogar-thermal-print-area {
            display: block !important;
            visibility: visible !important;
            position: static !important;
            width: ${paperWidth === "80mm" ? "76mm" : "54mm"} !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 2mm 3mm !important;
            box-shadow: none !important;
            border: none !important;
            font-size: ${paperWidth === "80mm" ? "12px" : "10px"} !important;
            line-height: 1.3 !important;
            color: #000000 !important;
          }
          #dogar-thermal-print-area * {
            visibility: visible !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh] no-print">
        {/* Modal Top Control Bar */}
        <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-slate-800">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-bold">Commercial Sales Receipt</h2>
          </div>
          <div className="flex items-center space-x-3">
            {/* Paper Size Selector */}
            <div className="flex bg-slate-200 rounded-lg p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setPaperWidth("80mm")}
                className={`px-3 py-1 rounded-md transition ${
                  paperWidth === "80mm" ? "bg-white text-slate-900 shadow-sm font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth("58mm")}
                className={`px-3 py-1 rounded-md transition ${
                  paperWidth === "58mm" ? "bg-white text-slate-900 shadow-sm font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                58mm
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-500 hover:text-slate-800 p-1 rounded-lg hover:bg-slate-200 transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Receipt Preview Container */}
        <div className="p-6 overflow-y-auto flex-1 flex justify-center bg-slate-50">
          <div
            id="dogar-thermal-print-area"
            className={`bg-white text-slate-900 font-sans text-xs leading-normal p-4 rounded shadow-sm border border-slate-200 transition-all ${
              paperWidth === "80mm" ? "w-[330px]" : "w-[245px] text-[11px]"
            }`}
          >
            {/* Section 1 & 2: Permanent Header with Urdu */}
            <div className="text-center pb-2 border-b border-slate-300 space-y-0.5">
              <div className="text-base font-bold text-slate-900 font-serif" dir="rtl">
                ڈوگر ٹریڈرز
              </div>
              <div className="text-sm font-bold tracking-wider text-slate-900 uppercase">
                DOGAR TRADERS
              </div>
              <div className="text-[10px] text-slate-600 font-normal">
                Cold Drink & Beverage Distribution Agency
              </div>
              <div className="text-[10px] text-slate-500 font-normal">
                Rahim Yar Khan • Phone: +92 300 0000000
              </div>
            </div>

            {/* Bill Metadata: Date, Invoice No, Optional Retailer */}
            <div className="py-2 border-b border-slate-300 space-y-1 text-[11px] font-normal">
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice #:</span>
                <span className="font-semibold text-slate-900">{receipt.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Date:</span>
                <span className="text-slate-800">{new Date().toLocaleDateString("en-GB")} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {hasRetailer && (
                <div className="flex justify-between pt-0.5">
                  <span className="text-slate-600">Retailer:</span>
                  <span className="font-semibold text-slate-900 truncate max-w-[170px]">
                    {receipt.shop_name || receipt.customer_name}
                  </span>
                </div>
              )}
            </div>

            {/* Section 3: Clean Commercial Table (Product Name, Pack Size, Quantity, Rate, Total Amount) */}
            <div className="py-2 border-b border-slate-300">
              <div className="grid grid-cols-12 font-bold text-[10px] uppercase text-slate-700 border-b border-slate-200 pb-1 mb-1.5">
                <span className="col-span-5 text-left">Product</span>
                <span className="col-span-2 text-center">Pack</span>
                <span className="col-span-2 text-right">Rate</span>
                <span className="col-span-3 text-right">Amount</span>
              </div>

              <div className="space-y-1.5 font-normal">
                {receipt.items.map((item, idx) => {
                  const qtyPacks = item.pack_qty || 1;
                  return (
                    <div key={idx} className="grid grid-cols-12 text-[11px] items-center">
                      <div className="col-span-5 leading-tight pr-1">
                        <span className="font-medium text-slate-900 block truncate">
                          {String(item.product_name)}
                        </span>
                      </div>
                      <div className="col-span-2 text-center font-normal text-slate-700">
                        {qtyPacks}
                      </div>
                      <div className="col-span-2 text-right font-normal text-slate-700">
                        {Math.round(item.unit_price_paisa / 100)}
                      </div>
                      <div className="col-span-3 text-right font-medium text-slate-900">
                        {formatPkr(item.line_total_paisa)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Financial Summary: Accurate, No Duplicate Totals */}
            <div className="py-2 border-b border-slate-300 space-y-1 text-[11px]">
              {receipt.discount_paisa > 0 && (
                <div className="flex justify-between text-slate-600 font-normal">
                  <span>Discount:</span>
                  <span>-{formatPkr(receipt.discount_paisa)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm font-bold text-slate-950 pt-0.5">
                <span>Net Total:</span>
                <span>{formatPkr(receipt.net_total_paisa)}</span>
              </div>

              {/* Cash Paid: Shown when customer pays cash */}
              {hasCashPaid && (
                <div className="flex justify-between text-slate-800 font-normal pt-0.5">
                  <span>Cash Paid:</span>
                  <span className="font-semibold">{formatPkr(receipt.paid_amount_paisa)}</span>
                </div>
              )}

              {/* Remaining Balance: Shown when purchase is on credit */}
              {hasRemainingBalance && (
                <div className="flex justify-between text-slate-900 font-normal pt-0.5">
                  <span>Remaining Balance:</span>
                  <span className="font-bold text-slate-950">{formatPkr(receipt.due_amount_paisa)}</span>
                </div>
              )}
            </div>

            {/* Clean, Professional Footer */}
            <div className="text-center pt-2 text-[10px] text-slate-500 font-normal space-y-0.5">
              <div dir="rtl" className="font-serif text-slate-700">
                شکریہ! برائے مہربانی اپنا سامان چیک کر کے لیں۔
              </div>
              <div>Software by Dogar Traders POS</div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Action Buttons */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center space-x-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow transition"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
}
