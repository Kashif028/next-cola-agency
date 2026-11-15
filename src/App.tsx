import { useEffect, useState } from "react";
import WebsiteApp from "./website/WebsiteApp";
import { useDbStore } from "./store/useDbStore";
import { useAppStore } from "./store/useAppStore";
import {
  Database,
  ShieldCheck,
  HardDrive,
  RefreshCw,
  Layers,
  Package,
  Calculator,
  Boxes,
  Flame,
  LayoutDashboard,
  ShoppingCart,
  Truck,
  BarChart3,
  Settings,
  Download,
  BookOpen,
} from "lucide-react";

import { StockOverview } from "./components/inventory/StockOverview";
import { PackagingConverter } from "./components/inventory/PackagingConverter";
import { EmptiesCrateTracker } from "./components/inventory/EmptiesCrateTracker";
import { BreakageLog } from "./components/inventory/BreakageLog";
import { PosTerminal } from "./components/pos/PosTerminal";
import { LogisticsDashboard } from "./components/logistics/LogisticsDashboard";
import { ReportsHub } from "./components/reports/ReportsHub";
import { SettingsDashboard } from "./components/settings/SettingsDashboard";
import { KhataManagement } from "./components/khata/KhataManagement";

type TabKey =
  | "pos"
  | "logistics"
  | "reports"
  | "settings"
  | "inventory"
  | "packaging"
  | "crates"
  | "breakage"
  | "dashboard"
  | "khata";

type AppMode = "website" | "pos";

