import React, { useState } from "react";
import { ProductItem, loadSavedProducts, saveProducts } from "../../types/products";
import { Plus, X } from "lucide-react";

interface AddFlavorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFlavorAdded: (newProd: ProductItem) => void;
}

export const AddFlavorModal: React.FC<AddFlavorModalProps> = ({
  isOpen,
  onClose,
  onFlavorAdded,
}) => {
  const [companyName, setCompanyName] = useState("Next Cola");
  const [flavorName, setFlavorName] = useState("");
  const [bottleSize, setBottleSize] = useState("500ml");
  const [sellingPricePkr, setSellingPricePkr] = useState<number>(90);
  const [purchasePricePkr, setPurchasePricePkr] = useState<number>(70);
  const [stockPacks, setStockPacks] = useState<number>(100);
  const [bottleColor, setBottleColor] = useState("#D92D3A");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flavorName.trim()) return;

    const fullProductName = `${companyName} ${flavorName} ${bottleSize} PET`;
    const skuCode = `${companyName.slice(0, 2).toUpperCase()}-${flavorName.slice(0, 3).toUpperCase()}-${bottleSize.toUpperCase()}`;

    // Determine bottles per pack
    let bottlesPerPack = 12;
    if (bottleSize.includes("1.5") || bottleSize.includes("2.25")) bottlesPerPack = 6;
    if (bottleSize.includes("250")) bottlesPerPack = 24;

    const newProd: ProductItem = {
      id: Date.now(),
      sku: skuCode,
      name: fullProductName,
      category: companyName.includes("Next") ? "Next Cola" : companyName.includes("Fizz") ? "Fizz Up" : "Other Beverages",
      sizeLabel: bottleSize,
      sizeMl: bottleSize.includes("1.5") ? 1500 : bottleSize.includes("250") ? 250 : 500,
      bottlesPerPack,
      wholesalePackPricePaisa: Math.round(sellingPricePkr * 100),
      retailPackPricePaisa: Math.round(sellingPricePkr * 100 * 1.1),
      purchasePackPricePaisa: Math.round(purchasePricePkr * 100),
      stockPacks,
      requiresCrate: false,
      bottleColor,
    };

    const currentProds = loadSavedProducts();
    const updated = [...currentProds, newProd];
    saveProducts(updated);

    onFlavorAdded(newProd);
    onClose();
    setFlavorName("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E5E7EB] text-[#1F2937]">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-[#FDECEE] text-[#D92D3A] flex items-center justify-center font-bold">
              <Plus className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#1F2937]">Add New Flavor (+ نیا فلیور شامل کریں)</h3>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#1F2937] p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <div>
            <label className="font-semibold text-[#1F2937] block mb-1">Company / Brand Name</label>
            <select
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full border border-[#E5E7EB] rounded-lg p-2.5 bg-white text-[#1F2937] outline-none"
            >
              <option value="Next Cola">Next Cola</option>
              <option value="Fizz Up">Fizz Up</option>
              <option value="Next Juice">Next Juice</option>
              <option value="Special Beverages">Special Beverages</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-[#1F2937] block mb-1">Flavor Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Cherry, Vanilla, Mango, Lemon..."
              value={flavorName}
              onChange={(e) => setFlavorName(e.target.value)}
              className="w-full border border-[#E5E7EB] rounded-lg p-2.5 outline-none focus:border-[#D92D3A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-[#1F2937] block mb-1">Bottle Size</label>
              <select
                value={bottleSize}
                onChange={(e) => setBottleSize(e.target.value)}
                className="w-full border border-[#E5E7EB] rounded-lg p-2.5 bg-white text-[#1F2937] outline-none"
              >
                <option value="250ml">250ml PET</option>
                <option value="500ml">500ml PET</option>
                <option value="1.5L">1.5L PET</option>
                <option value="2.25L">2.25L PET</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-[#1F2937] block mb-1">Bottle Color Theme</label>
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="color"
                  value={bottleColor}
                  onChange={(e) => setBottleColor(e.target.value)}
                  className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                />
                <span className="font-mono text-xs">{bottleColor}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-[#1F2937] block mb-1">Selling Rate (₨ / PET)</label>
              <input
                type="number"
                min="1"
                required
                value={sellingPricePkr}
                onChange={(e) => setSellingPricePkr(Number(e.target.value))}
                className="w-full border border-[#E5E7EB] rounded-lg p-2 font-mono text-right"
              />
            </div>

            <div>
              <label className="font-semibold text-[#1F2937] block mb-1">Purchase Rate (₨ / PET)</label>
              <input
                type="number"
                min="0"
                value={purchasePricePkr}
                onChange={(e) => setPurchasePricePkr(Number(e.target.value))}
                className="w-full border border-[#E5E7EB] rounded-lg p-2 font-mono text-right"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-[#1F2937] block mb-1">Opening Stock (In PET Packs)</label>
            <input
              type="number"
              min="0"
              value={stockPacks}
              onChange={(e) => setStockPacks(Number(e.target.value))}
              className="w-full border border-[#E5E7EB] rounded-lg p-2 font-mono text-right"
            />
          </div>

          <div className="pt-3 border-t border-[#E5E7EB] flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] rounded-lg font-semibold hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#D92D3A] hover:bg-[#B91C2B] text-white rounded-lg font-bold shadow transition"
            >
              Save & Create Button
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
