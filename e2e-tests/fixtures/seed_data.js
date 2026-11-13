/**
 * Fixture Seed Data for Logar Traders Tests
 */

function seedDatabase(db) {
  // Users
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, full_name, role, pin_code)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const users = [
    [1, 'admin', 'hash_admin_123', 'Afzal Ali Dogar (Admin)', 'admin', '1122'],
    [2, 'accountant', 'hash_acc_123', 'Tariq Mehmood (Accountant)', 'accountant', '3344'],
    [3, 'salesman', 'hash_sales_123', 'Muhammad Imran (Salesman)', 'salesman', '5566'],
    [4, 'warehouse', 'hash_wh_123', 'Ghulam Abbas (Storekeeper)', 'warehouse_operator', '7788'],
  ];

  for (const u of users) {
    insertUser.run(...u);
  }

  // Routes
  const insertRoute = db.prepare(`
    INSERT INTO routes (id, route_code, route_name, description)
    VALUES (?, ?, ?, ?)
  `);

  const routes = [
    [1, 'RT-01', 'City Center Route', 'Main Bazaar, Hospital Road, Circular Road'],
    [2, 'RT-02', 'GT Road Beat', 'Highway marts, service area fuel stations'],
    [3, 'RT-03', 'Industrial Area Beat', 'Mill canteens, corporate offices, catering units'],
  ];

  for (const r of routes) {
    insertRoute.run(...r);
  }

  // Products
  const insertProduct = db.prepare(`
    INSERT INTO products (
      id, sku_code, name, brand, category, packaging_type,
      base_unit_name, pack_unit_name, units_per_pack,
      purchase_price_pack, sale_price_pack, sale_price_base,
      crate_deposit_price, bottle_deposit_price,
      stock_base_units, empty_bottles_stock, empty_crates_stock, min_reorder_level_packs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const products = [
    [
      1, 'NC-250-RGB', 'Next Cola 250ml Glass Bottle', 'Nextco', 'Cold Drink', 'RGB_GLASS',
      'Bottle', 'Crate', 24,
      1200.00, 1440.00, 60.00,
      250.00, 10.00,
      2400, 500, 100, 20
    ],
    [
      2, 'NC-1500-PET', 'Next Cola 1.5L PET', 'Nextco', 'Cold Drink', 'PET_PLASTIC',
      'Bottle', 'Carton', 6,
      950.00, 1000.00, 166.67,
      0.00, 0.00,
      600, 0, 0, 30
    ],
    [
      3, 'FZ-250-CAN', 'Fizz Lemon 250ml Can', 'Nextco', 'Cold Drink', 'CAN_ALU',
      'Can', 'Carton', 24,
      1000.00, 1200.00, 50.00,
      0.00, 0.00,
      480, 0, 0, 15
    ],
    [
      4, 'NP-500-WATER', 'Next Pure Drinking Water 500ml', 'Nextco', 'Mineral Water', 'PET_PLASTIC',
      'Bottle', 'Pack', 12,
      400.00, 480.00, 40.00,
      0.00, 0.00,
      360, 0, 0, 20
    ]
  ];

  for (const p of products) {
    insertProduct.run(...p);
  }

  // Customers
  const insertCustomer = db.prepare(`
    INSERT INTO customers (
      id, code, name, owner_name, phone, whatsapp, address,
      route_id, price_tier, credit_limit_amount, credit_limit_days, crate_limit,
      current_balance, current_crate_balance, deposit_balance, credit_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const customers = [
    [
      1, 'CUST-001', 'Haji Super Store', 'Haji Abdul Rehman', '+92-300-1112233', '+92-300-1112233', 'Main Chowk, City Center',
      1, 'WHOLESALE', 100000.00, 15, 50,
      0.00, 0, 0.00, 'ACTIVE'
    ],
    [
      2, 'CUST-002', 'Bismillah Kiryana Store', 'Muhammad Aslam', '+92-301-2223344', '+92-301-2223344', 'Shop 14, Circular Road',
      1, 'RETAIL', 50000.00, 10, 30,
      0.00, 0, 0.00, 'ACTIVE'
    ],
    [
      3, 'CUST-003', 'Al-Madina Mart & Bakers', 'Chaudhry Nadeem', '+92-302-3334455', '+92-302-3334455', 'GT Road Near Toll Plaza',
      2, 'WHOLESALE', 200000.00, 30, 100,
      0.00, 0, 0.00, 'ACTIVE'
    ]
  ];

  for (const c of customers) {
    insertCustomer.run(...c);
  }

  // Suppliers
  const insertSupplier = db.prepare(`
    INSERT INTO suppliers (id, name, contact_person, phone, supplier_type, current_payable, crates_owed_to_company)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const suppliers = [
    [1, 'Next Beverages Ltd / Head Factory', 'Engr. Kamran Tariq', '+92-42-111222333', 'PRINCIPAL_BEVERAGE', 0.00, 0],
    [2, 'Al-Madina Freight & Logistics', 'Malik Shaukat', '+92-300-4445566', 'FREIGHT_TRANSPORTER', 0.00, 0],
  ];

  for (const s of suppliers) {
    insertSupplier.run(...s);
  }

  // Bank Account
  const insertBank = db.prepare(`
    INSERT INTO bank_accounts (id, bank_name, account_number, account_title, branch, current_balance)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertBank.run(1, 'Meezan Bank Ltd', '0201-0102030405', 'Logar Traders Operating Account', 'Commercial Branch', 100000.00);
}

module.exports = {
  seedDatabase,
};