export default function App() {
  // Deterministic mode resolution:
  // 1. Query parameter ?app=pos or ?app=website
  // 2. Hash #pos
  // 3. Tauri desktop environment detection
  // 4. Default: "website" for pure web visitors
  const [appMode, setAppMode] = useState<AppMode>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const paramMode = params.get("app");
      if (paramMode === "pos") return "pos";
      if (paramMode === "website") return "website";
      if (window.location.hash === "#pos") return "pos";
      if ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) return "pos";
    }
    return "website";
  });

  const { health, latestBackup, isLoading, error, fetchHealth, createHotBackup } = useDbStore();
  const { settings, fetchSettings } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabKey>("pos");

  // Call POS backend IPC only when active mode is "pos"
  useEffect(() => {
    if (appMode === "pos") {
      fetchHealth();
      fetchSettings();
    }
  }, [appMode, fetchHealth, fetchSettings]);

  if (appMode === "website") {
    return (
      <div className="relative min-h-screen">
        <WebsiteApp onSwitchToPos={() => setAppMode("pos")} />
        {/* Floating App Switcher to POS */}
        <div className="fixed bottom-4 right-4 z-50 print:hidden">
          <button
            type="button"
            onClick={() => setAppMode("pos")}
            className="flex items-center space-x-2 px-3.5 py-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 rounded-full shadow-xl text-xs font-semibold backdrop-blur transition transform active:scale-95"
            title="Switch to Desktop POS Application"
            aria-label="Switch to Desktop POS Application"
            data-testid="switch-to-pos-btn"
          >
            <LayoutDashboard className="w-4 h-4 text-red-500" />
            <span>Launch POS Terminal</span>
          </button>
        </div>
      </div>
    );
  }

  // POS Desktop Interface
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-lg bg-red-600 flex items-center justify-center font-bold text-xl text-white shadow-lg">
            N
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              {settings?.agency_name || "DOGAR TRADERS — Beverage Distribution Agency"}
            </h1>
            <p className="text-xs text-slate-400">
              Beverage Distribution POS & Inventory Management System (PKR ₨)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Switcher back to APK Website */}
          <button
            type="button"
            onClick={() => setAppMode("website")}
            className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-semibold rounded-md shadow transition"
            title="Switch to APK Downloader Website"
            aria-label="Switch to APK Downloader Website"
            data-testid="switch-to-website-btn"
          >
            <Download className="w-3.5 h-3.5" />
            <span>APK Portal</span>
          </button>

          <button
            type="button"
            onClick={() => {
              fetchHealth();
              fetchSettings();
            }}
            disabled={isLoading}
            className="flex items-center space-x-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-xs font-semibold rounded-md border border-slate-600 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => createHotBackup("Manual diagnostic snapshot")}
            disabled={isLoading}
            className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-xs font-semibold rounded-md shadow transition"
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Hot Backup Now</span>
          </button>
        </div>
      </header>

      {/* Main Navigation Bar */}
      <nav className="bg-slate-850 bg-slate-800/80 border-b border-slate-700/80 px-6 py-2 flex items-center space-x-2 overflow-x-auto text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("pos")}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-semibold transition ${
            activeTab === "pos"
              ? "bg-red-600 text-white shadow"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>POS Checkout Counter</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("khata")}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-semibold transition ${
            activeTab === "khata"
              ? "bg-amber-600 text-white shadow"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Khata Ledger (کھاتہ)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("logistics")}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-semibold transition ${
            activeTab === "logistics"
              ? "bg-red-600 text-white shadow"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Logistics & Van Settlement</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("reports")}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-semibold transition ${
            activeTab === "reports"
              ? "bg-red-600 text-white shadow"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>30 Business Reports</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-semibold transition ${
            activeTab === "settings"
              ? "bg-red-600 text-white shadow"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Settings & Backup</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("inventory")}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-semibold transition ${
            activeTab === "inventory"
              ? "bg-cyan-600 text-white shadow"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Beverage Inventory</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("packaging")}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-semibold transition ${
            activeTab === "packaging"
              ? "bg-cyan-600 text-white shadow"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Packaging Converter</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("crates")}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-semibold transition ${
            activeTab === "crates"
              ? "bg-cyan-600 text-white shadow"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Empties & Crate Ledger</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("breakage")}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-semibold transition ${
            activeTab === "breakage"
              ? "bg-cyan-600 text-white shadow"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Breakage & Loss</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-semibold transition ${
            activeTab === "dashboard"
              ? "bg-cyan-600 text-white shadow"
              : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Engine Diagnostic (M1)</span>
        </button>
      </nav>

      {/* Main Content Dashboard */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {error && (
          <div className="bg-red-950/80 border border-red-500/50 p-4 rounded-lg text-sm text-red-200 flex items-center space-x-3">
            <span className="font-bold">Database System Error:</span>
            <span>{error}</span>
          </div>
        )}

        {/* Tab Routing */}
        {activeTab === "pos" && <PosTerminal />}
        {activeTab === "khata" && <KhataManagement />}
        {activeTab === "logistics" && <LogisticsDashboard />}
        {activeTab === "reports" && <ReportsHub />}
        {activeTab === "settings" && <SettingsDashboard />}
        {activeTab === "inventory" && <StockOverview />}
        {activeTab === "packaging" && <PackagingConverter />}
        {activeTab === "crates" && <EmptiesCrateTracker />}
        {activeTab === "breakage" && <BreakageLog />}

        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>SQLite Journal Mode</span>
                  <Database className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-mono font-bold text-cyan-400 uppercase">
                  {health?.journal_mode || "WAL"}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Write-Ahead Logging enabled</p>
              </div>

              <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Referential Integrity</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-mono font-bold text-emerald-400">
                  {health?.foreign_keys ? "ACTIVE" : "ON"}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Foreign Keys strictly enforced</p>
              </div>

              <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Domain Schema</span>
                  <Layers className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-mono font-bold text-amber-400">
                  {health?.tables_count ?? 26} Tables
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Beverage, Khata & Ledgers</p>
              </div>

              <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Currency Architecture</span>
                  <span className="text-sm font-bold text-purple-400">PKR</span>
                </div>
                <div className="text-2xl font-mono font-bold text-purple-400">
                  Exact Paisa
                </div>
                <p className="text-[11px] text-slate-400 mt-1">i64 Integer zero-drift precision</p>
              </div>
            </section>

            {/* Diagnostic Information */}
            <section className="bg-slate-800/70 border border-slate-700 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <span>Core Foundation Architecture (Milestone 1)</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300">
                <div className="space-y-2 border-r border-slate-700/60 pr-6">
                  <h3 className="font-semibold text-slate-100 text-xs uppercase tracking-wider text-cyan-400">
                    Database Engine Parameters
                  </h3>
                  <div className="flex justify-between py-1 border-b border-slate-700/40 text-xs">
                    <span className="text-slate-400">Busy Timeout:</span>
                    <span className="font-mono text-slate-200">{health?.busy_timeout_ms || 5000} ms</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-700/40 text-xs">
                    <span className="text-slate-400">Active / Idle Pool:</span>
                    <span className="font-mono text-slate-200">
                      {health?.pool_connections_active || 0} / {health?.pool_connections_idle || 2}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-700/40 text-xs">
                    <span className="text-slate-400">Database Size:</span>
                    <span className="font-mono text-slate-200">
                      {((health?.database_size_bytes || 0) / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-slate-100 text-xs uppercase tracking-wider text-emerald-400">
                    Latest Live Hot Backup
                  </h3>
                  {latestBackup ? (
                    <div className="space-y-1 text-xs">
                      <div className="text-emerald-300 font-mono truncate">{latestBackup.backup_file_path}</div>
                      <div className="text-slate-400">
                        Checksum SHA-256: <span className="font-mono text-slate-200">{latestBackup.sha256_checksum.slice(0, 16)}...</span>
                      </div>
                      <div className="text-slate-400">
                        Size: {(latestBackup.file_size_bytes / 1024).toFixed(1)} KB ({latestBackup.page_count} pages)
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No backup taken yet this session. Click &quot;Hot Backup Now&quot; above.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Footer Status Bar */}
      <footer className="bg-slate-950 border-t border-slate-800 px-6 py-2 flex items-center justify-between text-xs text-slate-400 font-mono">
        <div>DOGAR TRADERS POS Engine v1.0.0 | Offline-First Desktop</div>
        <div>Tauri v2 + Rust + React + SQLite WAL</div>
      </footer>
    </div>
  );
}
