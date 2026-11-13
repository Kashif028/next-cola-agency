import React, { useState, useEffect } from "react";
import { dbService } from "../../services/dbService";
import { AuditLogEntryDto, AuditLogFilterDto } from "../../types/ipc";
import { exportService } from "../../services/exportService";
import {
  ShieldCheck,
  Search,
  Filter,
  Download,
  Eye,
  X,
  FileCode,
  Calendar,
  User,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

export const AuditTrailViewerTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntryDto[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Diff Modal State
  const [selectedLog, setSelectedLog] = useState<AuditLogEntryDto | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const filter: AuditLogFilterDto = {};
      if (actionFilter) filter.action = actionFilter;
      if (fromDate) filter.from_date = fromDate;
      if (toDate) filter.to_date = toDate;
      filter.limit = 100;

      const res = await dbService.listAuditLogs(filter);
      setLogs(res.logs || []);
      setTotalCount(res.total_count || 0);
    } catch (err: unknown) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, fromDate, toDate]);

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.username.toLowerCase().includes(q) ||
      log.entity_type.toLowerCase().includes(q) ||
      (log.entity_id && log.entity_id.toLowerCase().includes(q)) ||
      (log.reason && log.reason.toLowerCase().includes(q))
    );
  });

  const handleExportCsv = () => {
    if (!filteredLogs.length) return;
    const exportData = filteredLogs.map((l) => ({
      ID: l.id,
      Timestamp: l.timestamp,
      Username: l.username,
      Action: l.action,
      EntityType: l.entity_type,
      EntityID: l.entity_id,
      Reason: l.reason || "",
      IPAddress: l.ip_address || "",
      MachineName: l.machine_name || "",
      OldValues: l.old_values_json || "",
      NewValues: l.new_values_json || "",
    }));

    exportService.exportToCsv(exportData, `audit_trail_${new Date().toISOString().slice(0, 10)}`);
  };

  const renderJsonPretty = (jsonStr?: string | null) => {
    if (!jsonStr) {
      return <span className="text-slate-400 italic">None / Initial Creation</span>;
    }
    try {
      const parsed = JSON.parse(jsonStr);
      return <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap">{JSON.stringify(parsed, null, 2)}</pre>;
    } catch {
      return <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap">{jsonStr}</pre>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Tamper-Proof Audit Trail</h2>
              <p className="text-xs text-slate-500">
                Append-only forensic audit trail recording supervisor overrides, adjustments, and system events.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={filteredLogs.length === 0}
              className="px-3 py-2 text-xs font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="px-3 py-2 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search user, action, entity..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <select
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="SUPERVISOR_OVERRIDE">Supervisor Overrides</option>
              <option value="CREATE_INVOICE">Invoices</option>
              <option value="UPDATE_SETTINGS">Settings Changes</option>
              <option value="HOT_BACKUP_TRIGGERED">Database Backups</option>
              <option value="VAN_SETTLEMENT">Van Settlements</option>
              <option value="STOCK_ADJUSTMENT">Stock Adjustments</option>
            </select>
          </div>

          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="date"
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="date"
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs font-semibold text-slate-600">
          <span>Showing {filteredLogs.length} of {totalCount} Recorded Security Logs</span>
          <span>Append-Only Forensic Store</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200">
                <th className="py-2.5 px-4">Log ID</th>
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Operator</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Entity</th>
                <th className="py-2.5 px-4">Context / Reason</th>
                <th className="py-2.5 px-4 text-center">Audit Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No audit records found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isSupervisor = log.action.includes("SUPERVISOR") || log.action.includes("OVERRIDE");
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-700">#{log.id}</td>
                      <td className="py-2.5 px-4 text-slate-500 font-mono whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString("en-PK")}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{log.username}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isSupervisor
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : "bg-slate-200 text-slate-800"
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        {log.entity_type} {log.entity_id ? `(${log.entity_id})` : ""}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate" title={log.reason || ""}>
                        {log.reason || "-"}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded flex items-center gap-1 mx-auto transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect Diff</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side-by-Side Change Diff Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">
                  Audit Snapshot Diff: #{selectedLog.id} - {selectedLog.action}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block font-bold">OPERATOR</span>
                  <span className="font-semibold text-slate-800">{selectedLog.username}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold">ENTITY</span>
                  <span className="font-semibold text-slate-800">{selectedLog.entity_type}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold">MACHINE</span>
                  <span className="font-semibold text-slate-800">{selectedLog.machine_name || "POS-01"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold">IP ADDRESS</span>
                  <span className="font-semibold text-slate-800">{selectedLog.ip_address || "127.0.0.1"}</span>
                </div>
              </div>

              {selectedLog.reason && (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg font-medium">
                  <strong>Stated Justification / Context: </strong>
                  {selectedLog.reason}
                </div>
              )}

              {/* Side-by-side JSON comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-rose-50/50 border border-rose-200 rounded-lg p-4">
                  <div className="flex items-center gap-1.5 text-rose-800 font-bold text-xs mb-2">
                    <span>Pre-Change State (Old Values)</span>
                  </div>
                  <div className="bg-white p-3 rounded border border-rose-100 max-h-60 overflow-y-auto">
                    {renderJsonPretty(selectedLog.old_values_json)}
                  </div>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs mb-2">
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Post-Change State (New Values)</span>
                  </div>
                  <div className="bg-white p-3 rounded border border-emerald-100 max-h-60 overflow-y-auto">
                    {renderJsonPretty(selectedLog.new_values_json)}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
