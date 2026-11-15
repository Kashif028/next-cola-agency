import React, { useState } from "react";
import { useSalesStore } from "../../store/useSalesStore";
import { X, Truck, Calculator, CheckCircle2, AlertCircle } from "lucide-react";
import { RecordPurchaseDto, PurchaseItemInputDto } from "../../types/sales";
import { loadSavedProducts } from "../../types/products";

export const PurchaseEntryModal: React.FC = () => {
  const { isPurchaseModalOpen, closePurchaseModal, submitPurchase, previewLandedCost, landedCostPreview, isLoading, error } =
    useSalesStore();

  const availableProducts = loadSavedProducts();

  const [supplierId] = useState(1);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [freightPaisa, setFreightPaisa] = useState(0);
  const [unloadingPaisa, setUnloadingPaisa] = useState(0);
  const [transitTaxPaisa, setTransitTaxPaisa] = useState(0);
  const [paidPaisa, setPaidPaisa] = useState(0);
  const [cratesReturned, setCratesReturned] = useState(0);
  const [notes, setNotes] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [items, setItems] = useState<PurchaseItemInputDto[]>(() => {
    const first = availableProducts[0];
    return [
      {
        product_id: first ? first.id : 1,
        pack_qty: 0,
        loose_qty: 0,
        unit_cost_paisa: first ? first.purchasePackPricePaisa : 0,
      },
    ];
  });

  if (!isPurchaseModalOpen) return null;

  const handleUpdateItem = (index: number, field: keyof PurchaseItemInputDto, val: number) => {
    const updated = items.map((it, i) => (i === index ? { ...it, [field]: val } : it));
    setItems(updated);
  };

  const handleAddItem = () => {
    const first = availableProducts[0];
    setItems([
      ...items,
      {
        product_id: first ? first.id : 1,
        pack_qty: 0,
        loose_qty: 0,
        unit_cost_paisa: first ? first.purchasePackPricePaisa : 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleCalculatePreview = async () => {
    await previewLandedCost(items, freightPaisa, unloadingPaisa, transitTaxPaisa);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg("");
    try {
      const payload: RecordPurchaseDto = {
        supplier_id: supplierId,
        invoice_no: invoiceNo.trim() || `PUR-${Date.now().toString().slice(-6)}`,
        purchase_date: purchaseDate,
        items,
        freight_paisa: freightPaisa,
        unloading_labor_paisa: unloadingPaisa,
        transit_tax_paisa: transitTaxPaisa,
        payment_status: paidPaisa > 0 ? "PARTIAL" : "UNPAID",
        payment_mode: "CREDIT",
        paid_amount_paisa: paidPaisa,
        empty_crates_returned_to_factory: cratesReturned,
        notes: notes || "Factory truck consignment inward",
        user_id: 1,
      };

      const res = await submitPurchase(payload);
      setSuccessMsg(`Purchase ${res.purchase_number} recorded! Landed Cost: Rs ${(res.total_landed_cost_paisa / 100).toLocaleString()}`);
      setTimeout(() => {
        closePurchaseModal();
      }, 1500);
    } catch {
      // error handled in store
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-850 bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-600/20 text-emerald-400 rounded-lg">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Inward Factory Purchase & Landed Cost Entry</h2>
              <p className="text-xs text-slate-400">Capitalize freight & unloading labor into unit inventory (IAS 2)</p>
            </div>
          </div>
          <button onClick={closePurchaseModal} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1 text-xs">
          {error && (
            <div className="bg-red-950/80 border border-red-500/50 p-3 rounded-lg text-red-200 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-950/80 border border-emerald-500/50 p-3 rounded-lg text-emerald-200 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Supplier & Header Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Supplier Consignment</label>
              <div className="p-2.5 bg-slate-800 rounded-lg text-slate-200 border border-slate-700">
                Nextco Beverages Plant Hub (SUPP-001)
              </div>
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Purchase Invoice #</label>
              <input
                type="text"
                placeholder="Auto-generated or e.g. PUR-2026-001"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Delivery Date</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
          </div>

          {/* Beverage Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200">Consignment Product Items</h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-semibold"
              >
                + Add Item
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-700 rounded-xl">
              <table className="w-full text-left">
                <thead className="bg-slate-800/80 text-slate-400 font-medium">
                  <tr>
                    <th className="p-2.5">Beverage SKU</th>
                    <th className="p-2.5 w-24">Packs</th>
                    <th className="p-2.5 w-24">Loose</th>
                    <th className="p-2.5 w-32">Pack Cost (₨)</th>
                    <th className="p-2.5 w-32">Line Goods Total</th>
                    <th className="p-2.5 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {items.map((it, idx) => {
                    const prod = availableProducts.find((p) => p.id === it.product_id) || availableProducts[0];
                    const packUnits = prod?.bottlesPerPack || 1;
                    const baseRate = packUnits > 0 ? it.unit_cost_paisa / packUnits : 0;
                    const lineBase = it.pack_qty * it.unit_cost_paisa + it.loose_qty * baseRate;

                    return (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-2.5">
                          <select
                            value={it.product_id}
                            onChange={(e) => {
                              const chosen = availableProducts.find((p) => p.id === Number(e.target.value));
                              handleUpdateItem(idx, "product_id", Number(e.target.value));
                              if (chosen) {
                                handleUpdateItem(idx, "unit_cost_paisa", chosen.purchasePackPricePaisa);
                              }
                            }}
                            className="bg-slate-800 border border-slate-700 rounded p-1.5 text-white w-full text-xs font-sans"
                          >
                            {availableProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.sizeLabel} ({p.sku})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min={0}
                            value={it.pack_qty}
                            onChange={(e) => handleUpdateItem(idx, "pack_qty", Number(e.target.value))}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-white text-center"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min={0}
                            value={it.loose_qty}
                            onChange={(e) => handleUpdateItem(idx, "loose_qty", Number(e.target.value))}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-white text-center"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min={0}
                            value={it.unit_cost_paisa / 100}
                            onChange={(e) => handleUpdateItem(idx, "unit_cost_paisa", Math.round(Number(e.target.value) * 100))}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-white text-right"
                          />
                        </td>
                        <td className="p-2.5 text-right font-semibold text-emerald-400">
                          ₨ {(lineBase / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-red-400 hover:text-red-300 font-bold"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Landed Surcharges Apportionment Box */}
          <div className="bg-slate-800/60 border border-slate-700 p-4 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center space-x-2">
                <Calculator className="w-4 h-4 text-cyan-400" />
                <span>Capitalized Direct Expenses (Landed Surcharges)</span>
              </span>
              <button
                type="button"
                onClick={handleCalculatePreview}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-cyan-300 rounded font-semibold border border-slate-600"
              >
                Calculate Proportional Allocation
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-slate-400 block mb-1">Inward Freight (Truck Haul) ₨</label>
                <input
                  type="number"
                  min={0}
                  value={freightPaisa / 100}
                  onChange={(e) => setFreightPaisa(Math.round(Number(e.target.value) * 100))}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-right"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Unloading Labor (Palledari) ₨</label>
                <input
                  type="number"
                  min={0}
                  value={unloadingPaisa / 100}
                  onChange={(e) => setUnloadingPaisa(Math.round(Number(e.target.value) * 100))}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-right"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Transit / Octroi Tax ₨</label>
                <input
                  type="number"
                  min={0}
                  value={transitTaxPaisa / 100}
                  onChange={(e) => setTransitTaxPaisa(Math.round(Number(e.target.value) * 100))}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-right"
                />
              </div>
            </div>

            {/* Landed Cost Breakdown Preview */}
            {landedCostPreview && (
              <div className="mt-3 bg-slate-900/80 border border-cyan-800/60 p-3 rounded-lg space-y-2">
                <div className="flex justify-between text-xs font-semibold text-cyan-400">
                  <span>Base Goods: ₨ {(landedCostPreview.base_goods_total_paisa / 100).toLocaleString()}</span>
                  <span>+ Surcharges: ₨ {(landedCostPreview.total_additional_costs_paisa / 100).toLocaleString()}</span>
                  <span className="text-emerald-400">
                    = Total Landed Cost: ₨ {(landedCostPreview.total_landed_cost_paisa / 100).toLocaleString()}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 space-y-1">
                  {landedCostPreview.items.map((it, i) => (
                    <div key={i} className="flex justify-between border-b border-slate-800 py-0.5">
                      <span>{it.product_name}</span>
                      <span className="font-mono text-cyan-300">
                        Allocated: +₨ {(it.allocated_landed_cost_paisa / 100).toFixed(2)} → Final Landed: ₨{" "}
                        {(it.final_pack_landed_cost_paisa / 100).toFixed(2)} / pack (₨ {(it.final_unit_landed_cost_paisa / 100).toFixed(2)} / bottle)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Settlement & Empties Return */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Empty Crates Handed to Factory Truck</label>
              <input
                type="number"
                min={0}
                value={cratesReturned}
                onChange={(e) => setCratesReturned(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-right"
              />
              <span className="text-[10px] text-slate-400">Decrements warehouse empty crate stock</span>
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Cash Paid at Gate (Cash Out) ₨</label>
              <input
                type="number"
                min={0}
                value={paidPaisa / 100}
                onChange={(e) => setPaidPaisa(Math.round(Number(e.target.value) * 100))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-right font-mono"
              />
              <span className="text-[10px] text-slate-400">Decrements Cash Book drawer balance</span>
            </div>
            <div>
              <label className="text-slate-300 font-semibold mb-1 block">Notes / Bill Reference</label>
              <input
                type="text"
                placeholder="Consignment notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
            <button
              type="button"
              onClick={closePurchaseModal}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg transition disabled:opacity-50"
            >
              {isLoading ? "Posting Purchase..." : "Confirm & Post Inward Consignment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
