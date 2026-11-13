// src/components/logistics/VehicleMasterModal.tsx
import { useState, useEffect } from "react";
import { useLogisticsStore } from "../../store/useLogisticsStore";
import { logisticsService } from "../../services/logisticsService";
import { X, Truck, CheckCircle, AlertCircle } from "lucide-react";

export function VehicleMasterModal() {
  const { isVehicleModalOpen, closeVehicleModal, editingVehicle, fetchVehicles } = useLogisticsStore();

  const [vehicleNumber, setVehicleNumber] = useState("");
  const [model, setModel] = useState("");
  const [capacityCrates, setCapacityCrates] = useState("120");
  const [capacityWeightKg, setCapacityWeightKg] = useState("850");
  const [defaultDriverId, setDefaultDriverId] = useState<number>(1);
  const [notes, setNotes] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingVehicle) {
      setVehicleNumber(editingVehicle.vehicle_number);
      setModel(editingVehicle.model);
      setCapacityCrates(editingVehicle.capacity_crates.toString());
      setCapacityWeightKg(editingVehicle.capacity_weight_kg.toString());
      setDefaultDriverId(editingVehicle.default_driver_id || 1);
      setNotes(editingVehicle.notes || "");
    } else {
      setVehicleNumber("");
      setModel("");
      setCapacityCrates("120");
      setCapacityWeightKg("850");
      setDefaultDriverId(1);
      setNotes("");
    }
    setError(null);
  }, [editingVehicle, isVehicleModalOpen]);

  if (!isVehicleModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!vehicleNumber.trim() || !model.trim()) {
      setError("Vehicle registration number and model description are required.");
      return;
    }

    const crates = parseInt(capacityCrates, 10) || 0;
    const weight = parseFloat(capacityWeightKg) || 0;

    setIsLoading(true);
    try {
      if (editingVehicle) {
        await logisticsService.updateVehicle(editingVehicle.id, {
          model,
          capacity_crates: crates,
          capacity_weight_kg: weight,
          default_driver_id: defaultDriverId,
          current_odometer_km: editingVehicle.current_odometer_km,
          is_active: editingVehicle.is_active,
          notes: notes || undefined,
        });
      } else {
        await logisticsService.createVehicle({
          vehicle_number: vehicleNumber.trim().toUpperCase(),
          model,
          capacity_crates: crates,
          capacity_weight_kg: weight,
          default_driver_id: defaultDriverId,
          notes: notes || undefined,
        });
      }
      setIsLoading(false);
      fetchVehicles();
      closeVehicleModal();
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
            <Truck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold">
              {editingVehicle ? "Edit Fleet Vehicle" : "Add New Fleet Delivery Vehicle"}
            </h2>
          </div>
          <button
            onClick={closeVehicleModal}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Vehicle Registration #</label>
              <input
                type="text"
                placeholder="e.g. LES-2489"
                disabled={Boolean(editingVehicle)}
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono uppercase outline-none focus:border-emerald-500 disabled:opacity-50"
              />
            </div>

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
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">Vehicle Make & Model</label>
            <input
              type="text"
              placeholder="e.g. Suzuki Ravi Pickup 800cc"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Crate Capacity (Standard Crates)</label>
              <input
                type="number"
                min="10"
                max="1000"
                value={capacityCrates}
                onChange={(e) => setCapacityCrates(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 block">Maximum physical crate stacking limit</span>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Payload Weight Capacity (KG)</label>
              <input
                type="number"
                min="100"
                step="any"
                value={capacityWeightKg}
                onChange={(e) => setCapacityWeightKg(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 block">e.g. 850 kg for Ravi, 2200 kg for Shehzore</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">Maintenance / Fleet Notes</label>
            <input
              type="text"
              placeholder="e.g. Main city express delivery van, mobile stock location LOC-VAN"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500"
            />
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
              onClick={closeVehicleModal}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{editingVehicle ? "Update Vehicle" : "Register Vehicle"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
