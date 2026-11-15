// src/components/reports/ReportViewer.tsx
import { useReportStore } from "../../store/useReportStore";
import { ReportFilterBar } from "./ReportFilterBar";
import { ReportSummaryRibbon } from "./ReportSummaryRibbon";
import { ReportDataTable } from "./ReportDataTable";
import { ArrowLeft } from "lucide-react";




export function ReportViewer() {
  const { activeReport, setActiveReportId, reportData, summaryKpis, isLoading, error } = useReportStore();

  if (!activeReport) return null;

  return (
    <div className="space-y-5">
      {/* Top Navigation & Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 border border-slate-700 px-5 py-3.5 rounded-xl shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setActiveReportId(null)}
            className="flex items-center space-x-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-200 rounded-lg text-xs font-semibold transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Reports Hub</span>
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold text-cyan-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                {activeReport.id}
              </span>
              <h2 className="text-base font-bold text-white">{activeReport.name}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{activeReport.description}</p>
          </div>
        </div>
      </div>

      {/* KPI Summary Ribbon */}
      <ReportSummaryRibbon kpis={summaryKpis} />

      {/* Dynamic Filter & Export Toolbar */}
      <ReportFilterBar report={activeReport} />

      {/* Data Table */}
      <ReportDataTable
        columns={activeReport.columns}
        data={reportData}
        isLoading={isLoading}
        error={error}
      />

      {/* Hidden container for Clean Print Output */}
      <div id="report-print-container" className="hidden print:block font-sans text-xs text-black p-4">
        <div className="text-center pb-3 border-b border-black mb-4 space-y-1">
          <h1 className="text-lg font-bold">DOGAR TRADERS — BEVERAGES DISTRIBUTION AGENCY</h1>
          <p className="text-xs">Nextco Beverage Depot, Main Bypass, Rahim Yar Khan | Ph: +92 300 1234567</p>
          <h2 className="text-sm font-bold pt-1 uppercase">
            {activeReport.id}: {activeReport.name}
          </h2>
          <p className="text-[10px] text-gray-600">Printed: {new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
