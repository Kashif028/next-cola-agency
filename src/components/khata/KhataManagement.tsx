// src/components/khata/KhataManagement.tsx
import React, { useState, useMemo } from "react";
import {
  KhataAccount,
  KhataTransaction,
  AccountCategory,
  TransactionType,
  loadSavedKhataAccounts,
  saveKhataAccounts,
  loadSavedKhataTransactions,
  saveKhataTransactions,
} from "../../types/khata";
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  Printer,
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Phone,
  MapPin,
  X,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";

export interface KhataManagementProps {
  initialAccountId?: number;
  initialCategory?: string;
  initialAccounts?: KhataAccount[];
  initialTransactions?: KhataTransaction[];
}

export const KhataManagement: React.FC<KhataManagementProps> = ({
  initialAccountId,
  initialCategory,
  initialAccounts,
  initialTransactions,
}) => {
  const [accounts, setAccounts] = useState<KhataAccount[]>(() => initialAccounts || loadSavedKhataAccounts());
  const [transactions, setTransactions] = useState<KhataTransaction[]>(() => initialTransactions || loadSavedKhataTransactions());

  const [categoryFilter, setCategoryFilter] = useState<string>(() => initialCategory || "ALL");
  const [selectedAccountId, setSelectedAccountId] = useState<number>(() => {
    if (initialAccountId) return initialAccountId;
    const accs = initialAccounts || loadSavedKhataAccounts();
    if (initialCategory && initialCategory !== "ALL") {
      const match = accs.find((a) => a.category === initialCategory);
      if (match) return match.id;
    }
    return accs[0]?.id || 1;
  });
  const [searchQuery, setSearchQuery] = useState("");

  // Re-sync on mount if no static initial props passed
  React.useEffect(() => {
    if (!initialAccounts) setAccounts(loadSavedKhataAccounts());
    if (!initialTransactions) setTransactions(loadSavedKhataTransactions());
  }, [initialAccounts, initialTransactions]);

  // Modals state
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<KhataAccount | null>(null);

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txType, setTxType] = useState<TransactionType>("CREDIT"); // default payment received
  const [txAmount, setTxAmount] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txRef, setTxRef] = useState("");

  const [isStatementPrintModalOpen, setIsStatementPrintModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Form state for account creation/editing
  const [accHolder, setAccHolder] = useState("");
  const [accShop, setAccShop] = useState("");
  const [accVillage, setAccVillage] = useState("");
  const [accAddress, setAccAddress] = useState("");
  const [accStreet, setAccStreet] = useState("");
  const [accMobile, setAccMobile] = useState("");
  const [accOpeningDate, setAccOpeningDate] = useState(new Date().toISOString().slice(0, 10));
  const [accOpeningBal, setAccOpeningBal] = useState("0");
  const [accCategory, setAccCategory] = useState<AccountCategory>("RETAILER");
  const [accNotes, setAccNotes] = useState("");

  // Filtered accounts list
  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        a.holderName.toLowerCase().includes(q) ||
        a.shopName.toLowerCase().includes(q) ||
        a.villageName.toLowerCase().includes(q) ||
        a.mobileNumber.includes(q);

      const matchesCat = categoryFilter === "ALL" || a.category === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [accounts, searchQuery, categoryFilter]);

  // Selected account - automatically selects first match if category filter changed
  const currentAccount = useMemo(() => {
    if (categoryFilter !== "ALL") {
      const matched = filteredAccounts.find((a) => a.id === selectedAccountId);
      if (matched) return matched;
      return filteredAccounts[0] || accounts[0];
    }
    return accounts.find((a) => a.id === selectedAccountId) || accounts[0];
  }, [accounts, filteredAccounts, selectedAccountId, categoryFilter]);

  // Account specific transactions sorted date descending
  const accountTransactions = useMemo(() => {
    if (!currentAccount) return [];
    return transactions
      .filter((t) => t.accountId === currentAccount.id)
      .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
  }, [transactions, currentAccount]);

  // Selected Account Financial Breakdown
  const accountFinancials = useMemo(() => {
    if (!currentAccount) {
      return { pastBalance: 0, totalDebits: 0, totalCredits: 0, netBalance: 0 };
    }
    const accTxs = transactions.filter((t) => t.accountId === currentAccount.id);
    const totalDebits = accTxs
      .filter((t) => t.transactionType === "DEBIT")
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalCredits = accTxs
      .filter((t) => t.transactionType === "CREDIT")
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    const pastBalance = currentAccount.openingBalance || 0;
    const netBalance = currentAccount.currentBalance;
    return { pastBalance, totalDebits, totalCredits, netBalance };
  }, [currentAccount, transactions]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: accounts.length,
      SALESMAN: 0,
      RETAILER: 0,
      VILLAGE_KIRAYANA: 0,
      SUPPLIER: 0,
      INDIVIDUAL: 0,
      OTHER: 0,
    };
    for (const acc of accounts) {
      counts[acc.category] = (counts[acc.category] || 0) + 1;
    }
    return counts;
  }, [accounts]);

  // Global KPI Metrics
  const { totalReceivable, totalPayable } = useMemo(() => {
    let rec = 0;
    let pay = 0;
    for (const a of accounts) {
      if (a.currentBalance > 0) rec += a.currentBalance;
      else if (a.currentBalance < 0) pay += Math.abs(a.currentBalance);
    }
    return { totalReceivable: rec, totalPayable: pay };
  }, [accounts]);

  // Open modal to add new account
  const handleOpenAddAccount = () => {
    setEditingAccount(null);
    setAccHolder("");
    setAccShop("");
    setAccVillage("");
    setAccAddress("");
    setAccStreet("");
    setAccMobile("");
    setAccOpeningDate(new Date().toISOString().slice(0, 10));
    setAccOpeningBal("0");
    setAccCategory("RETAILER");
    setAccNotes("");
    setIsAccountModalOpen(true);
  };

  // Open modal to edit account
  const handleOpenEditAccount = (acc: KhataAccount) => {
    setEditingAccount(acc);
    setAccHolder(acc.holderName);
    setAccShop(acc.shopName);
    setAccVillage(acc.villageName);
    setAccAddress(acc.shopAddress);
    setAccStreet(acc.streetArea);
    setAccMobile(acc.mobileNumber);
    setAccOpeningDate(acc.accountOpeningDate);
    setAccOpeningBal(String(acc.openingBalance));
    setAccCategory(acc.category);
    setAccNotes(acc.notes);
    setIsAccountModalOpen(true);
  };

  // Save account (New or Edit)
  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accHolder.trim()) return;

    const opBal = parseFloat(accOpeningBal) || 0;

    if (editingAccount) {
      const updatedAccounts = accounts.map((a) => {
        if (a.id === editingAccount.id) {
          const balDiff = opBal - a.openingBalance;
          return {
            ...a,
            holderName: accHolder.trim(),
            shopName: accShop.trim(),
            villageName: accVillage.trim(),
            shopAddress: accAddress.trim(),
            streetArea: accStreet.trim(),
            mobileNumber: accMobile.trim(),
            accountOpeningDate: accOpeningDate,
            openingBalance: opBal,
            currentBalance: a.currentBalance + balDiff,
            category: accCategory,
            notes: accNotes.trim(),
            updatedAt: new Date().toISOString(),
          };
        }
        return a;
      });
      setAccounts(updatedAccounts);
      saveKhataAccounts(updatedAccounts);
    } else {
      const newId = accounts.length > 0 ? Math.max(...accounts.map((a) => a.id)) + 1 : 1;
      const newAcc: KhataAccount = {
        id: newId,
        holderName: accHolder.trim(),
        shopName: accShop.trim() || accHolder.trim(),
        villageName: accVillage.trim(),
        shopAddress: accAddress.trim(),
        streetArea: accStreet.trim(),
        mobileNumber: accMobile.trim(),
        accountOpeningDate: accOpeningDate,
        openingBalance: opBal,
        currentBalance: opBal,
        category: accCategory,
        notes: accNotes.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updated = [newAcc, ...accounts];
      setAccounts(updated);
      saveKhataAccounts(updated);
      setSelectedAccountId(newId);
    }
    setIsAccountModalOpen(false);
  };

  // Delete account with confirmation
  const handleDeleteAccount = (id: number) => {
    const updated = accounts.filter((a) => a.id !== id);
    setAccounts(updated);
    saveKhataAccounts(updated);
    // Remove transactions
    const updatedTx = transactions.filter((t) => t.accountId !== id);
    setTransactions(updatedTx);
    saveKhataTransactions(updatedTx);
    setDeleteConfirmId(null);
    if (updated.length > 0) setSelectedAccountId(updated[0].id);
  };

  // Open modal to add transaction
  const handleOpenAddTx = (type: TransactionType) => {
    setTxType(type);
    setTxAmount("");
    const defaultDesc =
      currentAccount?.category === "SALESMAN"
        ? (type === "CREDIT" ? "Salesman cash recovery payment (کیش ریکوری)" : "Trip deficit / van balance debit")
        : (type === "CREDIT" ? "Cash Wasooli / Payment Received" : "Goods Sold on Credit");
    setTxDescription(defaultDesc);
    setTxDate(new Date().toISOString().slice(0, 10));
    setTxRef(`REF-${Date.now().toString().slice(-5)}`);
    setIsTxModalOpen(true);
  };

  // Save transaction
  const handleSaveTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccount) return;
    const amountVal = parseFloat(txAmount);
    if (!amountVal || amountVal <= 0) return;

    const prevBal = currentAccount.currentBalance;
    // Debit increases receivable (or decreases payable), Credit decreases receivable (or increases payable)
    const newBal = txType === "DEBIT" ? prevBal + amountVal : prevBal - amountVal;

    const newTxId = transactions.length > 0 ? Math.max(...transactions.map((t) => t.id)) + 1 : 1;
    const newTx: KhataTransaction = {
      id: newTxId,
      accountId: currentAccount.id,
      accountName: `${currentAccount.holderName} (${currentAccount.shopName})`,
      transactionDate: txDate,
      transactionType: txType,
      amount: amountVal,
      paymentReceived: txType === "CREDIT" && currentAccount.category !== "SUPPLIER" ? amountVal : 0,
      paymentGiven: txType === "CREDIT" && currentAccount.category === "SUPPLIER" ? amountVal : 0,
      description:
        txDescription.trim() ||
        (currentAccount.category === "SALESMAN"
          ? (txType === "CREDIT" ? "Salesman cash recovery payment" : "Trip route debit")
          : (txType === "DEBIT" ? "Goods Debit" : "Payment Received")),
      previousBalance: prevBal,
      newBalance: newBal,
      referenceNo: txRef.trim(),
      createdAt: new Date().toISOString(),
    };

    const updatedTxList = [newTx, ...transactions];
    setTransactions(updatedTxList);
    saveKhataTransactions(updatedTxList);

    // Update account balance
    const updatedAccounts = accounts.map((a) =>
      a.id === currentAccount.id ? { ...a, currentBalance: newBal, updatedAt: new Date().toISOString() } : a
    );
    setAccounts(updatedAccounts);
    saveKhataAccounts(updatedAccounts);

    setIsTxModalOpen(false);
  };

  return (
    <div className="space-y-5 font-sans">
      {/* Print Statement Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #khata-print-statement,
          #khata-print-statement * {
            visibility: visible;
          }
          #khata-print-statement {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 10mm;
            background: #ffffff;
            color: #000000;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Top Header & Overview Ribbon */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">KHATA MANAGEMENT</h1>
                <span className="text-xs font-serif font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800" dir="rtl">
                  کھاتہ مینجمنٹ
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Complete Modern Retailer, Village Kiryana & Supplier Ledger System (₨ PKR)
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleOpenAddAccount}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Account (نیا کھاتہ)</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenAddTx("CREDIT")}
              disabled={!currentAccount}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
            >
              <ArrowDownLeft className="w-4 h-4 text-sky-200" />
              <span>
                {currentAccount?.category === "SALESMAN"
                  ? "Record Recovery (ادائیگی وصول کریں)"
                  : "Record Wasooli (وصولی)"}
              </span>
            </button>

            {currentAccount?.category === "SALESMAN" && (
              <button
                type="button"
                onClick={() => handleOpenAddTx("CREDIT")}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
              >
                <DollarSign className="w-4 h-4 text-emerald-200" />
                <span>نیا لین دین (ادائیگی وصول کریں)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleOpenAddTx("DEBIT")}
              disabled={!currentAccount}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
            >
              <ArrowUpRight className="w-4 h-4 text-amber-200" />
              <span>Add Debit / Maal (بنام)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsStatementPrintModalOpen(true)}
              disabled={!currentAccount}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-300 transition disabled:opacity-50"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Print Statement</span>
            </button>
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          <div className="bg-sky-50/70 border border-sky-100 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-sky-800 text-xs font-medium mb-1">
              <span>Total Receivable (واجب الوصول)</span>
              <TrendingUp className="w-4 h-4 text-sky-600" />
            </div>
            <div className="text-xl font-bold font-mono text-sky-900">
              ₨ {totalReceivable.toLocaleString()}
            </div>
            <p className="text-[11px] text-sky-700 mt-0.5">Market customer khata debt</p>
          </div>

          <div className="bg-rose-50/70 border border-rose-100 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-rose-800 text-xs font-medium mb-1">
              <span>Total Payable (واجب الادا)</span>
              <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-xl font-bold font-mono text-rose-900">
              ₨ {totalPayable.toLocaleString()}
            </div>
            <p className="text-[11px] text-rose-700 mt-0.5">Factory & supplier dues</p>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-100 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-emerald-800 text-xs font-medium mb-1">
              <span>Registered Accounts</span>
              <Users className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-900">
              {accounts.length}
            </div>
            <p className="text-[11px] text-emerald-700 mt-0.5">Retailers, shops & suppliers</p>
          </div>

          <div className="bg-amber-50/70 border border-amber-100 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-amber-800 text-xs font-medium mb-1">
              <span>Selected Account Balance</span>
              <DollarSign className="w-4 h-4 text-amber-600" />
            </div>
            <div className={`text-xl font-bold font-mono ${currentAccount && currentAccount.currentBalance > 0 ? "text-sky-900" : "text-emerald-900"}`}>
              ₨ {currentAccount ? currentAccount.currentBalance.toLocaleString() : 0}
            </div>
            <p className="text-[11px] text-amber-700 mt-0.5 truncate">
              {currentAccount ? currentAccount.shopName : "None"}
            </p>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Accounts Explorer (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3 flex flex-col max-h-[820px]">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search account, shop, village, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          {/* Filter Pill Tabs with Badges */}
          <div className="flex space-x-1 overflow-x-auto text-[11px] pb-1">
            {[
              { key: "ALL", label: "All Accounts", urdu: "تمام" },
              { key: "SALESMAN", label: "Salesman", urdu: "سیلز مین" },
              { key: "RETAILER", label: "Retailer", urdu: "شاپ کیپر" },
              { key: "VILLAGE_KIRAYANA", label: "Village Kiryana", urdu: "دیہاتی دکان" },
              { key: "SUPPLIER", label: "Supplier", urdu: "سپلائر" },
              { key: "INDIVIDUAL", label: "Individual", urdu: "فرد" },
              { key: "OTHER", label: "Other", urdu: "دیگر" },
            ].map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategoryFilter(cat.key)}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition flex items-center space-x-1 ${
                  categoryFilter === cat.key
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-[10px] opacity-75 font-serif" dir="rtl">({cat.urdu})</span>
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    categoryFilter === cat.key ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {categoryCounts[cat.key] || 0}
                </span>
              </button>
            ))}
          </div>

          {/* Accounts List */}
          <div className="overflow-y-auto space-y-2 flex-1 pr-1">
            {filteredAccounts.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No accounts found matching search.
              </div>
            ) : (
              filteredAccounts.map((acc) => {
                const isSelected = currentAccount?.id === acc.id;
                const isReceivable = acc.currentBalance > 0;
                const isPayable = acc.currentBalance < 0;

                return (
                  <div
                    key={acc.id}
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between ${
                      isSelected
                        ? "bg-emerald-50/80 border-emerald-400 shadow-sm"
                        : "bg-white hover:bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <div className="font-bold text-xs text-slate-900 leading-tight">
                          {acc.shopName || acc.holderName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {acc.holderName} {acc.villageName ? `• ${acc.villageName}` : ""}
                        </div>
                        {acc.mobileNumber && (
                          <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                            <Phone className="w-3 h-3" />
                            <span>{acc.mobileNumber}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <span
                          className={`text-xs font-mono font-bold block ${
                            isReceivable
                              ? "text-sky-700"
                              : isPayable
                              ? "text-rose-700"
                              : "text-slate-500"
                          }`}
                        >
                          ₨ {Math.abs(acc.currentBalance).toLocaleString()}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400">
                          {isReceivable ? "Baqaya (Due)" : isPayable ? "Payable" : "NIL"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Ledger Statement & Detailed History (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {currentAccount ? (
            <>
              {/* Account Profile Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-lg font-bold text-slate-900">{currentAccount.shopName}</h2>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {currentAccount.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Owner: <span className="font-semibold text-slate-700">{currentAccount.holderName}</span>
                    </p>
                  </div>

                  {/* Actions for current account */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditAccount(currentAccount)}
                      className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                      title="Edit Account Information"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(currentAccount.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Delete Account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Special Salesman Account Notice Banner */}
                {currentAccount.category === "SALESMAN" && (
                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-sky-900 font-semibold">
                      <Users className="w-4 h-4 text-sky-600" />
                      <span>Salesman Van Delivery Ledger — Linked with Morning Loading & Evening Settlements</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-200 text-sky-800" dir="rtl">
                        سیلز مین کھاتہ
                      </span>
                    </div>
                    <span className="text-[11px] text-sky-700 font-mono">Beat Route Account #{currentAccount.id}</span>
                  </div>
                )}

                {/* Account Financials & Balance Summary Ribbon */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Past / Opening Balance</span>
                    <div className="font-mono font-bold text-slate-800 text-sm">
                      ₨ {accountFinancials.pastBalance.toLocaleString()}
                    </div>
                    <span className="text-[10px] text-slate-400 font-serif" dir="rtl">سابقہ بقایا</span>
                  </div>

                  <div className="bg-amber-50/70 border border-amber-200/70 p-3 rounded-xl space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-amber-700 block">Total Debits</span>
                    <div className="font-mono font-bold text-amber-900 text-sm">
                      ₨ {accountFinancials.totalDebits.toLocaleString()}
                    </div>
                    <span className="text-[10px] text-amber-600 font-serif" dir="rtl">کل بنام / ترسیل مال</span>
                  </div>

                  <div className="bg-emerald-50/70 border border-emerald-200/70 p-3 rounded-xl space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Total Credits / Recovery</span>
                    <div className="font-mono font-bold text-emerald-900 text-sm">
                      ₨ {accountFinancials.totalCredits.toLocaleString()}
                    </div>
                    <span className="text-[10px] text-emerald-600 font-serif" dir="rtl">کل جمع / وصولی</span>
                  </div>

                  <div className="bg-sky-50 border border-sky-200 p-3 rounded-xl space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-sky-800 block">Net Outstanding Balance</span>
                    <div
                      className={`font-mono font-bold text-base ${
                        accountFinancials.netBalance > 0 ? "text-sky-900" : "text-emerald-900"
                      }`}
                    >
                      ₨ {accountFinancials.netBalance.toLocaleString()}
                    </div>
                    <span className="text-[10px] text-sky-700 font-serif" dir="rtl">خالص واجب الادا بقایا</span>
                  </div>
                </div>

                {/* Account Metadata Details */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-600 pt-1">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Village / Town / Route</span>
                    <div className="font-medium text-slate-800">{currentAccount.villageName || "Not provided"}</div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Mobile Phone</span>
                    <div className="font-medium text-slate-800">{currentAccount.mobileNumber || "Not provided"}</div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Account Opening Date</span>
                    <div className="font-mono text-slate-700">{currentAccount.accountOpeningDate}</div>
                  </div>
                </div>

                {currentAccount.shopAddress && (
                  <div className="text-xs text-slate-500 flex items-center space-x-1.5 pt-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{currentAccount.shopAddress} {currentAccount.streetArea ? `, ${currentAccount.streetArea}` : ""}</span>
                  </div>
                )}

                {/* Quick Transaction Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleOpenAddTx("CREDIT")}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-sm transition active:scale-95"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5 text-sky-200" />
                    <span>
                      {currentAccount.category === "SALESMAN"
                        ? "Record Recovery (ادائیگی وصول کریں / نیا لین دین)"
                        : "Record Wasooli (رقم وصولی)"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenAddTx("DEBIT")}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition active:scale-95"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 text-amber-600" />
                    <span>Add Debit / Bill (بنام اندراج)</span>
                  </button>
                </div>
              </div>

              {/* Transactions Ledger Table */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Date-wise Transaction Ledger ({accountTransactions.length} Entries)
                    </h3>
                  </div>
                  <div className="text-xs text-slate-400">
                    Debit = Maal / Bill • Credit = Wasooli / Payment
                  </div>
                </div>

                {accountTransactions.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    No transactions recorded for this account yet. Click "Record Wasooli" or "Add Debit" above.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-3 w-28">Date</th>
                          <th className="p-3">Description / Narration</th>
                          <th className="p-3 w-24">Ref #</th>
                          <th className="p-3 w-28 text-right text-amber-700">Debit (بنام)</th>
                          <th className="p-3 w-28 text-right text-emerald-700">Credit (جمع)</th>
                          <th className="p-3 w-32 text-right">Balance (بقایا)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {accountTransactions.map((tx) => {
                          const isDebit = tx.transactionType === "DEBIT";
                          return (
                            <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                              <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                                {tx.transactionDate}
                              </td>
                              <td className="p-3 text-slate-800 font-medium">
                                {tx.description}
                              </td>
                              <td className="p-3 font-mono text-slate-400 text-[11px]">
                                {tx.referenceNo || "—"}
                              </td>
                              <td className="p-3 text-right font-mono font-semibold text-amber-800">
                                {isDebit ? `₨ ${tx.amount.toLocaleString()}` : "—"}
                              </td>
                              <td className="p-3 text-right font-mono font-semibold text-emerald-800">
                                {!isDebit ? `₨ ${tx.amount.toLocaleString()}` : "—"}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900">
                                ₨ {tx.newBalance.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
              Please select or create an account from the left pane.
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Add / Edit Account Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-100 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800">
                {editingAccount ? "Edit Account (کھاتہ تبدیل کریں)" : "Create New Khata Account (نیا کھاتہ کھولیں)"}
              </h3>
              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Account Holder Name *</label>
                  <input
                    type="text"
                    required
                    value={accHolder}
                    onChange={(e) => setAccHolder(e.target.value)}
                    placeholder="e.g. Haji Muhammad Akram"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:border-emerald-500 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Retailer / Shop Name</label>
                  <input
                    type="text"
                    value={accShop}
                    onChange={(e) => setAccShop(e.target.value)}
                    placeholder="e.g. Bismillah Kiryana Store"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:border-emerald-500 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Village / Town Name</label>
                  <input
                    type="text"
                    value={accVillage}
                    onChange={(e) => setAccVillage(e.target.value)}
                    placeholder="e.g. Chak 72/NP"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Mobile Phone Number</label>
                  <input
                    type="text"
                    value={accMobile}
                    onChange={(e) => setAccMobile(e.target.value)}
                    placeholder="e.g. 0300-1234567"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Account Category</label>
                  <select
                    value={accCategory}
                    onChange={(e) => setAccCategory(e.target.value as AccountCategory)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:border-emerald-500"
                  >
                    <option value="RETAILER">Retailer (شاپ کیپر)</option>
                    <option value="SALESMAN">Salesman (سیلز مین)</option>
                    <option value="VILLAGE_KIRAYANA">Village Kiryana (دیہاتی دکان)</option>
                    <option value="SUPPLIER">Factory / Supplier (سپلائر)</option>
                    <option value="INDIVIDUAL">Individual / Staff (فرد)</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Opening Balance (₨)</label>
                  <input
                    type="number"
                    step="any"
                    value={accOpeningBal}
                    onChange={(e) => setAccOpeningBal(e.target.value)}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:border-emerald-500 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Shop Address</label>
                  <input
                    type="text"
                    value={accAddress}
                    onChange={(e) => setAccAddress(e.target.value)}
                    placeholder="e.g. Station Bazar, Shop #12"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Street / Area</label>
                  <input
                    type="text"
                    value={accStreet}
                    onChange={(e) => setAccStreet(e.target.value)}
                    placeholder="e.g. Main Market Gate"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">Account Notes / Instructions</label>
                <textarea
                  rows={2}
                  value={accNotes}
                  onChange={(e) => setAccNotes(e.target.value)}
                  placeholder="e.g. Weekly supply schedule, special discount, credit limits..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow"
                >
                  {editingAccount ? "Save Changes" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Record Transaction Modal (Wasooli / Debit) */}
      {isTxModalOpen && currentAccount && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-slate-100 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-800">
                  {txType === "CREDIT" ? "Record Payment / Wasooli (رقم وصولی)" : "Add Debit / Bill Amount (بنام رقم)"}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Account: <span className="font-semibold text-slate-700">{currentAccount.shopName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTx} className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">Amount (رقم ₨) *</label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  autoFocus
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="e.g. 25000"
                  className="w-full bg-slate-50 border-2 border-emerald-500/80 rounded-xl p-2.5 text-lg font-mono font-bold text-emerald-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Transaction Date</label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Reference / Voucher #</label>
                  <input
                    type="text"
                    value={txRef}
                    onChange={(e) => setTxRef(e.target.value)}
                    placeholder="e.g. REC-1082"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">Description / Narration</label>
                <input
                  type="text"
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  placeholder="e.g. Cash collected from shop or Bank Raast transfer"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Balance:</span>
                  <span className="font-mono font-semibold">₨ {currentAccount.currentBalance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800">
                  <span>New Balance After Entry:</span>
                  <span className="font-mono text-emerald-700">
                    ₨ {(
                      txType === "DEBIT"
                        ? currentAccount.currentBalance + (parseFloat(txAmount) || 0)
                        : currentAccount.currentBalance - (parseFloat(txAmount) || 0)
                    ).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Print Statement Modal */}
      {isStatementPrintModalOpen && currentAccount && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-300 max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[95vh] no-print">
            <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800">
                Ledger Statement — {currentAccount.shopName}
              </h3>
              <button
                type="button"
                onClick={() => setIsStatementPrintModalOpen(false)}
                className="text-slate-500 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Document Preview */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              <div
                id="khata-print-statement"
                className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm text-slate-900 font-sans text-xs space-y-4"
              >
                {/* Header */}
                <div className="text-center border-b border-slate-300 pb-3 space-y-0.5">
                  <div className="text-lg font-bold text-slate-900 font-serif" dir="rtl">
                    ڈوگر ٹریڈرز
                  </div>
                  <div className="text-sm font-bold uppercase tracking-wider text-slate-900">
                    DOGAR TRADERS
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Official Khata & Ledger Statement (کھاتہ اسٹیٹمنٹ)
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Generated: {new Date().toLocaleDateString("en-GB")} {new Date().toLocaleTimeString()}
                  </div>
                </div>

                {/* Account Details Box */}
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Account / Shop:</span>
                    <span className="font-bold text-slate-900">{currentAccount.shopName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Account Holder:</span>
                    <span className="font-semibold text-slate-900">{currentAccount.holderName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Village / Address:</span>
                    <span className="text-slate-800">{currentAccount.villageName || currentAccount.shopAddress || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Mobile Phone:</span>
                    <span className="font-mono text-slate-800">{currentAccount.mobileNumber || "—"}</span>
                  </div>
                </div>

                {/* Ledger Transactions Table */}
                <table className="w-full text-left text-[11px] border border-slate-200">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2 w-20">Date</th>
                      <th className="p-2">Description</th>
                      <th className="p-2 w-20 text-right">Debit (₨)</th>
                      <th className="p-2 w-20 text-right">Credit (₨)</th>
                      <th className="p-2 w-24 text-right">Balance (₨)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    <tr className="bg-slate-50/50">
                      <td className="p-2 text-slate-500">{currentAccount.accountOpeningDate}</td>
                      <td className="p-2 text-slate-600 font-sans">Opening Balance</td>
                      <td className="p-2 text-right">{currentAccount.openingBalance > 0 ? currentAccount.openingBalance.toLocaleString() : "—"}</td>
                      <td className="p-2 text-right">{currentAccount.openingBalance < 0 ? Math.abs(currentAccount.openingBalance).toLocaleString() : "—"}</td>
                      <td className="p-2 text-right font-bold text-slate-900">{currentAccount.openingBalance.toLocaleString()}</td>
                    </tr>
                    {accountTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="p-2 text-slate-600">{tx.transactionDate}</td>
                        <td className="p-2 text-slate-800 font-sans">{tx.description}</td>
                        <td className="p-2 text-right text-amber-900">
                          {tx.transactionType === "DEBIT" ? tx.amount.toLocaleString() : "—"}
                        </td>
                        <td className="p-2 text-right text-emerald-900">
                          {tx.transactionType === "CREDIT" ? tx.amount.toLocaleString() : "—"}
                        </td>
                        <td className="p-2 text-right font-bold text-slate-900">
                          {tx.newBalance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Final Balance Summary Box */}
                <div className="p-3 bg-slate-100 rounded-lg flex items-center justify-between font-bold text-sm">
                  <span>Current Outstanding Balance (بقایا رقم):</span>
                  <span className="font-mono text-emerald-800">
                    ₨ {currentAccount.currentBalance.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsStatementPrintModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center space-x-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow"
              >
                <Printer className="w-4 h-4" />
                <span>Print Ledger</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Delete */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-5 shadow-2xl space-y-3">
            <h4 className="font-bold text-sm text-slate-900">Confirm Delete Account</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this account? All associated transaction history will be permanently deleted.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteAccount(deleteConfirmId)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
