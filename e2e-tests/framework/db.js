/**
 * SQLite Database Initializer for Logar Traders
 * Uses Node.js built-in node:sqlite with in-memory or file database.
 */

const { DatabaseSync } = require('node:sqlite');

function createDatabase(dbPath = ':memory:') {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // Schema creation
  db.exec(`
    -- 1. Business Configuration & Agency Profile
    CREATE TABLE IF NOT EXISTS business_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Chart of Accounts
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id INTEGER PRIMARY KEY,
      account_code TEXT UNIQUE NOT NULL,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK(account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE')),
      is_active BOOLEAN NOT NULL DEFAULT 1
    );

    -- 3. System Users & RBAC
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'accountant', 'salesman', 'warehouse_operator')),
      is_active BOOLEAN NOT NULL DEFAULT 1,
      pin_code TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Delivery Routes
    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_code TEXT UNIQUE NOT NULL,
      route_name TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT 1
    );

    -- 5. Beverage Product & SKU Master
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT 'Nextco',
      category TEXT NOT NULL DEFAULT 'Cold Drink',
      packaging_type TEXT NOT NULL CHECK(packaging_type IN ('RGB_GLASS', 'PET_PLASTIC', 'CAN_ALU', 'WATER_CARBOY')),
      base_unit_name TEXT NOT NULL DEFAULT 'Bottle',
      pack_unit_name TEXT NOT NULL DEFAULT 'Crate',
      units_per_pack INTEGER NOT NULL DEFAULT 24,
      purchase_price_pack REAL NOT NULL,
      sale_price_pack REAL NOT NULL,
      sale_price_base REAL NOT NULL,
      crate_deposit_price REAL NOT NULL DEFAULT 0.00,
      bottle_deposit_price REAL NOT NULL DEFAULT 0.00,
      stock_base_units INTEGER NOT NULL DEFAULT 0,
      empty_bottles_stock INTEGER NOT NULL DEFAULT 0,
      empty_crates_stock INTEGER NOT NULL DEFAULT 0,
      min_reorder_level_packs INTEGER NOT NULL DEFAULT 20,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. Customers / Retailers
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      owner_name TEXT,
      phone TEXT NOT NULL,
      whatsapp TEXT,
      address TEXT NOT NULL,
      route_id INTEGER REFERENCES routes(id),
      price_tier TEXT NOT NULL DEFAULT 'RETAIL' CHECK(price_tier IN ('RETAIL', 'WHOLESALE', 'SPECIAL')),
      credit_limit_amount REAL NOT NULL DEFAULT 50000.00,
      credit_limit_days INTEGER NOT NULL DEFAULT 14,
      crate_limit INTEGER NOT NULL DEFAULT 30,
      current_balance REAL NOT NULL DEFAULT 0.00,
      current_crate_balance INTEGER NOT NULL DEFAULT 0,
      deposit_balance REAL NOT NULL DEFAULT 0.00,
      credit_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(credit_status IN ('ACTIVE', 'WARNING', 'BLOCKED')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. Suppliers / Beverage Manufacturers
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT NOT NULL,
      supplier_type TEXT NOT NULL CHECK(supplier_type IN ('PRINCIPAL_BEVERAGE', 'FREIGHT_TRANSPORTER', 'LABOR_CONTRACTOR', 'GENERAL')),
      current_payable REAL NOT NULL DEFAULT 0.00,
      crates_owed_to_company INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. Sales Invoices
    CREATE TABLE IF NOT EXISTS sales_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      trip_id INTEGER REFERENCES delivery_trips(id),
      invoice_date DATE NOT NULL,
      due_date DATE NOT NULL,
      subtotal_amount REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0.00,
      tax_amount REAL NOT NULL DEFAULT 0.00,
      crate_deposit_charged REAL NOT NULL DEFAULT 0.00,
      net_total_amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0.00,
      due_amount REAL NOT NULL,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('CASH', 'CREDIT', 'SPLIT', 'BANK')),
      status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('PAID', 'PARTIAL', 'UNPAID', 'CANCELLED')),
      crates_issued INTEGER NOT NULL DEFAULT 0,
      crates_returned INTEGER NOT NULL DEFAULT 0,
      is_locked BOOLEAN NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. Sales Invoice Items
    CREATE TABLE IF NOT EXISTS sales_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      unit_chosen TEXT NOT NULL CHECK(unit_chosen IN ('PACK', 'BASE', 'MIXED')),
      pack_qty INTEGER NOT NULL DEFAULT 0,
      loose_qty INTEGER NOT NULL DEFAULT 0,
      total_base_units INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      line_discount REAL NOT NULL DEFAULT 0.00,
      line_total REAL NOT NULL,
      cogs_unit_cost REAL NOT NULL,
      cogs_total REAL NOT NULL
    );

    -- 10. Customer Double-Entry Khata Ledger
    CREATE TABLE IF NOT EXISTS customer_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      entry_date DATE NOT NULL,
      voucher_type TEXT NOT NULL CHECK(voucher_type IN ('SALE_INVOICE', 'CASH_RECOVERY', 'BANK_RECOVERY', 'SALE_RETURN', 'BILL_CANCELLATION', 'ADJUSTMENT')),
      voucher_ref_id INTEGER,
      description TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0.00,
      credit REAL NOT NULL DEFAULT 0.00,
      running_balance REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. Customer Crate Circulation Ledger
    CREATE TABLE IF NOT EXISTS customer_crate_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      entry_date DATE NOT NULL,
      voucher_ref TEXT NOT NULL,
      crates_out INTEGER NOT NULL DEFAULT 0,
      crates_in INTEGER NOT NULL DEFAULT 0,
      running_crate_balance INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. Purchases & Landed Costs
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_invoice_no TEXT NOT NULL,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      purchase_date DATE NOT NULL,
      base_invoice_cost REAL NOT NULL,
      freight_expense REAL NOT NULL DEFAULT 0.00,
      unloading_labor_expense REAL NOT NULL DEFAULT 0.00,
      transit_tax_expense REAL NOT NULL DEFAULT 0.00,
      total_landed_cost REAL NOT NULL,
      payment_status TEXT NOT NULL CHECK(payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
      paid_amount REAL NOT NULL DEFAULT 0.00,
      due_amount REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 13. Purchase Items
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      pack_qty INTEGER NOT NULL DEFAULT 0,
      loose_qty INTEGER NOT NULL DEFAULT 0,
      total_base_units INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      line_total REAL NOT NULL
    );

    -- 14. Supplier Khata Ledger
    CREATE TABLE IF NOT EXISTS supplier_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      entry_date DATE NOT NULL,
      voucher_type TEXT NOT NULL CHECK(voucher_type IN ('PURCHASE', 'CASH_PAYMENT', 'BANK_PAYMENT', 'PURCHASE_RETURN', 'ADJUSTMENT')),
      voucher_ref_id INTEGER,
      description TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0.00,
      credit REAL NOT NULL DEFAULT 0.00,
      running_balance REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 15. Strict Liquid Cash Book
    CREATE TABLE IF NOT EXISTS cash_book (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date DATE NOT NULL,
      entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      transaction_type TEXT NOT NULL,
      ref_voucher_type TEXT NOT NULL,
      ref_voucher_id INTEGER NOT NULL,
      account_id INTEGER REFERENCES chart_of_accounts(id),
      description TEXT NOT NULL,
      cash_in REAL NOT NULL DEFAULT 0.00,
      cash_out REAL NOT NULL DEFAULT 0.00,
      running_cash_balance REAL NOT NULL,
      is_locked BOOLEAN NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id)
    );

    -- 16. Bank Accounts & Transactions
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_title TEXT NOT NULL,
      branch TEXT,
      current_balance REAL NOT NULL DEFAULT 0.00,
      is_active BOOLEAN NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
      entry_date DATE NOT NULL,
      transaction_type TEXT NOT NULL,
      ref_no TEXT,
      description TEXT NOT NULL,
      deposit_amount REAL NOT NULL DEFAULT 0.00,
      withdrawal_amount REAL NOT NULL DEFAULT 0.00,
      running_balance REAL NOT NULL,
      is_cleared BOOLEAN NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 17. Operating Expenses
    CREATE TABLE IF NOT EXISTS operating_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date DATE NOT NULL,
      account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
      amount REAL NOT NULL,
      payment_mode TEXT NOT NULL CHECK(payment_mode IN ('CASH', 'BANK')),
      recipient_name TEXT,
      description TEXT NOT NULL,
      trip_id INTEGER REFERENCES delivery_trips(id),
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 18. Logistics, Routes & Delivery Trips
    CREATE TABLE IF NOT EXISTS delivery_trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_code TEXT UNIQUE NOT NULL,
      trip_date DATE NOT NULL,
      route_id INTEGER NOT NULL REFERENCES routes(id),
      driver_id INTEGER NOT NULL REFERENCES users(id),
      vehicle_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DISPATCHED' CHECK(status IN ('DISPATCHED', 'COMPLETED', 'SETTLED', 'AUDITED')),
      dispatched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      returned_at TIMESTAMP,
      opening_km INTEGER,
      closing_km INTEGER,
      notes TEXT
    );

    -- 19. Trip Load Manifest & Vehicle Items
    CREATE TABLE IF NOT EXISTS trip_load_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL REFERENCES delivery_trips(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      loaded_packs INTEGER NOT NULL DEFAULT 0,
      loaded_loose INTEGER NOT NULL DEFAULT 0,
      total_loaded_base INTEGER NOT NULL,
      sold_base INTEGER NOT NULL DEFAULT 0,
      returned_packs INTEGER NOT NULL DEFAULT 0,
      returned_loose INTEGER NOT NULL DEFAULT 0,
      total_returned_base INTEGER NOT NULL DEFAULT 0,
      breakage_base INTEGER NOT NULL DEFAULT 0,
      variance_base INTEGER NOT NULL DEFAULT 0
    );

    -- 20. Trip Settlements & Driver Reconciliation
    CREATE TABLE IF NOT EXISTS trip_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER UNIQUE NOT NULL REFERENCES delivery_trips(id),
      settlement_date DATE NOT NULL,
      total_cash_sales REAL NOT NULL DEFAULT 0.00,
      total_credit_sales REAL NOT NULL DEFAULT 0.00,
      total_udhaar_recoveries REAL NOT NULL DEFAULT 0.00,
      total_crate_deposits REAL NOT NULL DEFAULT 0.00,
      total_route_expenses REAL NOT NULL DEFAULT 0.00,
      expected_cash_deposit REAL NOT NULL,
      actual_cash_handed_over REAL NOT NULL,
      cash_variance REAL NOT NULL,
      driver_shortage_action TEXT,
      empty_crates_expected INTEGER NOT NULL,
      empty_crates_returned INTEGER NOT NULL,
      crates_variance INTEGER NOT NULL,
      settled_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 21. Daily Closing & Safe Audits
    CREATE TABLE IF NOT EXISTS daily_closings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closing_date DATE UNIQUE NOT NULL,
      opening_cash REAL NOT NULL,
      total_cash_in REAL NOT NULL,
      total_cash_out REAL NOT NULL,
      expected_closing_cash REAL NOT NULL,
      physical_closing_cash REAL NOT NULL,
      cash_variance REAL NOT NULL,
      denominations_json TEXT NOT NULL,
      total_sales_invoiced REAL NOT NULL DEFAULT 0.00,
      total_credit_sales REAL NOT NULL DEFAULT 0.00,
      total_recoveries REAL NOT NULL DEFAULT 0.00,
      total_expenses REAL NOT NULL DEFAULT 0.00,
      total_supplier_payments REAL NOT NULL DEFAULT 0.00,
      status TEXT NOT NULL CHECK(status IN ('BALANCED', 'SHORTAGE', 'EXCESS')),
      notes TEXT,
      closed_by INTEGER REFERENCES users(id),
      closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 22. Immutable Tamper-Evident Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_utc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      timestamp_pkt TEXT,
      user_id INTEGER REFERENCES users(id),
      user_role TEXT,
      terminal_ip TEXT,
      event_category TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_state_json TEXT,
      new_state_json TEXT,
      reason_notes TEXT,
      authorized_by_pin INTEGER
    );

    -- 23. Breakage & Wastage Logs
    CREATE TABLE IF NOT EXISTS breakage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date DATE NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      broken_base_units INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      total_loss_amount REAL NOT NULL,
      cause TEXT NOT NULL,
      incident_location TEXT NOT NULL,
      responsible_person TEXT,
      action_taken TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Initialize Default Chart of Accounts
  const coaCount = db.prepare('SELECT COUNT(*) as cnt FROM chart_of_accounts').get().cnt;
  if (coaCount === 0) {
    const insertCoa = db.prepare(`
      INSERT INTO chart_of_accounts (id, account_code, account_name, account_type)
      VALUES (?, ?, ?, ?)
    `);

    const accounts = [
      [1010, '1010', 'Cash on Hand (Cash Drawer)', 'ASSET'],
      [1020, '1020', 'Bank Operating Account', 'ASSET'],
      [1100, '1100', 'Liquid Beverage Inventory', 'ASSET'],
      [1110, '1110', 'Empty Crate & Glass Bottle Inventory', 'ASSET'],
      [1200, '1200', 'Accounts Receivable (Trade Udhaar)', 'ASSET'],
      [1250, '1250', 'Driver Shortage Receivable', 'ASSET'],
      [2010, '2010', 'Accounts Payable - Nextco Principal', 'LIABILITY'],
      [2020, '2020', 'Accounts Payable - Freight Transporters', 'LIABILITY'],
      [2100, '2100', 'Customer Crate Security Deposits Payable', 'LIABILITY'],
      [3010, '3010', 'Owner Capital Investment', 'EQUITY'],
      [3030, '3030', 'Owner Drawings', 'EQUITY'],
      [4010, '4010', 'Beverage Sales Revenue', 'REVENUE'],
      [5010, '5010', 'Cost of Goods Sold (COGS) - Beverages', 'COGS'],
      [5020, '5020', 'Inward Freight & Transit Expense', 'COGS'],
      [6010, '6010', 'Logistics & Vehicle Fuel Expense', 'EXPENSE'],
      [6030, '6030', 'Warehouse & Unloading Labor (Palledari)', 'EXPENSE'],
      [6050, '6050', 'Breakage, Wastage & Transit Loss', 'EXPENSE'],
      [6070, '6070', 'Depot Rent & Utilities', 'EXPENSE'],
      [6080, '6080', 'Office & General Admin Expenses', 'EXPENSE'],
    ];

    for (const acc of accounts) {
      insertCoa.run(...acc);
    }
  }

  // Initialize Business Settings for Logar Traders
  const settingsCount = db.prepare('SELECT COUNT(*) as cnt FROM business_settings').get().cnt;
  if (settingsCount === 0) {
    const insertSetting = db.prepare('INSERT INTO business_settings (key, value) VALUES (?, ?)');
    const defaultSettings = [
      ['agency_name', 'Logar Traders'],
      ['trade_name', 'Nextco Logistics Agency / Logar Traders'],
      ['address', 'Main Distribution Hub, Commercial Area, Pakistan'],
      ['phone', '+92-300-1234567'],
      ['whatsapp', '+92-300-1234567'],
      ['currency', 'PKR'],
      ['currency_symbol', '₨'],
      ['prefix_invoice', 'INV-'],
      ['prefix_purchase', 'PUR-'],
      ['prefix_recovery', 'REC-'],
      ['prefix_expense', 'EXP-'],
      ['prefix_trip', 'DEL-'],
      ['default_crate_deposit', '250.00'],
      ['default_bottle_deposit', '10.00'],
      ['default_grace_days', '15'],
      ['default_credit_limit', '100000.00'],
    ];

    for (const [k, v] of defaultSettings) {
      insertSetting.run(k, v);
    }
  }

  return db;
}

module.exports = {
  createDatabase,
};
