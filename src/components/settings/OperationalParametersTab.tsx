import React, { useState, useEffect } from "react";
import { AppSettings, UpdateAppSettingsDto } from "../../types/domain";
import { dbService } from "../../services/dbService";
import { Sliders, Save, CheckCircle2, AlertCircle, FileText, Calendar, Folder, ShieldCheck, Printer } from "lucide-react";

interface OperationalParametersTabProps {
  settings: AppSettings | null;
  onSettingsUpdated: (newSettings: AppSettings) => void;
}

export const OperationalParametersTab: React.FC<OperationalParametersTabProps> = ({
  settings,
  onSettingsUpdated,
}) => {
  const [formData, setFormData] = useState<UpdateAppSettingsDto>({
    agency_name: "Logar Traders",
    tagline: "",
    address: "",
    phone: "",
    whatsapp: "",
    ntn_strn: "",
    invoice_prefix: "INV-",
    default_crate_deposit: 15000,
    default_credit_days: 14,
    auto_backup_on_close: true,
    backup_dir: "C:\\ProgramData\\LogarPOS\\backups",
  });

  const [depositInPkr, setDepositInPkr] = useState<number>(150);
  const [thermalWidth, setThermalWidth] = useState<"80mm" | "58mm">(() => {
    return (localStorage.getItem("logar_receipt_width") as "80mm" | "58mm") || "80mm";
  });
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (settings) {
      setFormData({
        agency_name: settings.agency_name || "Logar Traders",
        tagline: settings.tagline || "",
        address: settings.address || "",
        phone: settings.phone || "",
        whatsapp: settings.whatsapp || "",
        ntn_strn: settings.ntn_strn || "",
        invoice_prefix: settings.invoice_prefix || "INV-",
        default_crate_deposit: settings.default_crate_deposit || 15000,
        default_credit_days: settings.default_credit_days || 14,
        auto_backup_on_close: settings.auto_backup_on_close ?? true,
        backup_dir: settings.backup_dir || "C:\\ProgramData\\LogarPOS\\backups",
      });
      setDepositInPkr(Math.round((settings.default_crate_deposit || 15000) / 100));
    }
  }, [settings]);

  const handleDepositChange = (val: number) => {
    setDepositInPkr(val);
    setFormData((prev) => ({ ...prev, default_crate_deposit: Math.round(val * 100) }));
  };

  const handleWidthChange = (width: "80mm" | "58mm") => {
    setThermalWidth(width);
    localStorage.setItem("logar_receipt_width", width);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const updated = await dbService.updateAppSettings(formData);
      onSettingsUpdated(updated);
      setStatusMsg({ type: "success", text: "Operational parameters saved successfully!" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: "error", text: `Failed to save parameters: ${msg}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
          <Sliders className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">Operational & Financial Rules</h2>
          <p className="text-xs text-slate-500">
            Define system-wide defaults for crate security deposits, credit payment terms, and automated backups.
          </p>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 text-sm font-medium ${
            statusMsg.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Billing & Prefix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              Invoice Serial Prefix
            </label>
            <p className="text-xs text-slate-500 mb-2">Prefix prepended to sequential sales invoice numbers.</p>
            <input
              type="text"
              required
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
              placeholder="INV-"
              value={formData.invoice_prefix}
              onChange={(e) => setFormData((prev) => ({ ...prev, invoice_prefix: e.target.value }))}
            />
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              Default Khata Credit Days
            </label>
            <p className="text-xs text-slate-500 mb-2">Standard credit term allowed before debt aging is flagged overdue.</p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="90"
                required
                className="w-32 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                value={formData.default_credit_days}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, default_credit_days: Number(e.target.value) || 0 }))
                }
              />
              <span className="text-sm font-semibold text-slate-600">Days from invoice date</span>
            </div>
          </div>
        </div>

        {/* Empties & Deposit Security */}
        <div className="bg-amber-50/60 p-5 rounded-xl border border-amber-200">
          <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-1 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-700" />
            Standard Crate Deposit Rate (PKR / Crate)
          </label>
          <p className="text-xs text-amber-700 mb-3">
            Liability deposit charged when RGB Glass crates are loaned to retail customers without empties return.
          </p>
          <div className="flex items-center gap-4">
            <div className="relative w-48">
              <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-500">Rs.</span>
              <input
                type="number"
                min="0"
                step="10"
                required
                className="w-full pl-10 pr-3 py-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-800"
                value={depositInPkr}
                onChange={(e) => handleDepositChange(Number(e.target.value) || 0)}
              />
            </div>
            <div className="text-xs text-slate-600 font-mono">
              = {(formData.default_crate_deposit || 0).toLocaleString()} Paisas (Internal DB Storage)
            </div>
          </div>
        </div>

        {/* Thermal Receipt Paper Preference */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
            <Printer className="w-4 h-4 text-slate-500" />
            Default POS Thermal Receipt Paper Width
          </label>
          <p className="text-xs text-slate-500 mb-3">Select the standard roll width of your counter thermal printer.</p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2.5 rounded-lg border border-slate-200 shadow-sm font-medium text-sm">
              <input
                type="radio"
                name="thermal_width"
                checked={thermalWidth === "80mm"}
                onChange={() => handleWidthChange("80mm")}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>80mm Standard POS (Full Detail & Dual Column)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2.5 rounded-lg border border-slate-200 shadow-sm font-medium text-sm">
              <input
                type="radio"
                name="thermal_width"
                checked={thermalWidth === "58mm"}
                onChange={() => handleWidthChange("58mm")}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>58mm Compact POS (Mobile / Van Bluetooth Printer)</span>
            </label>
          </div>
        </div>

        {/* Automated Backup Settings */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-slate-800">Auto-Backup on Application Close</span>
              <p className="text-xs text-slate-500">Automatically creates an encrypted hot backup snapshot before exiting.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.auto_backup_on_close}
                onChange={(e) => setFormData((prev) => ({ ...prev, auto_backup_on_close: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Folder className="w-4 h-4 text-slate-500" />
              Backup Storage Directory Path
            </label>
            <input
              type="text"
              required
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-700"
              value={formData.backup_dir}
              onChange={(e) => setFormData((prev) => ({ ...prev, backup_dir: e.target.value }))}
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow flex items-center gap-2 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Saving Changes..." : "Save Parameters"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
