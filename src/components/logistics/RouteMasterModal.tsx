// src/components/logistics/RouteMasterModal.tsx
import { useState, useEffect } from "react";
import { useLogisticsStore } from "../../store/useLogisticsStore";
import { logisticsService } from "../../services/logisticsService";
import { X, MapPin, CheckCircle, AlertCircle } from "lucide-react";

export function RouteMasterModal() {
  const { isRouteModalOpen, closeRouteModal, editingRoute, fetchRoutes, vehicles } = useLogisticsStore();

  const [routeCode, setRouteCode] = useState("");
  const [routeName, setRouteName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultDriverId, setDefaultDriverId] = useState<number>(1);
  const [defaultVehicleId, setDefaultVehicleId] = useState<number>(1);
  const [targetSalesPkr, setTargetSalesPkr] = useState("250000");
  const [isActive, setIsActive] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingRoute) {
      setRouteCode(editingRoute.route_code);
      setRouteName(editingRoute.route_name);
      setDescription(editingRoute.description || "");
      setDefaultDriverId(editingRoute.default_driver_id || 1);
      setDefaultVehicleId(editingRoute.default_vehicle_id || 1);
      setTargetSalesPkr((editingRoute.target_daily_sales_paisa / 100).toString());
      setIsActive(editingRoute.is_active);
    } else {
      setRouteCode("");
      setRouteName("");
      setDescription("");
      setDefaultDriverId(1);
      setDefaultVehicleId(1);
      setTargetSalesPkr("250000");
      setIsActive(true);
    }
    setError(null);
  }, [editingRoute, isRouteModalOpen]);

  if (!isRouteModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!routeCode.trim() || !routeName.trim()) {
      setError("Route code and route name are required.");
      return;
    }

    const targetPaisa = Math.round((parseFloat(targetSalesPkr) || 0) * 100);
    const selectedVeh = vehicles.find((v) => v.id === defaultVehicleId);

    setIsLoading(true);
    try {
      if (editingRoute) {
        await logisticsService.updateRoute(editingRoute.id, {
          route_name: routeName,
          description: description || undefined,
          default_driver_id: defaultDriverId,
          default_vehicle_id: defaultVehicleId,
          default_vehicle_no: selectedVeh?.vehicle_number,
          target_daily_sales_paisa: targetPaisa,
          is_active: isActive,
        });
      } else {
        await logisticsService.createRoute({
          route_code: routeCode,
          route_name: routeName,
          description: description || undefined,
          default_driver_id: defaultDriverId,
          default_vehicle_id: defaultVehicleId,
          default_vehicle_no: selectedVeh?.vehicle_number,
          target_daily_sales_paisa: targetPaisa,
        });
      }
      setIsLoading(false);
      fetchRoutes();
      closeRouteModal();
    } catch (err: unknown) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-white">
            <MapPin className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold">
              {editingRoute ? "Edit Delivery Route (Beat)" : "Create New Delivery Route"}
            </h2>
          </div>
          <button
            onClick={closeRouteModal}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Route Code</label>
              <input
                type="text"
                placeholder="e.g. R-01"
                disabled={Boolean(editingRoute)}
                value={routeCode}
                onChange={(e) => setRouteCode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono uppercase outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Target Daily Sales (₨)</label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="250000"
                value={targetSalesPkr}
                onChange={(e) => setTargetSalesPkr(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">Route Name & Area</label>
            <input
              type="text"
              placeholder="e.g. City Center & Shahi Bazaar"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 font-medium"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">Beat Description / Coverage Notes</label>
            <textarea
              rows={2}
              placeholder="Shahi Bazaar, Hospital Road, Girls College Chowk..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Default Assigned Driver</label>
              <select
                value={defaultDriverId}
                onChange={(e) => setDefaultDriverId(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
              >
                <option value={1}>Muhammad Ali (Driver 1)</option>
                <option value={2}>Rashid Mahmood (Driver 2)</option>
                <option value={3}>Imran Khan (Driver 3)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Default Delivery Vehicle</label>
              <select
                value={defaultVehicleId}
                onChange={(e) => setDefaultVehicleId(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vehicle_number} — {v.model} ({v.capacity_crates} Crates)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="is_active_route"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <label htmlFor="is_active_route" className="text-slate-300 font-medium cursor-pointer">
              Active Delivery Route (Available for Morning Dispatch)
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-950/50 border border-red-500/50 rounded-lg text-red-200 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-slate-700 flex justify-end space-x-3">
            <button
              type="button"
              onClick={closeRouteModal}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{editingRoute ? "Update Route" : "Save Route Master"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
