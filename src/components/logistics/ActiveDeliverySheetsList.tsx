// src/components/logistics/ActiveDeliverySheetsList.tsx
import { useState } from "react";
import { useLogisticsStore } from "../../store/useLogisticsStore";
import { formatPkr } from "../../types/domain";
import {
  Truck,
  Printer,
  FileCheck,
  Search,
  Edit2,
} from "lucide-react";
import { EditDeliverySheetModal } from "./EditDeliverySheetModal";
import { LoadingSheetSummaryDto, DailyDispatchRecord } from "../../types/logistics";


export interface ActiveDeliverySheetsListProps {
  initialSheets?: LoadingSheetSummaryDto[];
}

export const ActiveDeliverySheetsList: React.FC<ActiveDeliverySheetsListProps> = ({
  initialSheets,
} = {}) => {
  const store = useLogisticsStore();
  const loadingSheets = initialSheets || store.loadingSheets;
  const {
    openSettlementModal,
    openGatePassModal,
    issueManifestDispatch,
    fetchLoadingSheets,
  } = store;

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [editingSheet, setEditingSheet] = useState<DailyDispatchRecord | LoadingSheetSummaryDto | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const filteredSheets = loadingSheets.filter((s) => {
    const matchesStatus =
      statusFilter === "ALL" ||
      s.status === statusFilter ||
      (statusFilter === "ISSUED" && (s.status === "ISSUED" || s.status === "DISPATCHED"));
    const sheetNum = (s.sheet_number || (s as any).sheetNumber || "").toLowerCase();
    const routeName = (s.route_name || (s as any).routeName || "").toLowerCase();
    const driverName = (s.driver_name || (s as any).salesmanName || (s as any).driverName || "").toLowerCase();
    const vehicleNum = (s.vehicle_number || (s as any).vehicleNumber || "").toLowerCase();
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !q ||
      sheetNum.includes(q) ||
      routeName.includes(q) ||
      driverName.includes(q) ||
      vehicleNum.includes(q);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Truck className="w-5 h-5 text-cyan-400" />
          <h3 className="font-bold text-white text-sm">Delivery Manifests & Active Fleet Trips</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">
            {filteredSheets.length} Sheets
          </span>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          {/* Status Chips */}
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5">
            {["ALL", "ISSUED", "DRAFT", "SETTLED"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-md font-semibold transition ${
                  statusFilter === st
                    ? "bg-cyan-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {st === "ISSUED" ? "On Route" : st}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search sheet, route, van..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder-slate-500 outline-none focus:border-cyan-500 w-44"
            />
          </div>
        </div>
      </div>

      {/* Sheets Table */}
      <div className="overflow-x-auto border border-slate-700/80 rounded-xl">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
            <tr>
              <th className="p-3">Sheet #</th>
              <th className="p-3 font-sans">Route & Beat</th>
              <th className="p-3">Vehicle</th>
              <th className="p-3 font-sans">Driver</th>
              <th className="p-3 text-right">Loaded Volume</th>
              <th className="p-3 text-right">Wholesale Value</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60 bg-slate-850 bg-slate-900/40">
            {filteredSheets.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400 font-sans">
                  No delivery sheets match the current filter.
                </td>
              </tr>
            ) : (
              filteredSheets.map((sheet) => {
                const isIssued = sheet.status === "ISSUED" || sheet.status === "DISPATCHED";
                const isDraft = sheet.status === "DRAFT";
                const isSettled = sheet.status === "SETTLED" || sheet.status === "COMPLETED";

                const sheetNumber = sheet.sheet_number || (sheet as any).sheetNumber || `LOAD-${sheet.id}`;
                const routeName = sheet.route_name || (sheet as any).routeName || "Route";
                const vehicleNumber = sheet.vehicle_number || (sheet as any).vehicleNumber || "VAN";
                const driverName = sheet.driver_name || (sheet as any).salesmanName || "Driver";
                const loadedVolume = sheet.total_loaded_base ?? (sheet as any).totalLoadedBase ?? 0;
                const emptyCrates = sheet.empty_crates_loaded ?? (sheet as any).emptyCratesLoaded ?? 0;
                const retailPaisa = sheet.total_load_retail_paisa ?? (sheet as any).totalSalesRevenuePaisa ?? 0;

                return (
                  <tr key={sheet.id} className="hover:bg-slate-800/60 transition">
                    <td className="p-3 font-bold text-cyan-300">{sheetNumber}</td>
                    <td className="p-3 font-sans font-medium text-slate-200">{routeName}</td>
                    <td className="p-3 text-slate-300 font-bold">{vehicleNumber}</td>
                    <td className="p-3 font-sans text-slate-300">{driverName}</td>
                    <td className="p-3 text-right font-bold text-slate-200">
                      {loadedVolume} btls ({emptyCrates} crates)
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-400">
                      {formatPkr(retailPaisa)}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isIssued
                            ? "bg-cyan-950 text-cyan-400 border border-cyan-500/40"
                            : isDraft
                            ? "bg-amber-950 text-amber-400 border border-amber-500/40"
                            : "bg-emerald-950 text-emerald-400 border border-emerald-500/40"
                        }`}
                      >
                        {isIssued && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
                        <span>{isIssued ? "ON ROUTE" : sheet.status}</span>
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        {/* Persistent Edit Record Button across ALL statuses */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSheet(sheet);
                            setIsEditModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-bold shadow flex items-center space-x-1 transition active:scale-95"
                          title="Edit Record (ایڈٹ کریں)"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit Record</span>
                          <span className="text-[10px] font-normal opacity-90" dir="rtl">(ایڈٹ کریں)</span>
                        </button>

                        {isDraft && (
                          <button
                            onClick={async () => {
                              await issueManifestDispatch({ sheet_id: sheet.id });
                              fetchLoadingSheets();
                            }}
                            className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-bold shadow"
                          >
                            Dispatch Now
                          </button>
                        )}

                        {isIssued && (
                          <>
                            <button
                              onClick={() => openSettlementModal(sheet.id)}
                              className="px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded text-[11px] font-bold shadow flex items-center space-x-1"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                              <span>Settle Van</span>
                            </button>
                            <button
                              onClick={() => openGatePassModal(sheet.id)}
                              className="p-1 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded"
                              title="Print Gate Pass"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {isSettled && (
                          <button
                            onClick={() => openGatePassModal(sheet.id)}
                            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] font-medium flex items-center space-x-1"
                          >
                            <Printer className="w-3 h-3 text-emerald-400" />
                            <span>Voucher</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Persistent Multi-Edit Modal */}
      {isEditModalOpen && (
        <EditDeliverySheetModal
          isOpen={isEditModalOpen}
          sheet={editingSheet}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingSheet(null);
          }}
          onSuccess={() => {
            fetchLoadingSheets();
          }}
        />
      )}
    </div>
  );
}
