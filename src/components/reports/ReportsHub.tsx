// src/components/reports/ReportsHub.tsx
import { useState } from "react";
import { useReportStore } from "../../store/useReportStore";
import { ALL_REPORTS } from "./definitions/reportCatalog";
import { ReportCard } from "./ReportCard";
import { ReportViewer } from "./ReportViewer";
import {
  FileText,
  Search,
  DollarSign,
  BookOpen,
  ShieldAlert,
  Coins,
  Package,
  Layers,
  Truck,
  CheckSquare,
} from "lucide-react";
import { ReportCategory } from "../../types/reports";

export function ReportsHub() {
  const { activeReportId, setActiveReportId, activeCategory, setActiveCategory } = useReportStore();
  const [searchTerm, setSearchTerm] = useState("");

  if (activeReportId) {
    return <ReportViewer />;
  }

  const categories: { key: ReportCategory | "all"; label: string; count: number; icon: JSX.Element }[] = [
    { key: "all", label: "All Reports", count: 30, icon: <FileText className="w-4 h-4" /> },
    { key: "sales", label: "Sales & Revenue", count: 6, icon: <DollarSign className="w-4 h-4 text-emerald-400" /> },
    { key: "ledger", label: "Financial Ledgers", count: 4, icon: <BookOpen className="w-4 h-4 text-cyan-400" /> },
    { key: "credit", label: "Credit & Risk", count: 3, icon: <ShieldAlert className="w-4 h-4 text-amber-400" /> },
    { key: "financial", label: "Cash & Banking", count: 5, icon: <Coins className="w-4 h-4 text-purple-400" /> },
    { key: "inventory", label: "Inventory & Units", count: 4, icon: <Package className="w-4 h-4 text-blue-400" /> },
    { key: "empties", label: "Empties & Crates", count: 4, icon: <Layers className="w-4 h-4 text-orange-400" /> },
    { key: "logistics", label: "Logistics & Fleet", count: 2, icon: <Truck className="w-4 h-4 text-teal-400" /> },
    { key: "audit", label: "Audits & Closing", count: 2, icon: <CheckSquare className="w-4 h-4 text-rose-400" /> },
  ];

  const filteredReports = ALL_REPORTS.filter((r) => {
    const matchesCategory = activeCategory === "all" || r.category === activeCategory;
    const matchesSearch =
      r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.categoryName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 border border-slate-700 px-5 py-4 rounded-xl shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-cyan-600/20 text-cyan-400 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span>30 Specialized Distribution Reports Suite</span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-500/40 rounded-full font-bold">
                100% OFFLINE
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Double-entry ledgers, packaging conversions, aging buckets, cash reconciliation & CSV export
            </p>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="relative w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search report name, ID (REP-01), keyword..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-2 border-b border-slate-800 text-xs">
        {categories.map((c) => (
          <button
            key={c.key}
            onClick={() => setActiveCategory(c.key)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold shrink-0 transition ${
              activeCategory === c.key
                ? "bg-cyan-600 text-white shadow"
                : "bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-700/60"
            }`}
          >
            {c.icon}
            <span>{c.label}</span>
            <span className="text-[10px] opacity-75 font-mono">({c.count})</span>
          </button>
        ))}
      </div>

      {/* Reports Grid (30 reports) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredReports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            onOpen={(id) => setActiveReportId(id)}
          />
        ))}
      </div>

      {filteredReports.length === 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center text-slate-400 text-xs">
          No reports found matching &quot;{searchTerm}&quot; in the selected category.
        </div>
      )}
    </div>
  );
}
