// src/types/products.ts

export interface BottleSizeConfig {
  id: string;
  sizeLabel: string; // e.g. "2250 ML", "1500 ML", "750 ML", "300 ML"
  sizeMl: number;
  bottlesPerPack: number;
  isStandardPet: boolean;
}

export interface ProductItem {
  id: number;
  sku: string;
  name: string; // e.g. "Cola Next", "Fizz Up"
  category: "Cold Drink (PET)" | "Cold Drink (RGB)" | "Cold Drink (Can)" | "Juices" | "Mineral Water" | "Other";
  sizeLabel: string; // e.g. "2250 ML"
  sizeMl: number;
  bottlesPerPack: number;
  wholesalePackPricePaisa: number; // e.g. 120000 -> ₨ 1,200
  retailPackPricePaisa: number;
  purchasePackPricePaisa: number;
  stockPacks: number; // Stored and displayed strictly in PACKS
  requiresCrate: boolean;
  notes?: string;
}

export const INITIAL_BOTTLE_SIZES: BottleSizeConfig[] = [
  { id: "size-2250", sizeLabel: "2250 ML", sizeMl: 2250, bottlesPerPack: 4, isStandardPet: true },
  { id: "size-1500", sizeLabel: "1500 ML", sizeMl: 1500, bottlesPerPack: 6, isStandardPet: true },
  { id: "size-750", sizeLabel: "750 ML", sizeMl: 750, bottlesPerPack: 6, isStandardPet: true },
  { id: "size-300", sizeLabel: "300 ML", sizeMl: 300, bottlesPerPack: 12, isStandardPet: true },
];

export const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: 1,
    sku: "CN-2250-PET",
    name: "Cola Next",
    category: "Cold Drink (PET)",
    sizeLabel: "2250 ML",
    sizeMl: 2250,
    bottlesPerPack: 4,
    purchasePackPricePaisa: 96000,
    wholesalePackPricePaisa: 108000,
    retailPackPricePaisa: 120000,
    stockPacks: 250,
    requiresCrate: false,
  },
  {
    id: 2,
    sku: "CN-1500-PET",
    name: "Cola Next",
    category: "Cold Drink (PET)",
    sizeLabel: "1500 ML",
    sizeMl: 1500,
    bottlesPerPack: 6,
    purchasePackPricePaisa: 92000,
    wholesalePackPricePaisa: 105000,
    retailPackPricePaisa: 120000,
    stockPacks: 320,
    requiresCrate: false,
  },
  {
    id: 3,
    sku: "CN-750-PET",
    name: "Cola Next",
    category: "Cold Drink (PET)",
    sizeLabel: "750 ML",
    sizeMl: 750,
    bottlesPerPack: 6,
    purchasePackPricePaisa: 65000,
    wholesalePackPricePaisa: 75000,
    retailPackPricePaisa: 84000,
    stockPacks: 180,
    requiresCrate: false,
  },
  {
    id: 4,
    sku: "CN-300-PET",
    name: "Cola Next",
    category: "Cold Drink (PET)",
    sizeLabel: "300 ML",
    sizeMl: 300,
    bottlesPerPack: 12,
    purchasePackPricePaisa: 110000,
    wholesalePackPricePaisa: 126000,
    retailPackPricePaisa: 144000,
    stockPacks: 400,
    requiresCrate: false,
  },
  {
    id: 5,
    sku: "FZ-2250-PET",
    name: "Fizz Up",
    category: "Cold Drink (PET)",
    sizeLabel: "2250 ML",
    sizeMl: 2250,
    bottlesPerPack: 4,
    purchasePackPricePaisa: 96000,
    wholesalePackPricePaisa: 108000,
    retailPackPricePaisa: 120000,
    stockPacks: 190,
    requiresCrate: false,
  },
  {
    id: 6,
    sku: "FZ-1500-PET",
    name: "Fizz Up",
    category: "Cold Drink (PET)",
    sizeLabel: "1500 ML",
    sizeMl: 1500,
    bottlesPerPack: 6,
    purchasePackPricePaisa: 92000,
    wholesalePackPricePaisa: 105000,
    retailPackPricePaisa: 120000,
    stockPacks: 220,
    requiresCrate: false,
  },
  {
    id: 7,
    sku: "FZ-750-PET",
    name: "Fizz Up",
    category: "Cold Drink (PET)",
    sizeLabel: "750 ML",
    sizeMl: 750,
    bottlesPerPack: 6,
    purchasePackPricePaisa: 65000,
    wholesalePackPricePaisa: 75000,
    retailPackPricePaisa: 84000,
    stockPacks: 150,
    requiresCrate: false,
  },
  {
    id: 8,
    sku: "FZ-300-PET",
    name: "Fizz Up",
    category: "Cold Drink (PET)",
    sizeLabel: "300 ML",
    sizeMl: 300,
    bottlesPerPack: 12,
    purchasePackPricePaisa: 110000,
    wholesalePackPricePaisa: 126000,
    retailPackPricePaisa: 144000,
    stockPacks: 280,
    requiresCrate: false,
  },
  {
    id: 9,
    sku: "JC-MANGO-250",
    name: "Mango Juice",
    category: "Juices",
    sizeLabel: "250 ML",
    sizeMl: 250,
    bottlesPerPack: 24,
    purchasePackPricePaisa: 150000,
    wholesalePackPricePaisa: 175000,
    retailPackPricePaisa: 192000,
    stockPacks: 120,
    requiresCrate: false,
    notes: "Custom Juice Pack",
  },
  {
    id: 10,
    sku: "JC-APPLE-250",
    name: "Apple Juice",
    category: "Juices",
    sizeLabel: "250 ML",
    sizeMl: 250,
    bottlesPerPack: 24,
    purchasePackPricePaisa: 150000,
    wholesalePackPricePaisa: 175000,
    retailPackPricePaisa: 192000,
    stockPacks: 95,
    requiresCrate: false,
    notes: "Custom Juice Pack",
  },
];

const STORAGE_KEY_PRODUCTS = "dogar_products_v1";
const STORAGE_KEY_SIZES = "dogar_sizes_v1";

export function loadSavedBottleSizes(): BottleSizeConfig[] {
  if (typeof window === "undefined") return INITIAL_BOTTLE_SIZES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SIZES);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_BOTTLE_SIZES;
}

export function saveBottleSizes(sizes: BottleSizeConfig[]): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_SIZES, JSON.stringify(sizes));
    } catch {
      // storage quota or error
    }
  }
}

export function loadSavedProducts(): ProductItem[] {
  if (typeof window === "undefined") return INITIAL_PRODUCTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRODUCTS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_PRODUCTS;
}

export function saveProducts(products: ProductItem[]): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
    } catch {
      // error
    }
  }
}
