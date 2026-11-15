// src/components/logistics/GatePassPrintModal.tsx
import { useState } from "react";
import { useLogisticsStore } from "../../store/useLogisticsStore";
import { formatPkr } from "../../types/domain";
import { X, Printer, CheckCircle } from "lucide-react";

export function GatePassPrintModal() {
  const { isGatePassModalOpen, closeGatePassModal, selectedSheetDetail } = useLogisticsStore();
  const [printMode, setPrintMode] = useState<"gate_pass" | "clearance">("gate_pass");

  if (!isGatePassModalOpen || !selectedSheetDetail) return null;

  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="bg-slate-800 px-6 py-3 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-white">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold">Print Logistics Document</h2>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs font-semibold">
              <button
                onClick={() => setPrintMode("gate_pass")}
                className={`px-3 py-1 rounded-md transition ${
                  printMode === "gate_pass" ? "bg-cyan-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                Gate Pass
              </button>
              <button
                onClick={() => setPrintMode("clearance")}
                className={`px-3 py-1 rounded-md transition ${
                  printMode === "clearance" ? "bg-cyan-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                Clearance Voucher
              </button>
            </div>
            <button
              onClick={closeGatePassModal}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Content Area */}
        <div className="p-6 overflow-y-auto flex-1 flex justify-center bg-slate-950/60">
          <div className="bg-white text-slate-950 font-mono text-xs leading-relaxed p-6 rounded-lg shadow-xl border border-slate-200 w-[380px]">
            {/* Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-400">
              <div className="font-bold text-sm tracking-wider uppercase">DOGAR TRADERS — BEVERAGES DISTRIBUTION</div>
              <div className="text-[11px] font-sans font-bold text-slate-700">
                لوگر ٹریڈرز — ڈسٹری بیوشن لاجسٹکس ایجنسی
              </div>
              <div className="text-[10px] text-slate-600">
                Main Bypass, Rahim Yar Khan | Ph: +92 300 1234567
              </div>
              <div className="font-bold text-xs pt-1 uppercase tracking-wider text-slate-800">
                {printMode === "gate_pass"
                  ? "MORNING DISPATCH GATE PASS (گیٹ پاس)"
                  : "VAN SETTLEMENT CLEARANCE (ڈرائیور کلیرنس واؤچر)"}
              </div>
            </div>

            {/* Manifest Metadata */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Sheet #:</span>
                <span className="font-bold">{selectedSheetDetail.sheet_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Route:</span>
                <span className="font-bold">{selectedSheetDetail.route_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Vehicle:</span>
                <span className="font-bold">{selectedSheetDetail.vehicle_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Driver:</span>
                <span>{selectedSheetDetail.driver_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{selectedSheetDetail.sheet_date}</span>
              </div>
              <div className="flex justify-between">
                <span>Odometer:</span>
                <span>
                  {selectedSheetDetail.opening_km} KM
                  {printMode === "clearance" && selectedSheetDetail.closing_km
                    ? ` $\\to$ ${selectedSheetDetail.closing_km} KM`
                    : ""}
                </span>
              </div>
            </div>

            {/* Itemized Table */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-2">
              <div className="flex justify-between font-bold text-[10px] border-b border-slate-300 pb-1">
                <span>BEVERAGE PRODUCT</span>
                <span>LOADED</span>
                <span>{printMode === "gate_pass" ? "VALUE (₨)" : "SOLD / RET"}</span>
              </div>
              {selectedSheetDetail.items.map((it, idx) => (
                <div key={idx} className="flex justify-between text-[11px]">
                  <div className="truncate max-w-[150px]">
                    <span className="block font-medium truncate">{it.product_name}</span>
                    <span className="text-[10px] text-slate-500">{it.product_sku}</span>
                  </div>
                  <div className="text-right">
                    {it.loaded_packs} Pk ({it.total_loaded_base} btl)
                  </div>
                  <div className="text-right font-semibold">
                    {printMode === "gate_pass"
                      ? formatPkr(it.line_retail_paisa)
                      : `${it.sold_base} / ${it.total_returned_base}`}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals & Crate Summary */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Total Wholesale Value:</span>
                <span className="font-bold">{formatPkr(selectedSheetDetail.total_load_retail_paisa)}</span>
              </div>
              <div className="flex justify-between">
                <span>Empty Crates Loaded:</span>
                <span className="font-bold">{selectedSheetDetail.empty_crates_loaded} Crates</span>
              </div>
              {printMode === "clearance" && (
                <>
                  <div className="flex justify-between text-emerald-800">
                    <span>Cash Handover Counted:</span>
                    <span className="font-bold">{formatPkr(selectedSheetDetail.actual_cash_paisa)}</span>
                  </div>
                  <div className="flex justify-between text-slate-800">
                    <span>Empty Crates Restocked:</span>
                    <span className="font-bold">{selectedSheetDetail.empty_crates_returned} Crates</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 border-t border-slate-300">
                    <span>Shortage Status:</span>
                    <span className="text-emerald-700">BALANCED & APPROVED</span>
                  </div>
                </>
              )}
            </div>

            {/* Signature Blocks */}
            <div className="pt-6 grid grid-cols-2 gap-6 text-[10px] text-center">
              <div className="border-t border-slate-400 pt-1">
                <span>Warehouse Dispatcher</span>
              </div>
              <div className="border-t border-slate-400 pt-1">
                <span>Driver Signature</span>
              </div>
            </div>

            {printMode === "clearance" && (
              <div className="pt-6 grid grid-cols-2 gap-6 text-[10px] text-center">
                <div className="border-t border-slate-400 pt-1">
                  <span>Cashier Handover</span>
                </div>
                <div className="border-t border-slate-400 pt-1">
                  <span>Supervisor Approval</span>
                </div>
              </div>
            )}

            <div className="text-center pt-4 text-[9px] text-slate-500 font-sans">
              Dogar Traders ERP • Tamper-resistant delivery manifest
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-800 px-6 py-3 border-t border-slate-700 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Formatted for 80mm thermal roll & A4 vouchers
          </div>
          <div className="flex space-x-3">
            <button
              onClick={closeGatePassModal}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition"
            >
              Done (Esc)
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center space-x-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow-lg transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print Voucher</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
