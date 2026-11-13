// src/components/reports/ReportSummaryRibbon.tsx
import { ReportSummaryKpi } from "../../types/reports";
import { formatPkr } from "../../types/domain";

interface ReportSummaryRibbonProps {
  kpis: ReportSummaryKpi[];
}

export function ReportSummaryRibbon({ kpis }: ReportSummaryRibbonProps) {
  if (!kpis || kpis.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {kpis.map((kpi, idx) => {
        let displayVal = String(kpi.value);
        if (kpi.format === "currency" && typeof kpi.value === "number") {
          displayVal = formatPkr(kpi.value);
        } else if (kpi.format === "integer" && typeof kpi.value === "number") {
          displayVal = kpi.value.toLocaleString();
        } else if (kpi.format === "percentage" && typeof kpi.value === "number") {
          displayVal = `${kpi.value.toFixed(1)}%`;
        }

        return (
          <div
            key={idx}
            className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm flex flex-col justify-between"
          >
            <span className="text-slate-400 text-xs font-medium block">{kpi.label}</span>
            <span className="text-xl font-mono font-bold text-white mt-1">
              {displayVal}
            </span>
          </div>
        );
      })}
    </div>
  );
}
