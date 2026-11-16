// src/types/truckExpense.ts

export interface TruckExpenseEntry {
  id: number;
  truckNumber: string;
  shipmentReference: string;
  date: string;
  totalPacksReceived: number;
  totalExpensesPkr: number;
  fuelExpensesPkr: number;
  driverExpensesPkr: number;
  unloadingLaborPkr: number;
  otherExpensesPkr: number;
  expensePerPackPkr: number; // automatically totalExpenses / totalPacks
  notes?: string;
  createdAt: string;
}

export const INITIAL_TRUCK_EXPENSES: TruckExpenseEntry[] = [
  {
    id: 1,
    truckNumber: "TK-4820",
    shipmentReference: "PUR-2026-001",
    date: "2026-11-15",
    totalPacksReceived: 175,
    totalExpensesPkr: 3500,
    fuelExpensesPkr: 2000,
    driverExpensesPkr: 800,
    unloadingLaborPkr: 500,
    otherExpensesPkr: 200,
    expensePerPackPkr: 20,
    notes: "Main factory consignment haul",
    createdAt: "2026-11-15T09:00:00Z",
  },
];

const STORAGE_KEY_TRUCK_EXPENSES = "dogar_truck_expenses_v1";

export function loadSavedTruckExpenses(): TruckExpenseEntry[] {
  if (typeof window === "undefined") return INITIAL_TRUCK_EXPENSES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRUCK_EXPENSES);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_TRUCK_EXPENSES;
}

export function saveTruckExpenses(expenses: TruckExpenseEntry[]): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_TRUCK_EXPENSES, JSON.stringify(expenses));
    } catch {
      // ignore
    }
  }
}
