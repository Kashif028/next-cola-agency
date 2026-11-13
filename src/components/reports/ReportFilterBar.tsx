// src/components/reports/ReportFilterBar.tsx
import { useReportStore } from "../../store/useReportStore";
import { exportService } from "../../services/exportService";
import { ReportMetadata } from "../../types/reports";
import {
  Calendar,
  Download,
  Printer,
  RefreshCw,
} from "lucide-react";


interface ReportFilterBarProps {
  report: ReportMetadata;
}

export function ReportFilterBar({ report }: ReportFilterBarProps) {
  const { filterParams, setFilterParams, loadActiveReportData, isLoading, reportData } = useReportStore();

  const handleCsvExport = () => {
    if (!reportData || reportData.length === 0) return;
    const headers = report.columns.map((c) => c.label);
    const rows = reportData.map((row) =>
      report.columns.map((col) => {
        const val = row[col.key];
        if (col.format === "currency" && typeof val === "number") {
          return (val / 100).toFixed(2);
        }
        return val !== undefined && val !== null ? String(val) : "";
      })
    );
    exportService.downloadCsv(report.id, headers, rows);
  };

  const handlePrint = () => {
    exportService.printReport();
  };

  return (
    <div className="bg-slate-800 border border-slate-700 px-5 py-3.5 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
      {/* Dynamic Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date presets */}
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-cyan-400" />
          <span className="text-slate-400 font-semibold">Date Range:</span>
          <input
            type="date"
            value={filterParams.startDate || "2026-11-01"}
            onChange={(e) => setFilterParams({ startDate: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono outline-none"
          />
          <span className="text-slate-500 font-mono">to</span>
          <input
            type="date"
            value={filterParams.endDate || new Date().toISOString().slice(0, 10)}
            onChange={(e) => setFilterParams({ endDate: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono outline-none"
          />
        </div>

        {/* Route Filter if supported */}
        {report.filterFields?.includes("route") && (
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Route:</span>
            <select
              value={filterParams.routeId || ""}
              onChange={(e) =>
                setFilterParams({ routeId: e.target.value ? Number(e.target.value) : undefined })
              }
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white outline-none"
            >
              <option value="">All Routes</option>
              <option value={1}>R-01: City Center</option>
              <option value={2}>R-02: Khanpur Road</option>
              <option value={3}>R-03: Sadiqabad Highway</option>
            </select>
          </div>
        )}

        {/* Customer Filter if supported */}
        {report.filterFields?.includes("customer") && (
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Retailer:</span>
            <select
              value={filterParams.customerId || 1}
              onChange={(e) => setFilterParams({ customerId: Number(e.target.value) })}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white outline-none max-w-[180px] truncate"
            >
              <option value={1}>Bismillah Kiryana Store</option>
              <option value={2}>Madina Super Store</option>
              <option value={3}>Al-Rehman Cold Corner</option>
            </select>
          </div>
        )}

        {/* Refresh button */}
        <button
          onClick={() => loadActiveReportData()}
          disabled={isLoading}
          className="flex items-center space-x-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-200 rounded-lg font-semibold border border-slate-600 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Export Actions */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleCsvExport}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-200 hover:text-white rounded-lg border border-slate-600 font-bold transition shadow-sm"
          title="Download CSV for Microsoft Excel"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" />
          <span>Export CSV</span>
        </button>

        <button
          onClick={handlePrint}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white rounded-lg font-bold transition shadow-sm"
          title="Print Report or Save as PDF"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print / PDF</span>
        </button>
      </div>
    </div>
  );
}
