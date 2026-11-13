import React, { useState, useEffect } from "react";
import { AppSettings } from "../../types/domain";
import { dbService } from "../../services/dbService";
import { AgencyProfileTab } from "./AgencyProfileTab";
import { OperationalParametersTab } from "./OperationalParametersTab";
import { DatabaseBackupRestoreTab } from "./DatabaseBackupRestoreTab";
import { AuditTrailViewerTab } from "./AuditTrailViewerTab";
import { Building2, Sliders, Database, ShieldCheck, Settings } from "lucide-react";

export type SettingsTabId = "agency" | "operational" | "database" | "audit";

export const SettingsDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("agency");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const data = await dbService.getAppSettings();
        setSettings(data);
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSettingsUpdated = (updated: AppSettings) => {
    setSettings(updated);
  };

  return (
    <div className="min-h-screen bg-slate-100/60 p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-md shadow-red-200">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">System & Agency Administration</h1>
            <p className="text-xs text-slate-500">
              Manage commercial identity, financial boundaries, SQLite hot backups, and audit security.
            </p>
          </div>
        </div>

        {/* Global Agency Tag */}
        {settings && (
          <div className="text-right">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">CURRENT AGENCY</span>
            <span className="text-sm font-bold text-slate-800">{settings.agency_name}</span>
          </div>
        )}
      </div>

      {/* Tab Navigation Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("agency")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
            activeTab === "agency"
              ? "bg-red-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Agency Profile & Branding</span>
        </button>

        <button
          onClick={() => setActiveTab("operational")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
            activeTab === "operational"
              ? "bg-red-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Operational & Khata Rules</span>
        </button>

        <button
          onClick={() => setActiveTab("database")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
            activeTab === "database"
              ? "bg-red-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <Database className="w-4 h-4" />
          <span>SQLite Engine & Hot Backup</span>
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
            activeTab === "audit"
              ? "bg-red-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Security & Audit Trail</span>
        </button>
      </div>

      {/* Content Rendering */}
      <div>
        {loading && !settings ? (
          <div className="bg-white rounded-xl p-12 text-center text-sm text-slate-500 border border-slate-200">
            Loading configuration data...
          </div>
        ) : (
          <>
            {activeTab === "agency" && (
              <AgencyProfileTab settings={settings} onSettingsUpdated={handleSettingsUpdated} />
            )}
            {activeTab === "operational" && (
              <OperationalParametersTab settings={settings} onSettingsUpdated={handleSettingsUpdated} />
            )}
            {activeTab === "database" && <DatabaseBackupRestoreTab />}
            {activeTab === "audit" && <AuditTrailViewerTab />}
          </>
        )}
      </div>
    </div>
  );
};
