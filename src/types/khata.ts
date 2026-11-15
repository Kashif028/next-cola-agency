// src/types/khata.ts

export type AccountCategory = "RETAILER" | "SUPPLIER" | "VILLAGE_KIRAYANA" | "INDIVIDUAL" | "OTHER";
export type TransactionType = "DEBIT" | "CREDIT";

export interface KhataAccount {
  id: number;
  holderName: string; // Account Holder Name
  shopName: string; // Retailer / Shop Name
  villageName: string; // Village Name
  shopAddress: string; // Shop Address
  streetArea: string; // Street / Area
  mobileNumber: string; // Mobile Number
  accountOpeningDate: string; // YYYY-MM-DD
  openingBalance: number; // Previous Balance at start (positive = receivable, negative = payable)
  currentBalance: number; // Current calculated balance
  category: AccountCategory;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface KhataTransaction {
  id: number;
  accountId: number;
  accountName: string;
  transactionDate: string; // YYYY-MM-DD
  transactionType: TransactionType; // DEBIT (e.g. goods supplied / amount due) or CREDIT (e.g. payment received)
  amount: number; // In Rupees
  paymentReceived: number; // When customer pays
  paymentGiven: number; // When agency pays supplier
  description: string;
  previousBalance: number;
  newBalance: number;
  referenceNo?: string;
  createdAt: string;
}

const STORAGE_ACCOUNTS = "dogar_khata_accounts_v1";
const STORAGE_TRANSACTIONS = "dogar_khata_transactions_v1";

export const INITIAL_KHATA_ACCOUNTS: KhataAccount[] = [
  {
    id: 1,
    holderName: "Muhammad Akram",
    shopName: "Bismillah Kiryana Store",
    villageName: "Chak 72/NP",
    shopAddress: "Main Chowk, Adda Pull",
    streetArea: "Bypass Road",
    mobileNumber: "0300-1234567",
    accountOpeningDate: "2026-01-10",
    openingBalance: 15000,
    currentBalance: 45000,
    category: "RETAILER",
    notes: "Regular retailer, delivers every Tuesday & Friday",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-11-12T14:30:00Z",
  },
  {
    id: 2,
    holderName: "Haji Abdul Sattar",
    shopName: "Madina Super Store",
    villageName: "Kot Samaba",
    shopAddress: "Station Bazar, Shop #12",
    streetArea: "Market Gate",
    mobileNumber: "0301-7654321",
    accountOpeningDate: "2026-02-15",
    openingBalance: 0,
    currentBalance: 12000,
    category: "RETAILER",
    notes: "High volume cold drink distributor customer",
    createdAt: "2026-02-15T10:00:00Z",
    updatedAt: "2026-11-13T16:00:00Z",
  },
  {
    id: 3,
    holderName: "Rehman Ullah",
    shopName: "Al-Rehman Cold Corner",
    villageName: "Sadiqabad",
    shopAddress: "Near General Bus Stand",
    streetArea: "Commercial Zone",
    mobileNumber: "0302-9876543",
    accountOpeningDate: "2026-03-01",
    openingBalance: 20000,
    currentBalance: 68000,
    category: "VILLAGE_KIRAYANA",
    notes: "Takes PET packs, weekly cash recovery",
    createdAt: "2026-03-01T09:00:00Z",
    updatedAt: "2026-11-14T11:00:00Z",
  },
  {
    id: 4,
    holderName: "Tariq Mehmood",
    shopName: "Next Beverages Plant (Supplier)",
    villageName: "Multan Industrial Area",
    shopAddress: "Plot 45, Phase II",
    streetArea: "Industrial Estate",
    mobileNumber: "0305-1122334",
    accountOpeningDate: "2026-01-01",
    openingBalance: -150000,
    currentBalance: -85000, // Negative = Payable
    category: "SUPPLIER",
    notes: "Next Cola factory consignment supplier",
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-11-10T12:00:00Z",
  },
];

export const INITIAL_KHATA_TRANSACTIONS: KhataTransaction[] = [
  {
    id: 101,
    accountId: 1,
    accountName: "Muhammad Akram (Bismillah Kiryana)",
    transactionDate: "2026-11-10",
    transactionType: "DEBIT",
    amount: 50000,
    paymentReceived: 0,
    paymentGiven: 0,
    description: "Inv #INV-2601 - 50 Pk Cola Next 1.5L Supplied",
    previousBalance: 15000,
    newBalance: 65000,
    referenceNo: "INV-2601",
    createdAt: "2026-11-10T10:15:00Z",
  },
  {
    id: 102,
    accountId: 1,
    accountName: "Muhammad Akram (Bismillah Kiryana)",
    transactionDate: "2026-11-12",
    transactionType: "CREDIT",
    amount: 20000,
    paymentReceived: 20000,
    paymentGiven: 0,
    description: "Cash recovery payment received at counter",
    previousBalance: 65000,
    newBalance: 45000,
    referenceNo: "REC-1089",
    createdAt: "2026-11-12T14:30:00Z",
  },
  {
    id: 103,
    accountId: 2,
    accountName: "Haji Abdul Sattar (Madina Super Store)",
    transactionDate: "2026-11-11",
    transactionType: "DEBIT",
    amount: 32000,
    paymentReceived: 0,
    paymentGiven: 0,
    description: "Inv #INV-2604 - 25 Pk 2250ML Supplied",
    previousBalance: 0,
    newBalance: 32000,
    referenceNo: "INV-2604",
    createdAt: "2026-11-11T12:00:00Z",
  },
  {
    id: 104,
    accountId: 2,
    accountName: "Haji Abdul Sattar (Madina Super Store)",
    transactionDate: "2026-11-13",
    transactionType: "CREDIT",
    amount: 20000,
    paymentReceived: 20000,
    paymentGiven: 0,
    description: "Bank Raast transfer payment received",
    previousBalance: 32000,
    newBalance: 12000,
    referenceNo: "RAAST-9821",
    createdAt: "2026-11-13T16:00:00Z",
  },
  {
    id: 105,
    accountId: 4,
    accountName: "Tariq Mehmood (Next Beverages Plant)",
    transactionDate: "2026-11-10",
    transactionType: "CREDIT",
    amount: 65000,
    paymentReceived: 0,
    paymentGiven: 65000,
    description: "Cheque payment issued to factory consignment",
    previousBalance: -150000,
    newBalance: -85000,
    referenceNo: "CHQ-8820",
    createdAt: "2026-11-10T12:00:00Z",
  },
];

export function loadSavedKhataAccounts(): KhataAccount[] {
  if (typeof window === "undefined") return INITIAL_KHATA_ACCOUNTS;
  try {
    const raw = localStorage.getItem(STORAGE_ACCOUNTS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_KHATA_ACCOUNTS;
}

export function saveKhataAccounts(accounts: KhataAccount[]): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_ACCOUNTS, JSON.stringify(accounts));
    } catch {
      // storage error
    }
  }
}

export function loadSavedKhataTransactions(): KhataTransaction[] {
  if (typeof window === "undefined") return INITIAL_KHATA_TRANSACTIONS;
  try {
    const raw = localStorage.getItem(STORAGE_TRANSACTIONS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_KHATA_TRANSACTIONS;
}

export function saveKhataTransactions(transactions: KhataTransaction[]): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_TRANSACTIONS, JSON.stringify(transactions));
    } catch {
      // error
    }
  }
}
