import React, { useState } from "react";
import {
  ProductItem,
  loadSavedProducts,
  saveProducts,
  loadSavedBottleSizes,
} from "../../types/products";
import { Plus, Trash2, Edit2, GlassWater } from "lucide-react";

export const ProductManagementTab: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>(loadSavedProducts());
  const [sizes] = useState(loadSavedBottleSizes());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState<ProductItem["category"]>("Cold Drink (PET)");
  const [selectedSizeId, setSelectedSizeId] = useState(sizes[0]?.id || "");
  const [wholesalePkr, setWholesalePkr] = useState(1080);
  const [retailPkr, setRetailPkr] = useState(1200);
  const [purchasePkr, setPurchasePkr] = useState(960);
  const [stockPacks, setStockPacks] = useState(100);
  const [requiresCrate, setRequiresCrate] = useState(false);

  const resetForm = () => {
    setName("");
    setSku("");
    setCategory("Cold Drink (PET)");
    setSelectedSizeId(sizes[0]?.id || "");
    setWholesalePkr(1080);
    setRetailPkr(1200);
    setPurchasePkr(960);
    setStockPacks(100);
    setRequiresCrate(false);
    setEditingProduct(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleOpenEdit = (p: ProductItem) => {
    setEditingProduct(p);
    setName(p.name);
    setSku(p.sku);
    setCategory(p.category);
    const matchedSize = sizes.find((s) => s.sizeLabel === p.sizeLabel);
    setSelectedSizeId(matchedSize?.id || sizes[0]?.id || "");
    setWholesalePkr(p.wholesalePackPricePaisa / 100);
    setRetailPkr(p.retailPackPricePaisa / 100);
    setPurchasePkr(p.purchasePackPricePaisa / 100);
    setStockPacks(p.stockPacks);
    setRequiresCrate(p.requiresCrate);
    setShowAddModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const sizeObj = sizes.find((s) => s.id === selectedSizeId) || sizes[0];
    const generatedSku = sku.trim() || `${name.slice(0, 2).toUpperCase()}-${sizeObj?.sizeMl || 1500}-PET`;

    if (editingProduct) {
      const updated = products.map((p) =>
        p.id === editingProduct.id
          ? {
              ...p,
              name: name.trim(),
              sku: generatedSku,
              category,
              sizeLabel: sizeObj?.sizeLabel || "1500 ML",
              sizeMl: sizeObj?.sizeMl || 1500,
              bottlesPerPack: sizeObj?.bottlesPerPack || 6,
              wholesalePackPricePaisa: Math.round(wholesalePkr * 100),
              retailPackPricePaisa: Math.round(retailPkr * 100),
              purchasePackPricePaisa: Math.round(purchasePkr * 100),
              stockPacks,
              requiresCrate,
            }
          : p
      );
      setProducts(updated);
      saveProducts(updated);
    } else {
      const newProduct: ProductItem = {
        id: Date.now(),
        sku: generatedSku,
        name: name.trim(),
        category,
        sizeLabel: sizeObj?.sizeLabel || "1500 ML",
        sizeMl: sizeObj?.sizeMl || 1500,
        bottlesPerPack: sizeObj?.bottlesPerPack || 6,
        wholesalePackPricePaisa: Math.round(wholesalePkr * 100),
        retailPackPricePaisa: Math.round(retailPkr * 100),
        purchasePackPricePaisa: Math.round(purchasePkr * 100),
        stockPacks,
        requiresCrate,
      };
      const updated = [...products, newProduct];
      setProducts(updated);
      saveProducts(updated);
    }

    setShowAddModal(false);
    resetForm();
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to remove this product?")) {
      const updated = products.filter((p) => p.id !== id);
      setProducts(updated);
      saveProducts(updated);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <GlassWater className="w-5 h-5 text-red-600" />
            <span>Product Catalog & PET Pack Configurations</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure Cold Drinks (Cola Next, Fizz Up), Juices & Flavors. All inventory is maintained strictly in PACKS.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Product / Juice</span>
        </button>
      </div>

      {/* Bottle Size Rules Reference */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
        <span className="font-bold block mb-1.5">Standard Packaging Standards (PET Packs):</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
          {sizes.map((s) => (
            <div key={s.id} className="bg-white/80 p-2 rounded border border-amber-200/80">
              <span className="font-bold text-slate-800 block">{s.sizeLabel}</span>
              <span className="text-slate-600">{s.bottlesPerPack} bottles / pack</span>
            </div>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3">SKU</th>
                <th className="p-3">Product Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Pack Specification</th>
                <th className="p-3 text-right">Wholesale (₨)</th>
                <th className="p-3 text-right">Retail (₨)</th>
                <th className="p-3 text-center">Stock</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="p-3 font-mono font-bold text-slate-700">{p.sku}</td>
                  <td className="p-3 font-semibold text-slate-900">{p.name}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        p.category.includes("Juice")
                          ? "bg-amber-100 text-amber-800"
                          : p.requiresCrate
                          ? "bg-purple-100 text-purple-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {p.category}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-slate-600">
                    {p.sizeLabel} • {p.bottlesPerPack} btls/pack
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-700">
                    ₨ {(p.wholesalePackPricePaisa / 100).toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-mono text-slate-700">
                    ₨ {(p.retailPackPricePaisa / 100).toLocaleString()}
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-cyan-700">
                    {p.stockPacks} <span className="text-[10px] text-slate-400 font-normal">packs</span>
                  </td>
                  <td className="p-3 text-center space-x-2">
                    <button
                      onClick={() => handleOpenEdit(p)}
                      className="p-1 text-slate-500 hover:text-blue-600 rounded"
                      title="Edit Product"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1 text-slate-500 hover:text-red-600 rounded"
                      title="Delete Product"
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

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">
              {editingProduct ? "Edit Product" : "Add New Beverage / Juice Product"}
            </h3>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">Product Brand / Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cola Next, Fizz Up, Mango Juice"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ProductItem["category"])}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                  >
                    <option value="Cold Drink (PET)">Cold Drink (PET)</option>
                    <option value="Cold Drink (RGB)">Cold Drink (RGB Glass)</option>
                    <option value="Cold Drink (Can)">Cold Drink (Can)</option>
                    <option value="Juices">Juices (Custom Flavors)</option>
                    <option value="Mineral Water">Mineral Water</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Pack Size (Bottles per Pack)</label>
                  <select
                    value={selectedSizeId}
                    onChange={(e) => setSelectedSizeId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                  >
                    {sizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sizeLabel} ({s.bottlesPerPack} bottles/pack)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Purchase Cost (₨ / Pack)</label>
                  <input
                    type="number"
                    min="0"
                    value={purchasePkr}
                    onChange={(e) => setPurchasePkr(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono text-right"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Wholesale Rate (₨ / Pack)</label>
                  <input
                    type="number"
                    min="0"
                    value={wholesalePkr}
                    onChange={(e) => setWholesalePkr(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono text-right"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Retail Rate (₨ / Pack)</label>
                  <input
                    type="number"
                    min="0"
                    value={retailPkr}
                    onChange={(e) => setRetailPkr(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono text-right"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Opening Stock (In PACKS)</label>
                  <input
                    type="number"
                    min="0"
                    value={stockPacks}
                    onChange={(e) => setStockPacks(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono text-right"
                  />
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
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
