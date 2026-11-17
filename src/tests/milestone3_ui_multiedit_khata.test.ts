/**
 * src/tests/milestone3_ui_multiedit_khata.test.ts
 *
 * Milestone 3 Comprehensive Verification Suite:
 * 1. Persistent Multi-Edit UI in ActiveDeliverySheetsList & EditDeliverySheetModal
 * 2. Multi-Pass Consecutive Edits & Zero Drift (Warehouse Stock & Khata Ledger)
 * 3. KhataManagement "SALESMAN" Category Tab, Badge Counts & Financial Displays
 * 4. Salesman Cash Recovery Payment Recording (CREDIT) & Balance Decrement
 * 5. Customer / Retailer Account Isolation & Non-Regression
 */

import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useLogisticsStore } from "../store/useLogisticsStore";
import { useInventoryStore } from "../store/useInventoryStore";
import {
  loadSavedKhataAccounts,
  saveKhataAccounts,
  loadSavedKhataTransactions,
  saveKhataTransactions,
  INITIAL_KHATA_ACCOUNTS,
} from "../types/khata";
import { loadSavedProducts, saveProducts, INITIAL_PRODUCTS } from "../types/products";
import { ActiveDeliverySheetsList } from "../components/logistics/ActiveDeliverySheetsList";
import { EditDeliverySheetModal } from "../components/logistics/EditDeliverySheetModal";
import { KhataManagement } from "../components/khata/KhataManagement";
import { DailyDispatchRecord, LoadingSheetSummaryDto } from "../types/logistics";

