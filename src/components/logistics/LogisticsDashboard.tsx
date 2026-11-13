// src/components/logistics/LogisticsDashboard.tsx
import { useState, useEffect } from "react";
import { useLogisticsStore } from "../../store/useLogisticsStore";
import { formatPkr } from "../../types/domain";
import {
  Truck,
  MapPin,
  Car,
  Plus,
  Coins,
  Banknote,
  Layers,
  CheckCircle,
  AlertCircle,
  X,
} from "lucide-react";

import { RouteMasterModal } from "./RouteMasterModal";
import { VehicleMasterModal } from "./VehicleMasterModal";
import { LoadingManifestModal } from "./LoadingManifestModal";
import { ActiveDeliverySheetsList } from "./ActiveDeliverySheetsList";
import { VanSettlementModal } from "./VanSettlementModal";
import { GatePassPrintModal } from "./GatePassPrintModal";

export function LogisticsDashboard() {
  const {
    routes,
    vehicles,
    loadingSheets,
    fetchInitialData,
    openCreateManifestModal,
    openRouteModal,
    openVehicleModal,
    successMessage,
    error,
    clearError,
  } = useLogisticsStore();

  const [activeTab, setActiveTab] = useState<"sheets" | "routes" | "fleet">("sheets");

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Aggregate Metrics
  const activeTripsCount = loadingSheets.filter(
    (s) => s.status === "ISSUED" || s.status === "DISPATCHED"
  ).length;

  const totalInTransitValue = loadingSheets
    .filter((s) => s.status === "ISSUED" || s.status === "DISPATCHED")
    .reduce((acc, s) => acc + s.total_load_retail_paisa, 0);

  const totalCratesInCirculation = loadingSheets
    .filter((s) => s.status === "ISSUED" || s.status === "DISPATCHED")
    .reduce((acc, s) => acc + s.empty_crates_loaded, 0);

  const totalSettledTodayCash = loadingSheets
    .filter((s) => s.status === "SETTLED" || s.status === "COMPLETED")
    .reduce((acc, _s) => acc + 8500000, 0);


  return (
    <div className="space-y-5">
      {/* Top Banner Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 border border-slate-700 px-5 py-4 rounded-xl shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-cyan-600/20 text-cyan-400 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span>Logistics & Route Fleet Management</span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-cyan-950 text-cyan-400 border border-cyan-500/40 rounded-full font-bold">
                NEXTCO FLEET
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Morning loading sheets, gate passes, in-transit stock & evening 3-way reconciliation
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center space-x-2 text-xs">
          <button
            onClick={openCreateManifestModal}
            className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold rounded-lg shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ Morning Manifest (Dispatch)</span>
          </button>
          <button
            onClick={() => openRouteModal()}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg border border-slate-600 transition"
          >
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span>+ New Route</span>
          </button>
          <button
            onClick={() => openVehicleModal()}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg border border-slate-600 transition"
          >
            <Car className="w-3.5 h-3.5 text-emerald-400" />
            <span>+ Add Vehicle</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Active Vans on Route</span>
            <Truck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-cyan-400 flex items-center space-x-2">
            <span>{activeTripsCount} Trips</span>
            {activeTripsCount > 0 && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Dispatched & circulating on beats</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>In-Transit Inventory</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400">
            {formatPkr(totalInTransitValue)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Wholesale stock value on wheels</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Empty Crates with Fleet</span>
            <Coins className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400">
            {totalCratesInCirculation} Crates
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Issued for market crate swaps</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Settled Route Cash</span>
            <Banknote className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-purple-400">
            {formatPkr(totalSettledTodayCash)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Recovered cash deposited in till</p>
        </div>
      </section>

      {/* Notifications / Toast */}
      {successMessage && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-500/50 rounded-xl text-xs text-emerald-200 flex items-center justify-between shadow">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={clearError} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-950/70 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-center justify-between shadow">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={clearError} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* View Tabs */}
      <div className="flex space-x-2 border-b border-slate-700 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("sheets")}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
            activeTab === "sheets"
              ? "bg-cyan-600 text-white shadow"
              : "text-slate-400 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Active Delivery Manifests ({loadingSheets.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("routes")}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
            activeTab === "routes"
              ? "bg-cyan-600 text-white shadow"
              : "text-slate-400 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Route Masters & Beats ({routes.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("fleet")}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
            activeTab === "fleet"
              ? "bg-cyan-600 text-white shadow"
              : "text-slate-400 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Car className="w-4 h-4" />
          <span>Fleet Vehicles & Capacities ({vehicles.length})</span>
        </button>
      </div>

      {/* Active Tab View */}
      {activeTab === "sheets" && <ActiveDeliverySheetsList />}

      {/* Tab 2: Route Masters Table */}
      {activeTab === "routes" && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm">Configured Distribution Routes (Beats)</h3>
            <button
              onClick={() => openRouteModal()}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow"
            >
              + Add Beat
            </button>
          </div>
          <div className="overflow-x-auto border border-slate-700/80 rounded-xl">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="p-3">Route Code</th>
                  <th className="p-3 font-sans">Route Name & Area</th>
                  <th className="p-3 font-sans">Default Driver</th>
                  <th className="p-3">Default Vehicle</th>
                  <th className="p-3 text-right">Target Daily Sales</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 bg-slate-900/40">
                {routes.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/60">
                    <td className="p-3 font-bold text-cyan-300">{r.route_code}</td>
                    <td className="p-3 font-sans font-medium text-white">{r.route_name}</td>
                    <td className="p-3 font-sans text-slate-300">{r.default_driver_name || "Unassigned"}</td>
                    <td className="p-3 text-slate-300">{r.default_vehicle_no || "Unassigned"}</td>
                    <td className="p-3 text-right font-bold text-emerald-400">
                      {formatPkr(r.target_daily_sales_paisa)}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.is_active
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-500/40"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {r.is_active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => openRouteModal(r)}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[10px] font-semibold"
                      >
                        Edit Beat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Fleet & Vehicles Grid */}
      {activeTab === "fleet" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm">Delivery Fleet & Mobile Stock Locations</h3>
            <button
              onClick={() => openVehicleModal()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow"
            >
              + Register Vehicle
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {vehicles.map((v) => (
              <div
                key={v.id}
                className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-base font-bold text-cyan-300 block">
                        {v.vehicle_number}
                      </span>
                      <span className="text-xs text-white font-medium">{v.model}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        v.is_active
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-500/40"
                          : "bg-slate-900 text-slate-400"
                      }`}
                    >
                      {v.is_active ? "READY" : "MAINTENANCE"}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-700/60 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Stacking Limit:</span>
                      <span className="font-mono font-bold text-amber-400">
                        {v.capacity_crates} Standard Crates
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Payload Weight:</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {v.capacity_weight_kg} KG Max
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Odometer:</span>
                      <span className="font-mono text-slate-300">{v.current_odometer_km} KM</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Driver:</span>
                      <span className="text-slate-200">{v.default_driver_name || "Unassigned"}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-700/60 flex justify-end">
                  <button
                    onClick={() => openVehicleModal(v)}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold"
                  >
                    Edit Specifications
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <RouteMasterModal />
      <VehicleMasterModal />
      <LoadingManifestModal />
      <VanSettlementModal />
      <GatePassPrintModal />
    </div>
  );
}
