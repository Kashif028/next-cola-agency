// src/components/reports/ReportDataTable.tsx
import { useState } from "react";
import { ReportColumn } from "../../types/reports";
import { formatPkr } from "../../types/domain";
import { ArrowUpDown, AlertCircle } from "lucide-react";

interface ReportDataTableProps {
  columns: ReportColumn[];
  data: Record<string, unknown>[];
  isLoading: boolean;
  error?: string | null;
}

export function ReportDataTable({ columns, data, isLoading, error }: ReportDataTableProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  if (isLoading) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs">Computing report metrics and loading records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-950/60 border border-red-500/50 rounded-xl p-6 text-red-200 text-xs flex items-center space-x-3">
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
        <span>Report Query Error: {error}</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center text-slate-400 text-xs">
        No records found matching the selected filter criteria.
      </div>
    );
  }

  const sortedData = [...data].sort((a, b) => {
    if (!sortCol) return 0;
    const valA = a[sortCol];
    const valB = b[sortCol];
    if (typeof valA === "number" && typeof valB === "number") {
      return sortAsc ? valA - valB : valB - valA;
    }
    return sortAsc
      ? String(valA ?? "").localeCompare(String(valB ?? ""))
      : String(valB ?? "").localeCompare(String(valA ?? ""));
  });

  const handleSort = (key: string) => {
    if (sortCol === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(key);
      setSortAsc(true);
    }
  };

  // Compute bottom row totals for numeric columns
  const numericTotals: Record<string, number> = {};
  columns.forEach((col) => {
    if (col.format === "currency" || col.format === "integer") {
      let sum = 0;
      let hasNumbers = false;
      data.forEach((row) => {
        const v = row[col.key];
        if (typeof v === "number") {
          sum += v;
          hasNumbers = true;
        }
      });
      if (hasNumbers) {
        numericTotals[col.key] = sum;
      }
    }
  });

  const renderCellValue = (col: ReportColumn, val: unknown) => {
    if (val === undefined || val === null) return "—";

    if (col.format === "currency" && typeof val === "number") {
      return formatPkr(val);
    }
    if (col.format === "integer" && typeof val === "number") {
      return val.toLocaleString();
    }
    if (col.format === "percentage" && typeof val === "number") {
      return `${val.toFixed(1)}%`;
    }
    if (col.format === "badge" && typeof val === "string") {
      const isPositive = ["SALABLE", "PAID", "ACTIVE", "BALANCED", "FAST", "SAFE", "LOW"].includes(val.toUpperCase());
      const isNegative = ["DAMAGED", "BLOCKED", "LOCKED", "CRITICAL", "DEFAULT", "HIGH", "DEAD"].includes(val.toUpperCase());
      return (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            isPositive
              ? "bg-emerald-950 text-emerald-400 border border-emerald-500/40"
              : isNegative
              ? "bg-red-950 text-red-400 border border-red-500/40"
              : "bg-slate-700 text-slate-200"
          }`}
        >
          {val}
        </span>
      );
    }

    return String(val);
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-900 text-slate-400 border-b border-slate-700">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`p-3 font-semibold select-none cursor-pointer hover:text-white transition ${
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                      ? "text-center"
                      : "text-left"
                  }`}
                >
                  <span className="inline-flex items-center space-x-1">
                    <span>{col.label}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60 bg-slate-850 bg-slate-900/40">
            {sortedData.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-slate-800/60 transition">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`p-3 ${
                      col.align === "right"
                        ? "text-right font-medium"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left text-slate-200"
                    }`}
                  >
                    {renderCellValue(col, row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          {/* Bottom Totals Row if totals exist */}
          {Object.keys(numericTotals).length > 0 && (
            <tfoot className="bg-slate-900/90 font-bold text-white border-t-2 border-slate-700">
              <tr>
                {columns.map((col, idx) => {
                  if (idx === 0) {
                    return (
                      <td key={col.key} className="p-3 text-cyan-400 font-sans uppercase text-[11px]">
                        Grand Total:
                      </td>
                    );
                  }
                  if (numericTotals[col.key] !== undefined) {
                    const totalVal = numericTotals[col.key];
                    return (
                      <td
                        key={col.key}
                        className={`p-3 font-mono ${col.align === "right" ? "text-right" : "text-left"}`}
                      >
                        {col.format === "currency" ? formatPkr(totalVal) : totalVal.toLocaleString()}
                      </td>
                    );
                  }
                  return <td key={col.key} className="p-3" />;
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
