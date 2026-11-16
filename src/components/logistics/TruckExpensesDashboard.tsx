import React, { useState } from "react";
import {
  TruckExpenseEntry,
  loadSavedTruckExpenses,
  saveTruckExpenses,
} from "../../types/truckExpense";
import { loadSavedProducts, saveProducts } from "../../types/products";
import { Truck, Plus, Trash2 } from "lucide-react";

export const TruckExpensesDashboard: React.FC = () => {
  const [expenses, setExpenses] = useState<TruckExpenseEntry[]>(loadSavedTruckExpenses());
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [truckNumber, setTruckNumber] = useState("");
  const [shipmentReference, setShipmentReference] = useState("");
  const [totalPacksReceived, setTotalPacksReceived] = useState<number>(175);
  const [fuelExpensesPkr, setFuelExpensesPkr] = useState<number>(2000);
  const [driverExpensesPkr, setDriverExpensesPkr] = useState<number>(800);
  const [unloadingLaborPkr, setUnloadingLaborPkr] = useState<number>(500);
  const [otherExpensesPkr, setOtherExpensesPkr] = useState<number>(200);
  const [notes, setNotes] = useState("");

  const totalExpensesPkr =
    Number(fuelExpensesPkr || 0) +
    Number(driverExpensesPkr || 0) +
    Number(unloadingLaborPkr || 0) +
    Number(otherExpensesPkr || 0);

  const expensePerPackPkr =
    totalPacksReceived > 0 ? parseFloat((totalExpensesPkr / totalPacksReceived).toFixed(2)) : 0;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!truckNumber.trim() || totalPacksReceived <= 0) return;

    const newEntry: TruckExpenseEntry = {
      id: Date.now(),
      truckNumber: truckNumber.trim(),
      shipmentReference: shipmentReference.trim() || `PUR-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 10),
      totalPacksReceived,
      totalExpensesPkr,
      fuelExpensesPkr,
      driverExpensesPkr,
      unloadingLaborPkr,
      otherExpensesPkr,
      expensePerPackPkr,
      notes,
      createdAt: new Date().toISOString(),
    };

    const updated = [newEntry, ...expenses];
    setExpenses(updated);
    saveTruckExpenses(updated);

    // Automatically update allocated truck expense in product catalog
    const products = loadSavedProducts();
    const updatedProducts = products.map((p) => ({
      ...p,
      truckExpensePaisa: Math.round(expensePerPackPkr * 100),
    }));
    saveProducts(updatedProducts);

    setShowAddModal(false);
    setTruckNumber("");
    setShipmentReference("");
    setNotes("");
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this truck expense record?")) {
      const updated = expenses.filter((e) => e.id !== id);
      setExpenses(updated);
      saveTruckExpenses(updated);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              Truck Expenses & Landed Freight Management
            </h1>
            <p className="text-xs text-slate-500">
              Divide total vehicle haul & unloading costs automatically per pack to compute actual landed cost & net profit.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow transition"
        >
          <Plus className="w-4 h-4" />
          <span>Record New Truck Haul</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block mb-1">Total Truck Hauls</span>
          <span className="text-2xl font-bold text-slate-800">{expenses.length}</span>
          <span className="text-[11px] text-teal-600 font-medium block mt-1">Recorded Shipments</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block mb-1">Total Inward Packs</span>
          <span className="text-2xl font-bold text-blue-600">
            {expenses.reduce((sum, e) => sum + e.totalPacksReceived, 0).toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">Received Consignments</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block mb-1">Total Transportation Expenses</span>
          <span className="text-2xl font-bold text-emerald-600">
            ₨ {expenses.reduce((sum, e) => sum + e.totalExpensesPkr, 0).toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">Fuel, Palledari & Driver</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block mb-1">Current Allocated Expense / Pack</span>
          <span className="text-2xl font-bold text-purple-600">
            ₨ {expenses[0]?.expensePerPackPkr || 0}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">Added to Landed Unit Cost</span>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Shipment Expenses History</h2>
          <span className="text-xs text-slate-500">IAS 2 Direct Inventory Allocation</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Truck #</th>
                <th className="p-3">Shipment Ref</th>
                <th className="p-3 text-center">Packs</th>
                <th className="p-3 text-right">Fuel (₨)</th>
                <th className="p-3 text-right">Driver (₨)</th>
                <th className="p-3 text-right">Labor (₨)</th>
                <th className="p-3 text-right font-bold text-slate-800">Total (₨)</th>
                <th className="p-3 text-center font-bold text-purple-700 bg-purple-50/50">Exp / Pack</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/70">
                  <td className="p-3 font-sans text-slate-700">{e.date}</td>
                  <td className="p-3 font-bold text-slate-900">{e.truckNumber}</td>
                  <td className="p-3 text-slate-600">{e.shipmentReference}</td>
                  <td className="p-3 text-center font-bold text-blue-700">{e.totalPacksReceived}</td>
                  <td className="p-3 text-right text-slate-600">{e.fuelExpensesPkr.toLocaleString()}</td>
                  <td className="p-3 text-right text-slate-600">{e.driverExpensesPkr.toLocaleString()}</td>
                  <td className="p-3 text-right text-slate-600">{e.unloadingLaborPkr.toLocaleString()}</td>
                  <td className="p-3 text-right font-bold text-emerald-700">{e.totalExpensesPkr.toLocaleString()}</td>
                  <td className="p-3 text-center font-bold text-purple-700 bg-purple-50/50">₨ {e.expensePerPackPkr}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="p-1 text-slate-400 hover:text-red-600 transition"
                      title="Delete Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
              <Truck className="w-5 h-5 text-red-600" />
              <span>Record Truck Inward Consignment Expenses</span>
            </h3>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Truck Vehicle Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TK-4820"
                    value={truckNumber}
                    onChange={(e) => setTruckNumber(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-red-500 font-mono"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Purchase / Shipment Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. PUR-2026-001"
                    value={shipmentReference}
                    onChange={(e) => setShipmentReference(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none font-mono"
                  />
                </div>

                <div className="col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">Total Packs Received in Truck</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={totalPacksReceived}
                    onChange={(e) => setTotalPacksReceived(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none font-mono font-bold text-blue-700"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Fuel Expenses (₨)</label>
                  <input
                    type="number"
                    min="0"
                    value={fuelExpensesPkr}
                    onChange={(e) => setFuelExpensesPkr(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none font-mono text-right"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Driver Expenses (₨)</label>
                  <input
                    type="number"
                    min="0"
                    value={driverExpensesPkr}
                    onChange={(e) => setDriverExpensesPkr(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none font-mono text-right"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Loading / Unloading Labor (₨)</label>
                  <input
                    type="number"
                    min="0"
                    value={unloadingLaborPkr}
                    onChange={(e) => setUnloadingLaborPkr(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none font-mono text-right"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Other Surcharges (₨)</label>
                  <input
                    type="number"
                    min="0"
                    value={otherExpensesPkr}
                    onChange={(e) => setOtherExpensesPkr(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none font-mono text-right"
                  />
                </div>
              </div>

              {/* Automatic Distribution Result Callout */}
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 space-y-1">
                <div className="flex justify-between font-bold text-teal-900">
                  <span>Total Truck Expenses:</span>
                  <span className="font-mono">₨ {totalExpensesPkr.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-purple-700 text-sm pt-1 border-t border-teal-200">
                  <span>Allocated Expense Per Pack:</span>
                  <span className="font-mono">₨ {expensePerPackPkr} / pack</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow"
                >
                  Confirm & Allocate to Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
