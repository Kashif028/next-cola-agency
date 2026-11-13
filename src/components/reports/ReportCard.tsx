// src/components/reports/ReportCard.tsx
import { ReportMetadata } from "../../types/reports";
import {
  FileText,
  ArrowRight,
  DollarSign,
  BookOpen,
  ShieldAlert,
  Coins,
  Package,
  Layers,
  Truck,
  CheckSquare,
} from "lucide-react";

interface ReportCardProps {
  report: ReportMetadata;
  onOpen: (id: string) => void;
}

export function ReportCard({ report, onOpen }: ReportCardProps) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "sales":
        return <DollarSign className="w-4 h-4 text-emerald-400" />;
      case "ledger":
        return <BookOpen className="w-4 h-4 text-cyan-400" />;
      case "credit":
        return <ShieldAlert className="w-4 h-4 text-amber-400" />;
      case "financial":
        return <Coins className="w-4 h-4 text-purple-400" />;
      case "inventory":
        return <Package className="w-4 h-4 text-blue-400" />;
      case "empties":
        return <Layers className="w-4 h-4 text-orange-400" />;
      case "logistics":
        return <Truck className="w-4 h-4 text-teal-400" />;
      case "audit":
        return <CheckSquare className="w-4 h-4 text-rose-400" />;
      default:
        return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case "sales":
        return "bg-emerald-950/80 text-emerald-400 border-emerald-500/30";
      case "ledger":
        return "bg-cyan-950/80 text-cyan-400 border-cyan-500/30";
      case "credit":
        return "bg-amber-950/80 text-amber-400 border-amber-500/30";
      case "financial":
        return "bg-purple-950/80 text-purple-400 border-purple-500/30";
      case "inventory":
        return "bg-blue-950/80 text-blue-400 border-blue-500/30";
      case "empties":
        return "bg-orange-950/80 text-orange-400 border-orange-500/30";
      case "logistics":
        return "bg-teal-950/80 text-teal-400 border-teal-500/30";
      case "audit":
        return "bg-rose-950/80 text-rose-400 border-rose-500/30";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  return (
    <div
      onClick={() => onOpen(report.id)}
      className="bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-cyan-500/60 p-4 rounded-xl shadow-sm transition flex flex-col justify-between group cursor-pointer"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-bold text-cyan-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {report.id}
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center space-x-1 ${getCategoryBadgeClass(
              report.category
            )}`}
          >
            {getCategoryIcon(report.category)}
            <span>{report.categoryName}</span>
          </span>
        </div>

        <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition line-clamp-1">
          {report.name}
        </h3>

        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
          {report.description}
        </p>
      </div>

      <div className="pt-3 mt-3 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400 group-hover:text-cyan-400 transition">
        <span className="font-mono text-[11px]">{report.columns.length} Data Columns</span>
        <span className="flex items-center space-x-1 font-semibold">
          <span>View Report</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
        </span>
      </div>
    </div>
  );
}
