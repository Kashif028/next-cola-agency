import React, { useState, useEffect } from "react";
import { AppSettings, UpdateAppSettingsDto } from "../../types/domain";
import { dbService } from "../../services/dbService";
import { Building2, Phone, MessageSquare, MapPin, Hash, Save, CheckCircle2, AlertCircle, Eye } from "lucide-react";

interface AgencyProfileTabProps {
  settings: AppSettings | null;
  onSettingsUpdated: (newSettings: AppSettings) => void;
}

export const AgencyProfileTab: React.FC<AgencyProfileTabProps> = ({ settings, onSettingsUpdated }) => {
  const [formData, setFormData] = useState<UpdateAppSettingsDto>({
    agency_name: "",
    tagline: "",
    address: "",
    phone: "",
    whatsapp: "",
    ntn_strn: "",
    invoice_prefix: "INV-",
    default_crate_deposit: 15000,
    default_credit_days: 14,
    auto_backup_on_close: true,
    backup_dir: "C:\\ProgramData\\DogarTradersPOS\\backups",
  });

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (settings) {
      setFormData({
        agency_name: settings.agency_name || "",
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
    }
  }, [settings]);

  const handleChange = (field: keyof UpdateAppSettingsDto, val: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
    setStatusMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agency_name.trim()) {
      setStatusMsg({ type: "error", text: "Agency Name is strictly required." });
      return;
    }

    try {
      setSaving(true);
      const updated = await dbService.updateAppSettings(formData);
      onSettingsUpdated(updated);
      setStatusMsg({ type: "success", text: "Agency profile saved successfully!" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: "error", text: `Failed to save settings: ${msg}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form Column */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Distributor Agency Profile</h2>
            <p className="text-xs text-slate-500">Configure your official commercial identity printed on bills, thermal receipts, and vouchers.</p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Agency Commercial Name *
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold"
                placeholder="Logar Traders"
                value={formData.agency_name}
                onChange={(e) => handleChange("agency_name", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Tagline / Distribution Sub-title
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Authorized Distributor - Next Cola & Beverages"
              value={formData.tagline || ""}
              onChange={(e) => handleChange("tagline", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Physical Business / Warehouse Address
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <textarea
                rows={2}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Near General Bus Stand, Circular Road, Logar"
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Official Phone / Landline
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="+92 300 1234567"
                  value={formData.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                WhatsApp Order Line
              </label>
              <div className="relative">
                <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="+92 300 1234567"
                  value={formData.whatsapp || ""}
                  onChange={(e) => handleChange("whatsapp", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              NTN / STRN Tax Registration
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="STRN-3277874-9 / NTN-1234567-8"
                value={formData.ntn_strn || ""}
                onChange={(e) => handleChange("ntn_strn", e.target.value)}
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm shadow flex items-center gap-2 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Saving Changes..." : "Save Agency Profile"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Live 80mm Receipt Header Preview Column */}
      <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
        <div className="flex items-center gap-2 mb-4 text-slate-700 font-bold text-sm">
          <Eye className="w-4 h-4 text-red-600" />
          <span>80mm Thermal Receipt Header Preview</span>
        </div>

        <div className="bg-white p-5 rounded-lg shadow-sm border border-dashed border-slate-300 text-center font-mono text-xs leading-relaxed text-slate-800">
          <div className="text-base font-black tracking-wider uppercase text-slate-900 border-b border-black pb-2 mb-2">
            {formData.agency_name || "LOGAR TRADERS"}
          </div>
          {formData.tagline && <div className="text-[11px] font-semibold text-slate-700">{formData.tagline}</div>}
          <div className="text-[11px] text-slate-600 mt-1">{formData.address || "Main Warehouse, Logar"}</div>
          <div className="text-[11px] text-slate-600 mt-0.5">
            TEL: {formData.phone || "+92 300 0000000"} | WA: {formData.whatsapp || "+92 300 0000000"}
          </div>
          {formData.ntn_strn && <div className="text-[10px] text-slate-500 mt-1 font-bold">{formData.ntn_strn}</div>}

          <div className="my-3 border-t border-dashed border-slate-400"></div>

          <div className="text-left text-[11px] space-y-1">
            <div className="flex justify-between">
              <span>Bill No:</span>
              <span className="font-bold">{formData.invoice_prefix}2026-0001</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{new Date().toLocaleDateString("en-PK")}</span>
            </div>
            <div className="flex justify-between">
              <span>Customer:</span>
              <span className="font-bold">Bismillah General Store</span>
            </div>
          </div>

          <div className="my-2 border-t border-black"></div>
          <div className="flex justify-between font-bold text-[10px]">
            <span>ITEM</span>
            <span>QTY</span>
            <span>TOTAL</span>
          </div>
          <div className="my-1 border-t border-dotted border-slate-400"></div>
          <div className="flex justify-between text-[11px]">
            <span>Next Cola 500ml PET</span>
            <span>10 ctn</span>
            <span>12,000</span>
          </div>

          <div className="my-3 border-t border-dashed border-slate-400"></div>
          <div className="text-[10px] text-slate-500 italic">
            *** Next Cola Distribution System ***
          </div>
        </div>
      </div>
    </div>
  );
};
