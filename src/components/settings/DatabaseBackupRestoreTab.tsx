import React, { useState, useEffect } from "react";
import { dbService } from "../../services/dbService";
import { DbHealthReport, BackupResult, RestoreResult } from "../../types/ipc";
import {
  Database,
  RefreshCw,
  HardDrive,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Download,
  Upload,
  Cpu,
  Layers,
} from "lucide-react";

export const DatabaseBackupRestoreTab: React.FC = () => {
  const [health, setHealth] = useState<DbHealthReport | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  // Backup State
  const [customFilename, setCustomFilename] = useState("");
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Restore State
  const [restoreFilePath, setRestoreFilePath] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      setLoadingHealth(true);
      const res = await dbService.checkDbHealth();
      setHealth(res);
    } catch (err: unknown) {
      console.error("Failed to load db health:", err);
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleTriggerBackup = async () => {
    try {
      setBackingUp(true);
      setBackupError(null);
      setBackupResult(null);
      const res = await dbService.triggerHotBackup({
        custom_filename: customFilename.trim() || undefined,
        notes: "Manual hot backup from Settings Cockpit",
      });
      setBackupResult(res);
      // Refresh health
      fetchHealth();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBackupError(msg);
    } finally {
      setBackingUp(false);
    }
  };

  const handleTriggerRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreFilePath.trim()) {
      setRestoreError("Please provide the full absolute path of the backup file to restore.");
      return;
    }
    if (!adminPin.trim()) {
      setRestoreError("Administrator PIN code is strictly required.");
      return;
    }

    try {
      setRestoring(true);
      setRestoreError(null);
      setRestoreResult(null);
      const res = await dbService.triggerRestore({
        backup_file_path: restoreFilePath.trim(),
        admin_pin: adminPin.trim(),
      });
      setRestoreResult(res);
      setAdminPin("");
      fetchHealth();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRestoreError(msg);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Engine Health Status Ribbon */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">SQLite Embedded Engine Health</h2>
              <p className="text-xs text-slate-500">Live telemetry of WAL mode, foreign key enforcement, and connection pools.</p>
            </div>
          </div>
          <button
            onClick={fetchHealth}
            disabled={loadingHealth}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? "animate-spin" : ""}`} />
            <span>Refresh Diagnostics</span>
          </button>
        </div>

        {health ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Engine State</span>
              <div className="flex items-center gap-1.5 mt-1 font-bold text-sm text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                <span>{health.status}</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Journal Mode</span>
              <span className="font-mono font-bold text-sm text-slate-800 uppercase mt-1 block">
                {health.journal_mode}
              </span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Foreign Keys</span>
              <span className="font-semibold text-sm text-slate-800 mt-1 block">
                {health.foreign_keys ? "Enforced (ON)" : "Disabled (OFF)"}
              </span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Connection Pool</span>
              <div className="flex items-center gap-1 font-mono text-sm text-slate-800 mt-1">
                <Cpu className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {health.pool_connections_active} act / {health.pool_connections_idle} idle
                </span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">DB Size / Pages</span>
              <div className="flex items-center gap-1 font-mono text-sm text-slate-800 mt-1">
                <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {(health.database_size_bytes / (1024 * 1024)).toFixed(2)} MB ({health.page_count} pgs)
                </span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Tables</span>
              <div className="flex items-center gap-1 font-mono text-sm text-slate-800 mt-1">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>{health.tables_count} Relations</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-slate-500">Checking engine health...</div>
        )}
      </div>

      {/* Two Columns: Hot Backup & Emergency Restore */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot Backup Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Trigger Live SQLite Hot Backup</h3>
                <p className="text-xs text-slate-500">Zero-downtime backup using the SQLite Online Backup API.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Custom Backup Filename (Optional)
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-700"
                  placeholder="logar_backup_manual.db"
                  value={customFilename}
                  onChange={(e) => setCustomFilename(e.target.value)}
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Leaves blank for default timestamp-stamped naming format.
                </span>
              </div>

              {backupResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1.5 text-emerald-900 font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Backup Created Successfully in {backupResult.execution_duration_ms}ms</span>
                  </div>
                  <div>
                    <span className="font-bold">File: </span>
                    <span className="break-all">{backupResult.backup_file_path}</span>
                  </div>
                  <div>
                    <span className="font-bold">Size: </span>
                    <span>{(backupResult.file_size_bytes / 1024).toFixed(1)} KB ({backupResult.page_count} pages)</span>
                  </div>
                  <div>
                    <span className="font-bold">SHA-256: </span>
                    <span className="break-all text-[10px]">{backupResult.sha256_checksum}</span>
                  </div>
                </div>
              )}

              {backupError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{backupError}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-6">
            <button
              onClick={handleTriggerBackup}
              disabled={backingUp}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{backingUp ? "Generating Hot Backup..." : "Create Hot Backup Now"}</span>
            </button>
          </div>
        </div>

        {/* Emergency Restore Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                <Upload className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Emergency Database Restore</h3>
                <p className="text-xs text-slate-500">Restore database state from a validated backup file snapshot.</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4 text-xs text-amber-900 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Warning:</strong> Restoring overwrites existing operational data. A pre-restore safety snapshot
                is automatically preserved before replacement. Requires Administrator PIN (default: <code>1234</code>).
              </span>
            </div>

            <form onSubmit={handleTriggerRestore} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Full Path to Backup File (.db) *
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono text-slate-700"
                  placeholder="C:\backups\logar_backup_20261110_180000.db"
                  value={restoreFilePath}
                  onChange={(e) => setRestoreFilePath(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Administrator PIN Code *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    maxLength={8}
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono font-bold"
                    placeholder="Enter PIN (e.g. 1234)"
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                  />
                </div>
              </div>

              {restoreResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1.5 text-emerald-900 font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Database Restored Successfully!</span>
                  </div>
                  <div>
                    <span className="font-bold">Restored From: </span>
                    <span className="break-all">{restoreResult.restored_from}</span>
                  </div>
                  <div>
                    <span className="font-bold">Tables Replaced: </span>
                    <span>{restoreResult.tables_restored} relations</span>
                  </div>
                  <div>
                    <span className="font-bold">Safety Snapshot: </span>
                    <span className="break-all text-[10px]">{restoreResult.pre_restore_snapshot_path}</span>
                  </div>
                </div>
              )}

              {restoreError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{restoreError}</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={restoring}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-sm shadow flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>{restoring ? "Restoring Database..." : "Execute Database Restore"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