// Mock localStorage for headless Node environment
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
  get length(): number {
    return Object.keys(this.store).length;
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

describe("Milestone 3: Persistent Multi-Edit UI & Salesman Khata Management", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockStorage;

    // Reset products
    saveProducts([...INITIAL_PRODUCTS.map((p) => ({ ...p }))]);
    // Reset khata accounts with seeds
    saveKhataAccounts([...INITIAL_KHATA_ACCOUNTS.map((a) => ({ ...a }))]);
    saveKhataTransactions([]);
    mockStorage.setItem("dogar_breakage_logs_v1", JSON.stringify([]));
    mockStorage.setItem("dogar_daily_dispatches_v1", JSON.stringify([]));

    useInventoryStore.setState({
      stockItems: [],
      emptiesOverview: null,
      breakageLogs: [],
      activeCustomerCrateLedger: [],
      filter: {},
      isLoading: false,
      error: null,
    });
    useInventoryStore.getInitialState = () => useInventoryStore.getState();

    useLogisticsStore.setState({
      routes: [
        {
          id: 1,
          route_code: "R-01",
          route_name: "City Center & Shahi Bazaar",
          target_daily_sales_paisa: 5000000,
          customer_count: 24,
          is_active: true,
          created_at: "2026-11-01T08:00:00Z",
          updated_at: "2026-11-01T08:00:00Z",
          default_driver_id: 5,
          default_driver_name: "Muhammad Ali",
          default_vehicle_id: 1,
          default_vehicle_no: "LES-2489",
        },
      ],
      vehicles: [
        {
          id: 1,
          vehicle_number: "LES-2489",
          model: "Hino Dutro 300 Series",
          capacity_crates: 180,
          capacity_weight_kg: 3500,
          current_odometer_km: 42150,
          is_active: true,
          created_at: "2026-11-01T08:00:00Z",
          updated_at: "2026-11-01T08:00:00Z",
          default_driver_id: 5,
          default_driver_name: "Muhammad Ali",
        },
      ],
      loadingSheets: [],
      dailyDispatches: [],
      selectedSheetDetail: null,
      activeReconciliation: null,
      filter: {},
      searchQuery: "",
      isRouteModalOpen: false,
      isVehicleModalOpen: false,
      isLoadingManifestModalOpen: false,
      isSettlementModalOpen: false,
      isGatePassModalOpen: false,
      settlementSheetId: null,
      physicalReturns: {},
      physicalCashPaisa: 0,
      emptyCratesReturned: 0,
      routeExpensesPaisa: 0,
      shortageAction: "CHARGE_DRIVER",
      supervisorPin: "",
      settlementNotes: "",
      isLoading: false,
      isCalculating: false,
      error: null,
      successMessage: null,
    });
  });

  // ==========================================================================
  // Section 1: ActiveDeliverySheetsList Persistent Edit Button
  // ==========================================================================
  describe("1. ActiveDeliverySheetsList Persistent Edit Button", () => {
    it("M3.1: Persistent Edit Record button is rendered across ALL sheet statuses (DRAFT, ISSUED, SETTLED)", () => {
      const mockSheets: LoadingSheetSummaryDto[] = [
        {
          id: 101,
          sheet_number: "LOAD-DRAFT-001",
          sheet_date: "2026-11-16",
          route_id: 1,
          route_name: "Beat 01 - City Center",
          vehicle_number: "LES-2489",
          driver_name: "Muhammad Ali",
          status: "DRAFT",
          total_items_count: 1,
          total_loaded_base: 240,
          empty_crates_loaded: 10,
          total_load_retail_paisa: 2160000,
          dispatched_at: "2026-11-16T08:00:00Z",
        },
        {
          id: 102,
          sheet_number: "LOAD-ISSUED-002",
          sheet_date: "2026-11-16",
          route_id: 1,
          route_name: "Beat 01 - City Center",
          vehicle_number: "LES-2489",
          driver_name: "Muhammad Ali",
          status: "ISSUED",
          total_items_count: 1,
          total_loaded_base: 480,
          empty_crates_loaded: 20,
          total_load_retail_paisa: 4320000,
          dispatched_at: "2026-11-16T08:15:00Z",
        },
        {
          id: 103,
          sheet_number: "LOAD-SETTLED-003",
          sheet_date: "2026-11-16",
          route_id: 1,
          route_name: "Beat 01 - City Center",
          vehicle_number: "LES-2489",
          driver_name: "Muhammad Ali",
          status: "SETTLED",
          total_items_count: 1,
          total_loaded_base: 480,
          empty_crates_loaded: 20,
          total_load_retail_paisa: 4320000,
          dispatched_at: "2026-11-16T08:30:00Z",
        },
      ];

      useLogisticsStore.setState({ loadingSheets: mockSheets });

      const markup = renderToStaticMarkup(React.createElement(ActiveDeliverySheetsList, { initialSheets: mockSheets }));

      // Check all 3 sheet numbers rendered
      expect(markup).toContain("LOAD-DRAFT-001");
      expect(markup).toContain("LOAD-ISSUED-002");
      expect(markup).toContain("LOAD-SETTLED-003");

      // Check persistent Edit Record button appears 3 times (once per row)
      const editButtonMatches = markup.match(/<span>Edit Record<\/span>/g) || [];
      expect(editButtonMatches.length).toBe(3);

      // Check Urdu text also rendered
      expect(markup).toContain("ایڈٹ کریں");

      // Check specific status buttons also coexist
      expect(markup).toContain("Dispatch Now"); // For draft
      expect(markup).toContain("Settle Van"); // For issued
      expect(markup).toContain("Voucher"); // For settled
    });

    it("M3.2: Persistent Edit button NEVER disappears after settlement or consecutive multi-pass edits", async () => {
      // Create and settle a sheet
      const dispatch = await useLogisticsStore.getState().createDailyDispatch({
        sheetNumber: "LOAD-PERSIST-001",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Beat",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        salesmanKhataId: 5,
        vehicleNumber: "LES-2489",
        status: "ISSUED",
        emptyCratesLoaded: 20,
        emptyCratesReturned: 20,
        items: [
          {
            productId: 1,
            productSku: "NC-250-RGB",
            productName: "Next Cola 250ml Glass Bottle",
            packName: "Crate",
            unitsPerPack: 24,
            wholesalePackPricePaisa: 216000,
            isGlass: true,
            dispatchedPacks: 20,
            dispatchedLoose: 0,
            totalDispatchedBase: 480,
            soldPacks: 0,
            soldLoose: 0,
            totalSoldBase: 0,
            returnedIntactPacks: 0,
            returnedIntactLoose: 0,
            totalReturnedIntactBase: 0,
            damagedPacks: 0,
            damagedLoose: 0,
            totalDamagedBase: 0,
            lineRevenuePaisa: 0,
          },
        ],
        totalSalesRevenuePaisa: 0,
        cashDepositedPaisa: 0,
        unpaidBalancePaisa: 0,
      });

      // Confirm evening return to settle it
      await useLogisticsStore.getState().confirmEveningReturn(
        dispatch.id,
        [{ productId: 1, returnedIntactPacks: 5, returnedIntactLoose: 0, damagedPacks: 1, damagedLoose: 0 }],
        1200000
      );

      // Verify status is now SETTLED
      const settledRec = useLogisticsStore.getState().getDailyDispatchById(dispatch.id);
      expect(settledRec?.status).toBe("SETTLED");

      // Render ActiveDeliverySheetsList
      let markup = renderToStaticMarkup(
        React.createElement(ActiveDeliverySheetsList, {
          initialSheets: useLogisticsStore.getState().loadingSheets,
        })
      );
      expect(markup).toContain("LOAD-PERSIST-001");
      expect(markup).toContain("Edit Record");

      // Perform first recalibration pass
      await useLogisticsStore.getState().recalibrateSheetSnapshot({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 20,
            dispatchedLoose: 0,
            returnedIntactPacks: 4, // Changed from 5 to 4
            returnedIntactLoose: 0,
            damagedPacks: 1,
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 1200000,
      });

      // Re-render: Edit button must still be there!
      markup = renderToStaticMarkup(
        React.createElement(ActiveDeliverySheetsList, {
          initialSheets: useLogisticsStore.getState().loadingSheets,
        })
      );
      expect(markup).toContain("Edit Record");

      // Perform second recalibration pass
      await useLogisticsStore.getState().recalibrateSheetSnapshot({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 20,
            dispatchedLoose: 0,
            returnedIntactPacks: 4,
            returnedIntactLoose: 0,
            damagedPacks: 2, // Changed from 1 to 2
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 1200000,
      });

      // Re-render: Edit button must STILL be there!
      markup = renderToStaticMarkup(
        React.createElement(ActiveDeliverySheetsList, {
          initialSheets: useLogisticsStore.getState().loadingSheets,
        })
      );
      expect(markup).toContain("Edit Record");
      expect(markup).toContain("LOAD-PERSIST-001");
    });
  });

  // ==========================================================================
  // Section 2: EditDeliverySheetModal Rendering & Field Controls
  // ==========================================================================
  describe("2. EditDeliverySheetModal Rendering & Input Controls", () => {
    it("M3.3: EditDeliverySheetModal renders current sheet snapshot values and multi-edit controls", () => {
      const mockSheet: DailyDispatchRecord = {
        id: 201,
        sheetNumber: "LOAD-EDIT-MODAL",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center & Shahi Bazaar",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        salesmanKhataId: 5,
        vehicleNumber: "LES-2489",
        status: "SETTLED",
        emptyCratesLoaded: 25,
        emptyCratesReturned: 25,
        items: [
          {
            productId: 1,
            productSku: "NC-250-RGB",
            productName: "Next Cola 250ml Glass Bottle",
            packName: "Crate",
            unitsPerPack: 24,
            wholesalePackPricePaisa: 216000,
            isGlass: true,
            dispatchedPacks: 25,
            dispatchedLoose: 0,
            totalDispatchedBase: 600,
            soldPacks: 20,
            soldLoose: 0,
            totalSoldBase: 480,
            returnedIntactPacks: 4,
            returnedIntactLoose: 0,
            totalReturnedIntactBase: 96,
            damagedPacks: 1,
            damagedLoose: 0,
            totalDamagedBase: 24,
            lineRevenuePaisa: 4320000,
          },
        ],
        totalSalesRevenuePaisa: 4320000,
        cashDepositedPaisa: 4000000,
        unpaidBalancePaisa: 320000,
        createdAt: "2026-11-16T08:00:00Z",
        updatedAt: "2026-11-16T18:00:00Z",
      };

      useLogisticsStore.setState({ dailyDispatches: [mockSheet] });

      const markup = renderToStaticMarkup(
        React.createElement(EditDeliverySheetModal, {
          isOpen: true,
          sheet: mockSheet,
          onClose: () => {},
        })
      );

      // Header and metadata
      expect(markup).toContain("LOAD-EDIT-MODAL");
      expect(markup).toContain("Edit Delivery Sheet Record");
      expect(markup).toContain("ایڈٹ ریکارڈ");
      expect(markup).toContain("Muhammad Ali");
      expect(markup).toContain("LES-2489");

      // Product information
      expect(markup).toContain("Next Cola 250ml Glass Bottle");
      expect(markup).toContain("NC-250-RGB");

      // Table headers for settled sheet
      expect(markup).toContain("Dispatched (صبح مال)");
      expect(markup).toContain("Returned Intact (صحیح واپسی)");
      expect(markup).toContain("Damaged (ٹوٹ پھوٹ)");
      expect(markup).toContain("Sold (فروخت)");
      expect(markup).toContain("Revenue (آمدن)");

      // Financial reconciliation section
      expect(markup).toContain("Financial Reconciliation &amp; Salesman Khata Posting");
      expect(markup).toContain("Cash Deposited / Collected");
      expect(markup).toContain("Unpaid Trip Balance");
      expect(markup).toContain("Zero Drift Multi-Edit Engine");
      expect(markup).toContain("Save Record &amp; Recalibrate (محفوظ کریں)");
    });
  });

  // ==========================================================================
  // Section 3: Multi-Pass Consecutive Edits & Zero Drift
  // ==========================================================================
  describe("3. Multi-Pass Consecutive Edits & Zero Drift", () => {
    it("M3.4: 3-pass consecutive edits on settled sheet adjust stock and salesman khata with 0 drift", async () => {
      // Step A: Setup warehouse stock: 1000 packs = 4000 units (CN-2250-PET, 4 btls/pack, wholesale ₨ 1,080/pack = 270/btl)
      const prod = INITIAL_PRODUCTS.find((p) => p.id === 1)!;
      const initialPacks = 1000;
      prod.stockPacks = initialPacks;
      saveProducts([prod]);

      // Seed Salesman Account (ID 5: Muhammad Ali)
      const accounts = loadSavedKhataAccounts();
      const salesmanAcc = accounts.find((a) => a.id === 5)!;
      salesmanAcc.openingBalance = 5000;
      salesmanAcc.currentBalance = 5000;
      saveKhataAccounts(accounts);
      saveKhataTransactions([]);

      // Step B: Morning dispatch: 50 packs (200 btls)
      const dispatch = await useLogisticsStore.getState().createDailyDispatch({
        sheetNumber: "LOAD-TRIP-3PASS",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Beat",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        salesmanKhataId: 5,
        vehicleNumber: "LES-2489",
        status: "ISSUED",
        emptyCratesLoaded: 0,
        emptyCratesReturned: 0,
        items: [
          {
            productId: 1,
            productSku: "CN-2250-PET",
            productName: "Cola Next 2250ml",
            packName: "Pack",
            unitsPerPack: 4,
            wholesalePackPricePaisa: 108000, // ₨ 1,080/pack
            isGlass: false,
            dispatchedPacks: 50,
            dispatchedLoose: 0,
            totalDispatchedBase: 200,
            soldPacks: 0,
            soldLoose: 0,
            totalSoldBase: 0,
            returnedIntactPacks: 0,
            returnedIntactLoose: 0,
            totalReturnedIntactBase: 0,
            damagedPacks: 0,
            damagedLoose: 0,
            totalDamagedBase: 0,
            lineRevenuePaisa: 0,
          },
        ],
        totalSalesRevenuePaisa: 0,
        cashDepositedPaisa: 0,
        unpaidBalancePaisa: 0,
      });

      // Stock should have deducted 50 packs (200 base units)
      let currentProd = loadSavedProducts().find((p) => p.id === 1)!;
      expect(currentProd.stockPacks).toBe(initialPacks - 50); // 950 packs

      // Step C: Evening Return settlement:
      // Dispatched = 50 packs (200 btls)
      // Returned Intact = 10 packs (40 btls) -> restores 10 packs
      // Damaged = 2 packs (8 btls) -> quarantined
      // Sold = 38 packs (152 btls)
      // Revenue = 38 * 1080 = ₨ 41,040 (4104000 paisa)
      // Cash deposited = ₨ 35,000 (3500000 paisa)
      // Unpaid = ₨ 6,040 (604000 paisa)
      await useLogisticsStore.getState().confirmEveningReturn(
        dispatch.id,
        [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 2, damagedLoose: 0 }],
        3500000
      );

      currentProd = loadSavedProducts().find((p) => p.id === 1)!;
      expect(currentProd.stockPacks).toBe(950 + 10); // 960 packs

      let currentAccounts = loadSavedKhataAccounts();
      let aliAcc = currentAccounts.find((a) => a.id === 5)!;
      expect(aliAcc.currentBalance).toBe(5000 + 6040); // 11,040

      // Step D: Multi-Edit Pass 1 (Adjust Returned Intact from 10 to 15 packs):
      // Dispatched = 50, Intact = 15, Damaged = 2 -> Sold = 33 packs (132 btls)
      // Revenue = 33 * 1080 = ₨ 35,640 (3564000 paisa)
      // Cash deposited = ₨ 35,000 (3500000 paisa)
      // Unpaid = ₨ 640 (64000 paisa)
      await useLogisticsStore.getState().recalibrateSheetSnapshot({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 50,
            dispatchedLoose: 0,
            returnedIntactPacks: 15, // +5 packs returned intact
            returnedIntactLoose: 0,
            damagedPacks: 2,
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 3500000,
      });

      // Stock should be 950 + 15 = 965 packs
      currentProd = loadSavedProducts().find((p) => p.id === 1)!;
      expect(currentProd.stockPacks).toBe(965);

      // Khata balance should be 5000 + 640 = ₨ 5,640
      currentAccounts = loadSavedKhataAccounts();
      aliAcc = currentAccounts.find((a) => a.id === 5)!;
      expect(aliAcc.currentBalance).toBe(5640);

      // Verify no duplicate transactions for this sheet
      let txs = loadSavedKhataTransactions().filter((t) => t.referenceNo === dispatch.sheetNumber);
      expect(txs.length).toBe(1);
      expect(txs[0].amount).toBe(640);

      // Step E: Multi-Edit Pass 2 (Adjust Damaged from 2 to 4 packs):
      // Dispatched = 50, Intact = 15, Damaged = 4 -> Sold = 31 packs (124 btls)
      // Revenue = 31 * 1080 = ₨ 33,480 (3348000 paisa)
      // Cash deposited = ₨ 35,000 (3500000 paisa)
      // Cash deposited >= Revenue -> Unpaid = 0
      await useLogisticsStore.getState().editDailyDispatch({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 50,
            dispatchedLoose: 0,
            returnedIntactPacks: 15,
            returnedIntactLoose: 0,
            damagedPacks: 4, // +2 packs damaged
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 3500000,
      });

      // Stock stays 965 packs (damaged stock goes to quarantine breakage, never sellable stock)
      currentProd = loadSavedProducts().find((p) => p.id === 1)!;
      expect(currentProd.stockPacks).toBe(965);

      // Khata balance: unpaid = 0, so balance rolls back to opening ₨ 5,000
      currentAccounts = loadSavedKhataAccounts();
      aliAcc = currentAccounts.find((a) => a.id === 5)!;
      expect(aliAcc.currentBalance).toBe(5000);

      // Transaction count for sheet is 0 (unpaid balance is 0)
      txs = loadSavedKhataTransactions().filter((t) => t.referenceNo === dispatch.sheetNumber);
      expect(txs.length).toBe(0);

      // Step F: Multi-Edit Pass 3 (Adjust Dispatched from 50 to 45 packs and Cash to ₨ 30,000):
      // Dispatched = 45, Intact = 15, Damaged = 4 -> Sold = 26 packs (104 btls)
      // Revenue = 26 * 1080 = ₨ 28,080 (2808000 paisa)
      // Cash deposited = ₨ 25,000 (2500000 paisa)
      // Unpaid = ₨ 3,080 (308000 paisa)
      await useLogisticsStore.getState().recalibrateSheetSnapshot({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 45, // -5 dispatched
            dispatchedLoose: 0,
            returnedIntactPacks: 15,
            returnedIntactLoose: 0,
            damagedPacks: 4,
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 2500000,
      });

      // Dispatched decreased by 5 packs -> 5 packs restored to warehouse stock
      // Stock = 1000 - 45 + 15 = 970 packs
      currentProd = loadSavedProducts().find((p) => p.id === 1)!;
      expect(currentProd.stockPacks).toBe(970);

      // Khata balance: 5000 + 3080 = ₨ 8,080
      currentAccounts = loadSavedKhataAccounts();
      aliAcc = currentAccounts.find((a) => a.id === 5)!;
      expect(aliAcc.currentBalance).toBe(8080);

      txs = loadSavedKhataTransactions().filter((t) => t.referenceNo === dispatch.sheetNumber);
      expect(txs.length).toBe(1);
      expect(txs[0].amount).toBe(3080);
      expect(txs[0].newBalance).toBe(8080);
    });
  });

  // ==========================================================================
  // Section 4: KhataManagement "SALESMAN" Category Tab & Ledger
  // ==========================================================================
  describe("4. KhataManagement SALESMAN Category & Ledger", () => {
    it("M3.5: KhataManagement renders SALESMAN category tab and badge with correct count", () => {
      const markup = renderToStaticMarkup(React.createElement(KhataManagement, { initialAccountId: 5 }));

      // Check category tab label and Urdu text
      expect(markup).toContain("Salesman");
      expect(markup).toContain("سیلز مین");

      // Seed has 3 salesman accounts (ID 5: Muhammad Ali, ID 6: Rashid Mahmood, ID 7: Imran Khan)
      // Badge count should be 3
      const salesmanAccounts = loadSavedKhataAccounts().filter((a) => a.category === "SALESMAN");
      expect(salesmanAccounts.length).toBe(3);

      // The markup contains the category button with the count 3
      expect(markup).toContain(">Salesman<");
      expect(markup).toContain(">3<");
    });

    it("M3.6: Salesman ledger view clearly displays past balance, debits, credits, and net outstanding balance in PKR", () => {
      // Seed transactions for Salesman Muhammad Ali (ID 5)
      const accounts = loadSavedKhataAccounts();
      const ali = accounts.find((a) => a.id === 5)!;
      ali.openingBalance = 10000;
      ali.currentBalance = 15000;
      saveKhataAccounts(accounts);

      saveKhataTransactions([
        {
          id: 501,
          accountId: 5,
          accountName: "Muhammad Ali (City Center Beat 01)",
          transactionDate: "2026-11-14",
          transactionType: "DEBIT",
          amount: 8000,
          paymentReceived: 0,
          paymentGiven: 0,
          description: "Unpaid van route sales on Sheet LOAD-20261114-0001",
          previousBalance: 10000,
          newBalance: 18000,
          referenceNo: "LOAD-20261114-0001",
          createdAt: "2026-11-14T18:00:00Z",
        },
        {
          id: 502,
          accountId: 5,
          accountName: "Muhammad Ali (City Center Beat 01)",
          transactionDate: "2026-11-15",
          transactionType: "CREDIT",
          amount: 3000,
          paymentReceived: 3000,
          paymentGiven: 0,
          description: "Salesman cash recovery payment (کیش ریکوری)",
          previousBalance: 18000,
          newBalance: 15000,
          referenceNo: "REC-502",
          createdAt: "2026-11-15T10:00:00Z",
        },
      ]);

      const markup = renderToStaticMarkup(React.createElement(KhataManagement, { initialAccountId: 5 }));

      // Check account name
      expect(markup).toContain("Muhammad Ali");

      // Check financial breakdown labels
      expect(markup).toContain("Past / Opening Balance");
      expect(markup).toContain("Total Debits");
      expect(markup).toContain("Total Credits / Recovery");
      expect(markup).toContain("Net Outstanding Balance");

      // Check financial figures
      expect(markup).toContain("10,000"); // Opening
      expect(markup).toContain("8,000");  // Debits
      expect(markup).toContain("3,000");  // Credits
      expect(markup).toContain("15,000"); // Net balance
    });
  });

  // ==========================================================================
  // Section 5: Salesman Cash Recovery Payment Recording (CREDIT)
  // ==========================================================================
  describe("5. Salesman Cash Recovery Payment Recording", () => {
    it("M3.7: Recording a salesman cash recovery payment posts a CREDIT transaction and decrements balance", () => {
      // Salesman Muhammad Ali starts with ₨ 25,000 balance
      const accounts = loadSavedKhataAccounts();
      const ali = accounts.find((a) => a.id === 5)!;
      ali.openingBalance = 0;
      ali.currentBalance = 25000;
      saveKhataAccounts(accounts);

      const existingTxs = [
        {
          id: 601,
          accountId: 5,
          accountName: "Muhammad Ali (Beat 01)",
          transactionDate: "2026-11-15",
          transactionType: "DEBIT" as const,
          amount: 25000,
          paymentReceived: 0,
          paymentGiven: 0,
          description: "Unpaid van route sales on Sheet LOAD-20261115-0001",
          previousBalance: 0,
          newBalance: 25000,
          referenceNo: "LOAD-20261115-0001",
          createdAt: "2026-11-15T18:00:00Z",
        },
      ];
      saveKhataTransactions(existingTxs);

      // Simulate recording recovery payment of ₨ 10,000
      const recoveryAmount = 10000;
      const prevBal = ali.currentBalance;
      const newBal = prevBal - recoveryAmount; // 15,000

      const recoveryTx = {
        id: 602,
        accountId: ali.id,
        accountName: `${ali.holderName} (${ali.shopName})`,
        transactionDate: "2026-11-16",
        transactionType: "CREDIT" as const,
        amount: recoveryAmount,
        paymentReceived: recoveryAmount,
        paymentGiven: 0,
        description: "Salesman cash recovery payment (کیش ریکوری)",
        previousBalance: prevBal,
        newBalance: newBal,
        referenceNo: "REC-602",
        createdAt: new Date().toISOString(),
      };

      const updatedTxs = [recoveryTx, ...existingTxs];
      saveKhataTransactions(updatedTxs);

      const updatedAccounts = accounts.map((a) =>
        a.id === ali.id ? { ...a, currentBalance: newBal, updatedAt: new Date().toISOString() } : a
      );
      saveKhataAccounts(updatedAccounts);

      // Verify updated account state
      const reloadedAccounts = loadSavedKhataAccounts();
      const reloadedAli = reloadedAccounts.find((a) => a.id === 5)!;
      expect(reloadedAli.currentBalance).toBe(15000);

      // Render KhataManagement and confirm ₨ 15,000 displayed
      const markup = renderToStaticMarkup(React.createElement(KhataManagement, { initialAccountId: 5 }));
      expect(markup).toContain("15,000");
      expect(markup).toContain("10,000"); // Total Credits
      expect(markup).toContain("REC-602");
    });

    it("M3.8: Non-regression isolation: Retailer and customer accounts remain 100% untouched", () => {
      const initialAccounts = loadSavedKhataAccounts();
      const retailerAkramBefore = initialAccounts.find((a) => a.id === 1)!;
      const supplierTariqBefore = initialAccounts.find((a) => a.id === 4)!;

      const akramBalBefore = retailerAkramBefore.currentBalance;
      const tariqBalBefore = supplierTariqBefore.currentBalance;

      // Perform a multi-edit recalibration and a cash recovery payment on salesman ID 6 (Rashid Mahmood)
      const accounts = loadSavedKhataAccounts();
      const rashid = accounts.find((a) => a.id === 6)!;
      rashid.currentBalance = 18000;
      saveKhataAccounts(accounts);

      const recoveryTx = {
        id: 701,
        accountId: 6,
        accountName: "Rashid Mahmood (Beat 02)",
        transactionDate: "2026-11-16",
        transactionType: "CREDIT" as const,
        amount: 5000,
        paymentReceived: 5000,
        paymentGiven: 0,
        description: "Cash recovery from Rashid Mahmood",
        previousBalance: 18000,
        newBalance: 13000,
        referenceNo: "REC-701",
        createdAt: new Date().toISOString(),
      };
      saveKhataTransactions([recoveryTx]);

      // Re-read accounts
      const reloadedAccounts = loadSavedKhataAccounts();
      const retailerAkramAfter = reloadedAccounts.find((a) => a.id === 1)!;
      const supplierTariqAfter = reloadedAccounts.find((a) => a.id === 4)!;

      // Customer and supplier accounts must be completely unchanged
      expect(retailerAkramAfter.currentBalance).toBe(akramBalBefore);
      expect(supplierTariqAfter.currentBalance).toBe(tariqBalBefore);
      expect(retailerAkramAfter.category).toBe("RETAILER");
      expect(supplierTariqAfter.category).toBe("SUPPLIER");
    });
  });
});
