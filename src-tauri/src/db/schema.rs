pub const SCHEMA_DDL: &str = r#"
-- ============================================================================
-- 1. SCHEMA MIGRATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    checksum TEXT NOT NULL,
    execution_time_ms INTEGER NOT NULL
);

-- ============================================================================
-- 2. APP SETTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    value TEXT,
    category TEXT NOT NULL DEFAULT 'GENERAL' CHECK(category IN ('GENERAL', 'AGENCY', 'FINANCIAL', 'INVOICE', 'SYSTEM')),
    description TEXT,
    is_encrypted BOOLEAN NOT NULL DEFAULT 0 CHECK(is_encrypted IN (0, 1)),
    agency_name TEXT NOT NULL DEFAULT 'Logar Traders - Nextco Logistics Agency',
    tagline TEXT DEFAULT 'Official Nextco Beverage Distribution Depot',
    address TEXT NOT NULL DEFAULT 'Nextco Beverage Depot, Main Bypass, Rahim Yar Khan',
    phone TEXT NOT NULL DEFAULT '+92 300 1234567',
    whatsapp TEXT DEFAULT '+92 300 1234567',
    ntn_strn TEXT DEFAULT '7483921-5',
    invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
    default_crate_deposit INTEGER NOT NULL DEFAULT 60000,
    default_credit_days INTEGER NOT NULL DEFAULT 14,
    auto_backup_on_close BOOLEAN NOT NULL DEFAULT 1,
    backup_dir TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 3. USERS (RBAC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'ACCOUNTANT', 'SALESMAN', 'WAREHOUSE')),
    phone TEXT,
    pin_code TEXT,
    is_active BOOLEAN NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 4. AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_values_json TEXT,
    new_values_json TEXT,
    reason TEXT,
    ip_address TEXT,
    machine_name TEXT
);

-- ============================================================================
-- 5. PRODUCTS (Canonical base unit inventory in integer Paisas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category_id INTEGER,
    brand TEXT NOT NULL DEFAULT 'Nextco',
    flavor TEXT,
    volume_ml INTEGER,
    packaging_type TEXT NOT NULL CHECK(packaging_type IN ('RGB_GLASS', 'PET_PLASTIC', 'CAN_ALU', 'WATER_CARBOY')),
    is_glass BOOLEAN NOT NULL DEFAULT 0 CHECK(is_glass IN (0, 1)),
    requires_crate BOOLEAN NOT NULL DEFAULT 0 CHECK(requires_crate IN (0, 1)),
    base_unit_name TEXT NOT NULL DEFAULT 'Bottle',
    default_pack_name TEXT NOT NULL DEFAULT 'Crate',
    pack_unit_name TEXT NOT NULL DEFAULT 'Crate',
    units_per_pack INTEGER NOT NULL DEFAULT 24 CHECK(units_per_pack > 0),
    purchase_price_pack INTEGER NOT NULL DEFAULT 0 CHECK(purchase_price_pack >= 0),
    purchase_price_pack_paisa INTEGER NOT NULL DEFAULT 0 CHECK(purchase_price_pack_paisa >= 0),
    sale_price_pack INTEGER NOT NULL DEFAULT 0 CHECK(sale_price_pack >= 0),
    sale_price_base INTEGER NOT NULL DEFAULT 0 CHECK(sale_price_base >= 0),
    wholesale_price_pack_paisa INTEGER NOT NULL DEFAULT 0 CHECK(wholesale_price_pack_paisa >= 0),
    retail_price_pack_paisa INTEGER NOT NULL DEFAULT 0 CHECK(retail_price_pack_paisa >= 0),
    retail_price_base_paisa INTEGER NOT NULL DEFAULT 0 CHECK(retail_price_base_paisa >= 0),
    crate_deposit_price INTEGER NOT NULL DEFAULT 0 CHECK(crate_deposit_price >= 0),
    crate_deposit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(crate_deposit_paisa >= 0),
    bottle_deposit_price INTEGER NOT NULL DEFAULT 0 CHECK(bottle_deposit_price >= 0),
    bottle_deposit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(bottle_deposit_paisa >= 0),
    stock_base_units INTEGER NOT NULL DEFAULT 0,
    current_stock_base_units INTEGER NOT NULL DEFAULT 0,
    empty_bottles_stock INTEGER NOT NULL DEFAULT 0,
    empty_crates_stock INTEGER NOT NULL DEFAULT 0,
    min_reorder_level_packs INTEGER NOT NULL DEFAULT 20 CHECK(min_reorder_level_packs >= 0),
    is_active BOOLEAN NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 6. PACKAGING UNITS
-- ============================================================================
CREATE TABLE IF NOT EXISTS packaging_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    unit_name TEXT NOT NULL,
    multiplier_to_base INTEGER NOT NULL DEFAULT 1 CHECK(multiplier_to_base > 0),
    conversion_multiplier INTEGER NOT NULL DEFAULT 1 CHECK(conversion_multiplier > 0),
    is_base_unit BOOLEAN NOT NULL DEFAULT 0 CHECK(is_base_unit IN (0, 1)),
    is_default_purchase_unit BOOLEAN NOT NULL DEFAULT 0 CHECK(is_default_purchase_unit IN (0, 1)),
    is_default_sale_unit BOOLEAN NOT NULL DEFAULT 0 CHECK(is_default_sale_unit IN (0, 1)),
    barcode TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(product_id, unit_name)
);

-- ============================================================================
-- 7. INVENTORY BATCHES
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    purchase_invoice_id INTEGER,
    batch_number TEXT,
    manufacturing_date TEXT,
    expiry_date TEXT,
    initial_base_units INTEGER NOT NULL CHECK(initial_base_units > 0),
    remaining_base_units INTEGER NOT NULL CHECK(remaining_base_units >= 0),
    unit_cost_paisa INTEGER NOT NULL CHECK(unit_cost_paisa >= 0),
    pack_cost_paisa INTEGER NOT NULL CHECK(pack_cost_paisa >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 8. EMPTIES LEDGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS empties_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('CUSTOMER', 'SUPPLIER', 'WAREHOUSE', 'VAN_ROUTE')),
    entity_id INTEGER NOT NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    entry_date TEXT NOT NULL,
    voucher_type TEXT NOT NULL,
    voucher_id INTEGER,
    voucher_number TEXT,
    crates_out INTEGER NOT NULL DEFAULT 0 CHECK(crates_out >= 0),
    crates_in INTEGER NOT NULL DEFAULT 0 CHECK(crates_in >= 0),
    bottles_out INTEGER NOT NULL DEFAULT 0 CHECK(bottles_out >= 0),
    bottles_in INTEGER NOT NULL DEFAULT 0 CHECK(bottles_in >= 0),
    running_crates_balance INTEGER NOT NULL DEFAULT 0,
    running_bottles_balance INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 9. SECURITY DEPOSITS
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    deposit_date TEXT NOT NULL,
    voucher_type TEXT NOT NULL,
    voucher_id INTEGER,
    voucher_number TEXT,
    crates_count INTEGER NOT NULL DEFAULT 0 CHECK(crates_count >= 0),
    deposit_rate_per_crate_paisa INTEGER NOT NULL DEFAULT 0 CHECK(deposit_rate_per_crate_paisa >= 0),
    deposit_in_paisa INTEGER NOT NULL DEFAULT 0 CHECK(deposit_in_paisa >= 0),
    deposit_out_paisa INTEGER NOT NULL DEFAULT 0 CHECK(deposit_out_paisa >= 0),
    running_deposit_liability_paisa INTEGER NOT NULL DEFAULT 0,
    account_id INTEGER NOT NULL DEFAULT 16,
    payment_mode TEXT NOT NULL DEFAULT 'CASH',
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 10. CUSTOMERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    shop_name TEXT NOT NULL DEFAULT '',
    owner_name TEXT,
    phone TEXT NOT NULL,
    whatsapp TEXT,
    address TEXT NOT NULL,
    route_id INTEGER REFERENCES delivery_routes(id) ON DELETE SET NULL,
    price_tier TEXT NOT NULL DEFAULT 'RETAIL' CHECK(price_tier IN ('RETAIL', 'WHOLESALE', 'SPECIAL')),
    credit_limit_amount INTEGER NOT NULL DEFAULT 5000000 CHECK(credit_limit_amount >= 0),
    credit_limit_paisa INTEGER NOT NULL DEFAULT 5000000 CHECK(credit_limit_paisa >= 0),
    credit_limit_days INTEGER NOT NULL DEFAULT 14 CHECK(credit_limit_days >= 0),
    crate_limit INTEGER NOT NULL DEFAULT 30 CHECK(crate_limit >= 0),
    current_balance INTEGER NOT NULL DEFAULT 0,
    current_balance_paisa INTEGER NOT NULL DEFAULT 0,
    current_crate_balance INTEGER NOT NULL DEFAULT 0,
    current_crates_balance INTEGER NOT NULL DEFAULT 0,
    deposit_balance INTEGER NOT NULL DEFAULT 0,
    security_deposit_balance_paisa INTEGER NOT NULL DEFAULT 0,
    credit_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(credit_status IN ('ACTIVE', 'WARNING', 'BLOCKED')),
    is_active BOOLEAN NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 11. SUPPLIERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    company_name TEXT NOT NULL DEFAULT '',
    contact_person TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    supplier_type TEXT NOT NULL CHECK(supplier_type IN ('PRINCIPAL_BEVERAGE', 'FREIGHT_TRANSPORTER', 'LABOR_CONTRACTOR', 'GENERAL')),
    current_payable INTEGER NOT NULL DEFAULT 0,
    current_payable_paisa INTEGER NOT NULL DEFAULT 0,
    crates_owed_to_company INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 12. DELIVERY ROUTES
-- ============================================================================
CREATE TABLE IF NOT EXISTS delivery_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_code TEXT UNIQUE NOT NULL,
    route_name TEXT NOT NULL,
    description TEXT,
    default_driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    default_vehicle_no TEXT,
    is_active BOOLEAN NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 13. DELIVERY SHEETS / TRIPS
-- ============================================================================
CREATE TABLE IF NOT EXISTS delivery_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_number TEXT UNIQUE NOT NULL,
    trip_code TEXT UNIQUE,
    sheet_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
    trip_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
    route_id INTEGER NOT NULL REFERENCES delivery_routes(id) ON DELETE RESTRICT,
    driver_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    driver_name TEXT NOT NULL DEFAULT 'Driver',
    vehicle_number TEXT NOT NULL DEFAULT 'LES-1000',
    status TEXT NOT NULL DEFAULT 'DISPATCHED' CHECK(status IN ('DISPATCHED', 'COMPLETED', 'SETTLED', 'AUDITED')),
    dispatched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    returned_at TEXT,
    opening_km INTEGER,
    closing_km INTEGER,
    expected_cash_paisa INTEGER NOT NULL DEFAULT 0,
    actual_cash_paisa INTEGER NOT NULL DEFAULT 0,
    cash_variance_paisa INTEGER NOT NULL DEFAULT 0,
    empty_crates_expected INTEGER NOT NULL DEFAULT 0,
    empty_crates_returned INTEGER NOT NULL DEFAULT 0,
    crates_variance INTEGER NOT NULL DEFAULT 0,
    settlement_notes TEXT,
    notes TEXT,
    settled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Compatibility alias for delivery_trips
CREATE TABLE IF NOT EXISTS delivery_trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_code TEXT UNIQUE NOT NULL,
    trip_date TEXT NOT NULL,
    route_id INTEGER NOT NULL REFERENCES delivery_routes(id),
    driver_name TEXT NOT NULL,
    vehicle_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DISPATCHED' CHECK(status IN ('DISPATCHED', 'COMPLETED', 'SETTLED', 'AUDITED')),
    dispatched_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    returned_at TEXT,
    opening_km INTEGER,
    closing_km INTEGER,
    notes TEXT
);

-- ============================================================================
-- 14. DELIVERY ITEMS / TRIP LOAD ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS delivery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id INTEGER NOT NULL REFERENCES delivery_sheets(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    loaded_packs INTEGER NOT NULL DEFAULT 0 CHECK(loaded_packs >= 0),
    loaded_loose INTEGER NOT NULL DEFAULT 0 CHECK(loaded_loose >= 0),
    total_loaded_base INTEGER NOT NULL CHECK(total_loaded_base > 0),
    sold_base INTEGER NOT NULL DEFAULT 0 CHECK(sold_base >= 0),
    returned_packs INTEGER NOT NULL DEFAULT 0 CHECK(returned_packs >= 0),
    returned_loose INTEGER NOT NULL DEFAULT 0 CHECK(returned_loose >= 0),
    total_returned_base INTEGER NOT NULL DEFAULT 0 CHECK(total_returned_base >= 0),
    breakage_base INTEGER NOT NULL DEFAULT 0 CHECK(breakage_base >= 0),
    variance_base INTEGER NOT NULL DEFAULT 0,
    UNIQUE(sheet_id, product_id)
);

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

-- ============================================================================
-- 15. SALES INVOICES
-- ============================================================================
CREATE TABLE IF NOT EXISTS sales_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    delivery_sheet_id INTEGER REFERENCES delivery_sheets(id) ON DELETE SET NULL,
    trip_id INTEGER REFERENCES delivery_trips(id) ON DELETE SET NULL,
    invoice_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    subtotal_amount INTEGER NOT NULL DEFAULT 0 CHECK(subtotal_amount >= 0),
    subtotal_paisa INTEGER NOT NULL DEFAULT 0 CHECK(subtotal_paisa >= 0),
    discount_amount INTEGER NOT NULL DEFAULT 0 CHECK(discount_amount >= 0),
    discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(discount_paisa >= 0),
    tax_amount INTEGER NOT NULL DEFAULT 0 CHECK(tax_amount >= 0),
    tax_paisa INTEGER NOT NULL DEFAULT 0 CHECK(tax_paisa >= 0),
    crate_deposit_charged INTEGER NOT NULL DEFAULT 0 CHECK(crate_deposit_charged >= 0),
    crate_deposit_charged_paisa INTEGER NOT NULL DEFAULT 0 CHECK(crate_deposit_charged_paisa >= 0),
    net_total_amount INTEGER NOT NULL DEFAULT 0 CHECK(net_total_amount >= 0),
    net_total_paisa INTEGER NOT NULL DEFAULT 0 CHECK(net_total_paisa >= 0),
    paid_amount INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
    paid_amount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount_paisa >= 0),
    due_amount INTEGER NOT NULL DEFAULT 0 CHECK(due_amount >= 0),
    due_amount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(due_amount_paisa >= 0),
    payment_type TEXT NOT NULL CHECK(payment_type IN ('CASH', 'CREDIT', 'SPLIT', 'BANK')),
    status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('PAID', 'PARTIAL', 'UNPAID', 'CANCELLED')),
    crates_issued INTEGER NOT NULL DEFAULT 0 CHECK(crates_issued >= 0),
    crates_returned INTEGER NOT NULL DEFAULT 0 CHECK(crates_returned >= 0),
    is_cancelled BOOLEAN NOT NULL DEFAULT 0 CHECK(is_cancelled IN (0, 1)),
    cancellation_reason TEXT,
    cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    cancelled_at TEXT,
    is_locked BOOLEAN NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 16. SALES INVOICE ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS sales_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    unit_chosen TEXT NOT NULL CHECK(unit_chosen IN ('PACK', 'BASE', 'MIXED')),
    pack_qty INTEGER NOT NULL DEFAULT 0 CHECK(pack_qty >= 0),
    loose_qty INTEGER NOT NULL DEFAULT 0 CHECK(loose_qty >= 0),
    total_base_units INTEGER NOT NULL CHECK(total_base_units > 0),
    unit_price INTEGER NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
    unit_price_paisa INTEGER NOT NULL DEFAULT 0 CHECK(unit_price_paisa >= 0),
    line_discount INTEGER NOT NULL DEFAULT 0 CHECK(line_discount >= 0),
    line_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(line_discount_paisa >= 0),
    line_total INTEGER NOT NULL DEFAULT 0 CHECK(line_total >= 0),
    line_total_paisa INTEGER NOT NULL DEFAULT 0 CHECK(line_total_paisa >= 0),
    cogs_unit_cost INTEGER NOT NULL DEFAULT 0 CHECK(cogs_unit_cost >= 0),
    cogs_unit_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK(cogs_unit_cost_paisa >= 0),
    cogs_total INTEGER NOT NULL DEFAULT 0 CHECK(cogs_total >= 0),
    cogs_total_paisa INTEGER NOT NULL DEFAULT 0 CHECK(cogs_total_paisa >= 0)
);

-- ============================================================================
-- 17. PURCHASE INVOICES / PURCHASES
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_number TEXT UNIQUE NOT NULL,
    purchase_invoice_no TEXT,
    supplier_invoice_no TEXT NOT NULL DEFAULT '',
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_date TEXT NOT NULL,
    base_goods_paisa INTEGER NOT NULL DEFAULT 0 CHECK(base_goods_paisa >= 0),
    base_invoice_cost INTEGER NOT NULL DEFAULT 0 CHECK(base_invoice_cost >= 0),
    freight_paisa INTEGER NOT NULL DEFAULT 0 CHECK(freight_paisa >= 0),
    freight_expense INTEGER NOT NULL DEFAULT 0 CHECK(freight_expense >= 0),
    unloading_labor_paisa INTEGER NOT NULL DEFAULT 0 CHECK(unloading_labor_paisa >= 0),
    unloading_labor_expense INTEGER NOT NULL DEFAULT 0 CHECK(unloading_labor_expense >= 0),
    transit_tax_paisa INTEGER NOT NULL DEFAULT 0 CHECK(transit_tax_paisa >= 0),
    transit_tax_expense INTEGER NOT NULL DEFAULT 0 CHECK(transit_tax_expense >= 0),
    total_landed_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK(total_landed_cost_paisa >= 0),
    total_landed_cost INTEGER NOT NULL DEFAULT 0 CHECK(total_landed_cost >= 0),
    paid_amount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount_paisa >= 0),
    paid_amount INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
    due_amount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(due_amount_paisa >= 0),
    due_amount INTEGER NOT NULL DEFAULT 0 CHECK(due_amount >= 0),
    payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
    payment_mode TEXT NOT NULL DEFAULT 'CREDIT' CHECK(payment_mode IN ('CASH', 'CREDIT', 'BANK', 'SPLIT')),
    empty_crates_returned_to_factory INTEGER NOT NULL DEFAULT 0 CHECK(empty_crates_returned_to_factory >= 0),
    notes TEXT,
    is_locked BOOLEAN NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_invoice_no TEXT NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    purchase_date TEXT NOT NULL,
    base_invoice_cost INTEGER NOT NULL,
    freight_expense INTEGER NOT NULL DEFAULT 0,
    unloading_labor_expense INTEGER NOT NULL DEFAULT 0,
    transit_tax_expense INTEGER NOT NULL DEFAULT 0,
    total_landed_cost INTEGER NOT NULL,
    payment_status TEXT NOT NULL CHECK(payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
    paid_amount INTEGER NOT NULL DEFAULT 0,
    due_amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 18. PURCHASE INVOICE ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    pack_qty INTEGER NOT NULL DEFAULT 0 CHECK(pack_qty >= 0),
    loose_qty INTEGER NOT NULL DEFAULT 0 CHECK(loose_qty >= 0),
    total_base_units INTEGER NOT NULL CHECK(total_base_units > 0),
    pack_purchase_rate_paisa INTEGER NOT NULL DEFAULT 0 CHECK(pack_purchase_rate_paisa >= 0),
    base_purchase_rate_paisa INTEGER NOT NULL DEFAULT 0 CHECK(base_purchase_rate_paisa >= 0),
    landed_cost_allocated_paisa INTEGER NOT NULL DEFAULT 0 CHECK(landed_cost_allocated_paisa >= 0),
    final_unit_landed_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK(final_unit_landed_cost_paisa >= 0),
    line_total_paisa INTEGER NOT NULL DEFAULT 0 CHECK(line_total_paisa >= 0)
);

-- ============================================================================
-- 19. CHART OF ACCOUNTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_code INTEGER UNIQUE NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK(account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE')),
    parent_code INTEGER,
    is_system BOOLEAN NOT NULL DEFAULT 1 CHECK(is_system IN (0, 1)),
    is_active BOOLEAN NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 20. JOURNAL ENTRIES & LINES
-- ============================================================================
CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_number TEXT UNIQUE NOT NULL,
    entry_date TEXT NOT NULL,
    voucher_type TEXT NOT NULL CHECK(voucher_type IN ('SALE', 'PURCHASE', 'PAYMENT', 'RECEIPT', 'EXPENSE', 'CLOSING', 'CANCELLATION', 'TRANSFER', 'MANUAL')),
    reference_doc_type TEXT,
    reference_doc_id INTEGER,
    narration TEXT NOT NULL,
    is_balanced BOOLEAN NOT NULL DEFAULT 1 CHECK(is_balanced = 1),
    is_locked BOOLEAN NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    debit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(debit_paisa >= 0),
    credit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(credit_paisa >= 0),
    line_narration TEXT,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK((debit_paisa > 0 AND credit_paisa = 0) OR (credit_paisa > 0 AND debit_paisa = 0))
);

-- Compatibility customer ledger and crate ledger tables
CREATE TABLE IF NOT EXISTS customer_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    entry_date TEXT NOT NULL,
    voucher_type TEXT NOT NULL,
    voucher_ref_id INTEGER,
    description TEXT NOT NULL,
    debit INTEGER NOT NULL DEFAULT 0,
    credit INTEGER NOT NULL DEFAULT 0,
    running_balance INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS customer_crate_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    entry_date TEXT NOT NULL,
    voucher_ref TEXT NOT NULL,
    crates_out INTEGER NOT NULL DEFAULT 0,
    crates_in INTEGER NOT NULL DEFAULT 0,
    running_crate_balance INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 21. CASH BOOK
-- ============================================================================
CREATE TABLE IF NOT EXISTS cash_book (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL,
    entry_time TEXT NOT NULL DEFAULT (strftime('%H:%M:%S', 'now')),
    transaction_type TEXT NOT NULL,
    voucher_ref_type TEXT NOT NULL DEFAULT '',
    voucher_ref_id INTEGER NOT NULL DEFAULT 0,
    voucher_ref_number TEXT,
    account_id INTEGER DEFAULT 2,
    account_code TEXT DEFAULT '1010',
    particulars TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    cash_in INTEGER NOT NULL DEFAULT 0 CHECK(cash_in >= 0),
    cash_in_paisa INTEGER NOT NULL DEFAULT 0 CHECK(cash_in_paisa >= 0),
    cash_out INTEGER NOT NULL DEFAULT 0 CHECK(cash_out >= 0),
    cash_out_paisa INTEGER NOT NULL DEFAULT 0 CHECK(cash_out_paisa >= 0),
    running_balance_paisa INTEGER NOT NULL DEFAULT 0,
    running_cash_balance INTEGER NOT NULL DEFAULT 0,
    is_locked BOOLEAN NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 22. BANK TRANSACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    transaction_date TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    instrument_type TEXT NOT NULL DEFAULT 'ONLINE_RAAST',
    instrument_number TEXT,
    particulars TEXT NOT NULL,
    deposit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(deposit_paisa >= 0),
    withdrawal_paisa INTEGER NOT NULL DEFAULT 0 CHECK(withdrawal_paisa >= 0),
    running_balance_paisa INTEGER NOT NULL DEFAULT 0,
    is_cleared BOOLEAN NOT NULL DEFAULT 1 CHECK(is_cleared IN (0, 1)),
    clearance_date TEXT,
    journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 23. DAILY CLOSINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_closings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    closing_date TEXT UNIQUE NOT NULL,
    opening_cash INTEGER NOT NULL DEFAULT 0,
    opening_cash_paisa INTEGER NOT NULL DEFAULT 0,
    cash_sales_paisa INTEGER NOT NULL DEFAULT 0 CHECK(cash_sales_paisa >= 0),
    udhaar_recoveries_paisa INTEGER NOT NULL DEFAULT 0 CHECK(udhaar_recoveries_paisa >= 0),
    crate_deposits_paisa INTEGER NOT NULL DEFAULT 0 CHECK(crate_deposits_paisa >= 0),
    other_cash_in_paisa INTEGER NOT NULL DEFAULT 0 CHECK(other_cash_in_paisa >= 0),
    total_cash_in INTEGER NOT NULL DEFAULT 0 CHECK(total_cash_in >= 0),
    total_cash_in_paisa INTEGER NOT NULL DEFAULT 0 CHECK(total_cash_in_paisa >= 0),
    supplier_payments_paisa INTEGER NOT NULL DEFAULT 0 CHECK(supplier_payments_paisa >= 0),
    cash_purchases_paisa INTEGER NOT NULL DEFAULT 0 CHECK(cash_purchases_paisa >= 0),
    expenses_paid_paisa INTEGER NOT NULL DEFAULT 0 CHECK(expenses_paid_paisa >= 0),
    deposit_refunds_paisa INTEGER NOT NULL DEFAULT 0 CHECK(deposit_refunds_paisa >= 0),
    bank_deposits_paisa INTEGER NOT NULL DEFAULT 0 CHECK(bank_deposits_paisa >= 0),
    owner_drawings_paisa INTEGER NOT NULL DEFAULT 0 CHECK(owner_drawings_paisa >= 0),
    total_cash_out INTEGER NOT NULL DEFAULT 0 CHECK(total_cash_out >= 0),
    total_cash_out_paisa INTEGER NOT NULL DEFAULT 0 CHECK(total_cash_out_paisa >= 0),
    expected_closing_cash INTEGER NOT NULL DEFAULT 0,
    expected_closing_cash_paisa INTEGER NOT NULL DEFAULT 0,
    physical_closing_cash INTEGER NOT NULL DEFAULT 0 CHECK(physical_closing_cash >= 0),
    physical_closing_cash_paisa INTEGER NOT NULL DEFAULT 0 CHECK(physical_closing_cash_paisa >= 0),
    cash_variance INTEGER NOT NULL DEFAULT 0,
    variance_paisa INTEGER NOT NULL DEFAULT 0,
    denominations_json TEXT NOT NULL DEFAULT '{}',
    total_sales_invoiced INTEGER NOT NULL DEFAULT 0,
    total_sales_invoiced_paisa INTEGER NOT NULL DEFAULT 0,
    total_credit_sales INTEGER NOT NULL DEFAULT 0,
    total_credit_sales_paisa INTEGER NOT NULL DEFAULT 0,
    variance_reason TEXT,
    status TEXT NOT NULL DEFAULT 'LOCKED',
    is_locked BOOLEAN NOT NULL DEFAULT 1 CHECK(is_locked IN (0, 1)),
    closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    closed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku_code);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_packaging_units_product ON packaging_units(product_id);
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_route ON customers(route_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_date ON sales_invoices(customer_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_date ON sales_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(status);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice ON sales_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_product ON sales_invoice_items(product_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date ON purchase_invoices(purchase_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product ON inventory_batches(product_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_customer ON journal_lines(customer_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_supplier ON journal_lines(supplier_id);
CREATE INDEX IF NOT EXISTS idx_cash_book_date ON cash_book(entry_date);

CREATE INDEX IF NOT EXISTS idx_empties_ledger_entity ON empties_ledger(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_empties_ledger_date ON empties_ledger(entry_date);
CREATE INDEX IF NOT EXISTS idx_security_deposits_customer ON security_deposits(customer_id);

CREATE INDEX IF NOT EXISTS idx_delivery_sheets_route_date ON delivery_sheets(route_id, sheet_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================================================
-- DEFENSIVE TRIGGERS
-- ============================================================================
CREATE TRIGGER IF NOT EXISTS trg_prevent_insert_locked_sales_invoice
BEFORE INSERT ON sales_invoices
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = NEW.invoice_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot create a sales invoice on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_insert_locked_purchase_invoice
BEFORE INSERT ON purchase_invoices
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = NEW.purchase_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot create a purchase invoice on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_update_locked_purchase_invoice
BEFORE UPDATE ON purchase_invoices
FOR EACH ROW
WHEN OLD.is_locked = 1
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot modify a purchase invoice on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_locked_purchase_invoice
BEFORE DELETE ON purchase_invoices
FOR EACH ROW
WHEN OLD.is_locked = 1
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot delete a purchase invoice on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_update_locked_sales_invoice
BEFORE UPDATE ON sales_invoices
FOR EACH ROW
WHEN OLD.is_locked = 1
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot modify a sales invoice on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_locked_sales_invoice
BEFORE DELETE ON sales_invoices
FOR EACH ROW
WHEN OLD.is_locked = 1
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot delete a sales invoice on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_update_daily_closing
BEFORE UPDATE ON daily_closings
FOR EACH ROW
WHEN OLD.is_locked = 1
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot modify a finalized daily closing record.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_daily_closing
BEFORE DELETE ON daily_closings
FOR EACH ROW
WHEN OLD.is_locked = 1
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot delete a finalized daily closing record.');
END;


CREATE TRIGGER IF NOT EXISTS trg_prevent_update_locked_cash_book
BEFORE UPDATE ON cash_book
FOR EACH ROW
WHEN OLD.is_locked = 1
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot modify cash book record on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_cash_book
BEFORE DELETE ON cash_book
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Deletion Forbidden: Cash book records are permanent and immutable.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_update_audit_logs
BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Tamper Protection: Audit logs cannot be updated.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_audit_logs
BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Tamper Protection: Audit logs cannot be deleted.');
END;
"#;

pub const SEED_DATA_SQL: &str = r#"
-- 1. Standard Chart of Accounts (COA)
INSERT OR IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, parent_code, is_system, description) VALUES
(1, 1000, 'ASSETS', 'ASSET', NULL, 1, 'Master Asset Control Account'),
(2, 1010, 'Cash on Hand (Cash Book Drawer)', 'ASSET', 1000, 1, 'Physical cash in office safe and cashier drawer'),
(3, 1020, 'Bank Account - Main Operating', 'ASSET', 1000, 1, 'Commercial Bank current operating account'),
(4, 1030, 'Petty Cash / Driver Floating Cash', 'ASSET', 1000, 1, 'Float cash held by route delivery salesmen'),
(5, 1100, 'Inventory - Liquid Beverages', 'ASSET', 1000, 1, 'Wholesale liquid drinks warehouse stock at landed cost'),
(6, 1110, 'Inventory - Empties (Glass & Crates)', 'ASSET', 1000, 1, 'Physical returnable glass bottles and plastic crates'),
(7, 1150, 'Company Claims Receivable', 'ASSET', 1000, 1, 'Damaged, flat or leaking drinks claimable from Nextco'),
(8, 1200, 'Accounts Receivable - Trade Customers', 'ASSET', 1000, 1, 'Customer trade credit (Udhaar) ledger'),
(9, 1250, 'Driver Shortage & Discrepancy Receivables', 'ASSET', 1000, 1, 'Cash or stock shortages due from delivery staff'),
(10, 1300, 'Fixed Assets', 'ASSET', 1000, 1, 'Delivery vehicles, chillers, warehouse racking'),
(11, 1310, 'Accumulated Depreciation', 'ASSET', 1000, 1, 'Contra-asset: accumulated depreciation'),
(12, 2000, 'LIABILITIES', 'LIABILITY', NULL, 1, 'Master Liability Control Account'),
(13, 2010, 'Accounts Payable - Nextco Principal', 'LIABILITY', 2000, 1, 'Payables to Nextco beverage factory for drink consignments'),
(14, 2020, 'Accounts Payable - Transporters', 'LIABILITY', 2000, 1, 'Inward freight payables to trucking companies'),
(15, 2030, 'Accounts Payable - General Trade Creditors', 'LIABILITY', 2000, 1, 'General vendor payables'),
(16, 2100, 'Customer Crate Security Deposits Payable', 'LIABILITY', 2000, 1, 'Refundable cash security deposits held for empties'),
(17, 2200, 'Accrued Expenses & Salaries Payable', 'LIABILITY', 2000, 1, 'Outstanding operating liabilities'),
(18, 3000, 'EQUITY / CAPITAL', 'EQUITY', NULL, 1, 'Master Equity Control Account'),
(19, 3010, 'Owner Capital (Afzal Ali Dogar)', 'EQUITY', 3000, 1, 'Proprietor initial and subsequent capital investment'),
(20, 3020, 'Retained Earnings', 'EQUITY', 3000, 1, 'Accumulated net business profit/loss'),
(21, 3030, 'Owner Drawings', 'EQUITY', 3000, 1, 'Personal withdrawals of cash/stock by owner'),
(22, 4000, 'OPERATING REVENUE', 'REVENUE', NULL, 1, 'Master Revenue Control Account'),
(23, 4010, 'Beverage Sales Revenue', 'REVENUE', 4000, 1, 'Gross sales of drinks less trade discounts'),
(24, 4020, 'Freight & Delivery Service Income', 'REVENUE', 4000, 1, 'Delivery and unloading surcharges billed to retailers'),
(25, 5000, 'COST OF GOODS SOLD (COGS)', 'COGS', NULL, 1, 'Master COGS Control Account'),
(26, 5010, 'Cost of Goods Sold - Beverages', 'COGS', 5000, 1, 'Historical landed cost of goods sold'),
(27, 5020, 'Inward Freight & Landed Transport Expense', 'COGS', 5000, 1, 'Direct freight capitalized into unit cost'),
(28, 5030, 'Unloading Labor (Palledari) Direct Expense', 'COGS', 5000, 1, 'Direct unloading labor capitalized into inventory'),
(29, 6000, 'OPERATING EXPENSES', 'EXPENSE', NULL, 1, 'Master Expense Control Account'),
(30, 6010, 'Delivery Vehicle Fuel (Diesel / Petrol)', 'EXPENSE', 6000, 1, 'Fleet fuel and oil expenditures'),
(31, 6020, 'Vehicle Maintenance & Repairs', 'EXPENSE', 6000, 1, 'Van mechanical servicing and tire replacement'),
(32, 6030, 'Driver & Van Crew Daily Allowances (Khurak)', 'EXPENSE', 6000, 1, 'Route meals and daily crew per diem'),
(33, 6040, 'Warehouse Staff & Salesmen Salaries', 'EXPENSE', 6000, 1, 'Permanent employee monthly payroll'),
(34, 6050, 'Breakage, Leakage & Loss Expense', 'EXPENSE', 6000, 1, 'Loss on broken glass bottles and leaked stock'),
(35, 6060, 'Bad Debts Expense', 'EXPENSE', 6000, 1, 'Uncollectible retailer Udhaar write-offs'),
(36, 6070, 'Warehouse Rent & Depot Utilities', 'EXPENSE', 6000, 1, 'Depot electricity, generator diesel, rent'),
(37, 6080, 'Office, Tea & General Expenses', 'EXPENSE', 6000, 1, 'Office stationery, guest hospitality, internet'),
(38, 6090, 'Cash Shortage / Variance Expense', 'EXPENSE', 6000, 1, 'Physical cash shortage identified during daily closing');

-- 2. App Settings Seed
INSERT OR IGNORE INTO app_settings (
    id, key, value, category, description, agency_name, tagline, address, phone, whatsapp, ntn_strn, invoice_prefix, default_crate_deposit, default_credit_days, auto_backup_on_close
) VALUES (
    1, 'agency_profile', 'Logar Traders', 'AGENCY', 'Main Business Profile',
    'Logar Traders - Nextco Logistics Agency',
    'Official Nextco Beverage Distribution Depot',
    'Nextco Beverage Depot, Main Bypass, Rahim Yar Khan',
    '+92 300 1234567',
    '+92 300 1234567',
    '7483921-5',
    'INV-',
    60000,
    14,
    1
);

-- 3. Default Users
INSERT OR IGNORE INTO users (id, username, password_hash, salt, full_name, role, phone, pin_code) VALUES
(1, 'admin', 'b109f3bbbc244eb82441917ed06d618b9008dd09b3befd1b5e07394c706a8bb980b1d7785e5976ec0329c1acf76a918e2cbe7f463428e0344b7fff18b82a0ac3', 's@lt_adm1n_2026', 'Afzal Ali Dogar', 'ADMIN', '+923001234567', '1234'),
(2, 'accountant', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b8553e1a0b3f5456b3e8a7c29e1f82b793d5671a823e5127f8a9287c8a329e123456', 's@lt_acc_2026', 'Muhammad Usman', 'ACCOUNTANT', '+923002345678', '2345'),
(3, 'salesman1', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b8553e1a0b3f5456b3e8a7c29e1f82b793d5671a823e5127f8a9287c8a329e123456', 's@lt_sls_2026', 'Tariq Mahmood', 'SALESMAN', '+923003456789', '3456'),
(4, 'warehouse1', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b8553e1a0b3f5456b3e8a7c29e1f82b793d5671a823e5127f8a9287c8a329e123456', 's@lt_wh_2026', 'Bilal Ahmed', 'WAREHOUSE', '+923004567890', '4567');

-- 4. Default Delivery Routes
INSERT OR IGNORE INTO delivery_routes (id, route_code, route_name, description, default_driver_id, default_vehicle_no) VALUES
(1, 'BEAT-01', 'City Center & Main Bazaar', 'Central retail market, grocery wholesale bazaar and old city shops', 3, 'LES-2489'),
(2, 'BEAT-02', 'GT Road, Mills & Industrial Beat', 'Highway dhabas, roadside restaurants, textile and industrial zones', 3, 'LES-5512'),
(3, 'BEAT-03', 'Cantt, Housing Societies & Suburbs', 'Modern mart outlets, high-end bakeries, school and university canteens', 3, 'LES-8840');

-- 5. Beverage SKU Catalog
INSERT OR IGNORE INTO products (
    id, sku_code, name, brand, flavor, volume_ml, packaging_type, is_glass, requires_crate,
    base_unit_name, default_pack_name, units_per_pack,
    purchase_price_pack, purchase_price_pack_paisa,
    wholesale_price_pack_paisa, retail_price_pack_paisa,
    sale_price_pack, sale_price_base, retail_price_base_paisa,
    crate_deposit_price, crate_deposit_paisa,
    bottle_deposit_price, bottle_deposit_paisa,
    stock_base_units, current_stock_base_units,
    empty_bottles_stock, empty_crates_stock, min_reorder_level_packs
) VALUES
(1, 'NC-250-RGB', 'Next Cola 250ml Glass Bottle', 'Next Cola', 'Cola', 250, 'RGB_GLASS', 1, 1, 'Bottle', 'Crate', 24, 180000, 180000, 216000, 240000, 216000, 10000, 10000, 60000, 60000, 2500, 2500, 12000, 12000, 500, 250, 30),
(2, 'NC-1.5-PET', 'Next Cola 1.5L PET Bottle', 'Next Cola', 'Cola', 1500, 'PET_PLASTIC', 0, 0, 'Bottle', 'Pack', 6, 90000, 90000, 105000, 120000, 105000, 20000, 20000, 0, 0, 0, 0, 3000, 3000, 0, 0, 40),
(3, 'NC-500-PET', 'Next Cola 500ml PET Bottle', 'Next Cola', 'Cola', 500, 'PET_PLASTIC', 0, 0, 'Bottle', 'Pack', 12, 108000, 108000, 126000, 144000, 126000, 12000, 12000, 0, 0, 0, 0, 6000, 6000, 0, 0, 30),
(4, 'NC-250-CAN', 'Next Cola 250ml Sleek Can', 'Next Cola', 'Cola', 250, 'CAN_ALU', 0, 0, 'Can', 'Tray', 24, 216000, 216000, 240000, 264000, 240000, 11000, 11000, 0, 0, 0, 0, 2400, 2400, 0, 0, 25),
(5, 'FZ-250-RGB', 'Fizz Up Lemon 250ml Glass Bottle', 'Fizz Up', 'Lemon', 250, 'RGB_GLASS', 1, 1, 'Bottle', 'Crate', 24, 180000, 180000, 216000, 240000, 216000, 10000, 10000, 60000, 60000, 2500, 2500, 7200, 7200, 200, 100, 20),
(6, 'FZ-1.5-PET', 'Fizz Up Lemon 1.5L PET Bottle', 'Fizz Up', 'Lemon', 1500, 'PET_PLASTIC', 0, 0, 'Bottle', 'Pack', 6, 90000, 90000, 105000, 120000, 105000, 20000, 20000, 0, 0, 0, 0, 1800, 1800, 0, 0, 25),
(7, 'NO-250-RGB', 'Next Orange 250ml Glass Bottle', 'Next Orange', 'Orange', 250, 'RGB_GLASS', 1, 1, 'Bottle', 'Crate', 24, 180000, 180000, 216000, 240000, 216000, 10000, 10000, 60000, 60000, 2500, 2500, 4800, 4800, 150, 75, 15),
(8, 'NW-500-PET', 'Next Pure Mineral Water 500ml', 'Next Pure', 'Water', 500, 'PET_PLASTIC', 0, 0, 'Bottle', 'Pack', 24, 72000, 72000, 96000, 120000, 96000, 5000, 5000, 0, 0, 0, 0, 4800, 4800, 0, 0, 30),
(9, 'NW-1.5-PET', 'Next Pure Mineral Water 1.5L', 'Next Pure', 'Water', 1500, 'PET_PLASTIC', 0, 0, 'Bottle', 'Pack', 6, 45000, 45000, 60000, 72000, 60000, 12000, 12000, 0, 0, 0, 0, 2400, 2400, 0, 0, 30);

-- 6. Packaging Conversions
INSERT OR IGNORE INTO packaging_units (product_id, unit_name, multiplier_to_base, conversion_multiplier, is_base_unit, is_default_purchase_unit, is_default_sale_unit) VALUES
(1, 'Crate 24', 24, 24, 0, 1, 1),
(1, 'Bottle', 1, 1, 1, 0, 0),
(2, 'Pack 6', 6, 6, 0, 1, 1),
(2, 'Bottle', 1, 1, 1, 0, 0),
(3, 'Pack 12', 12, 12, 0, 1, 1),
(3, 'Bottle', 1, 1, 1, 0, 0),
(4, 'Tray 24', 24, 24, 0, 1, 1),
(4, 'Can', 1, 1, 1, 0, 0),
(5, 'Crate 24', 24, 24, 0, 1, 1),
(5, 'Bottle', 1, 1, 1, 0, 0),
(6, 'Pack 6', 6, 6, 0, 1, 1),
(6, 'Bottle', 1, 1, 1, 0, 0),
(7, 'Crate 24', 24, 24, 0, 1, 1),
(7, 'Bottle', 1, 1, 1, 0, 0),
(8, 'Pack 24', 24, 24, 0, 1, 1),
(8, 'Bottle', 1, 1, 1, 0, 0),
(9, 'Pack 6', 6, 6, 0, 1, 1),
(9, 'Bottle', 1, 1, 1, 0, 0);

-- 7. Baseline Customers & Suppliers
INSERT OR IGNORE INTO customers (
    id, code, name, shop_name, owner_name, phone, whatsapp, address, route_id, price_tier,
    credit_limit_amount, credit_limit_paisa, credit_limit_days, crate_limit,
    current_balance, current_balance_paisa, current_crate_balance, current_crates_balance
) VALUES
(1, 'CUST-101', 'Bismillah Kiryana Store', 'Bismillah Kiryana Store', 'Haji Bismillah Khan', '+923001112233', '+923001112233', 'Main Bazaar, Shop #12', 1, 'WHOLESALE', 20000000, 20000000, 14, 50, 0, 0, 15, 15),
(2, 'CUST-102', 'Al-Madina Super Mart', 'Al-Madina Super Mart', 'Chaudhry Akram', '+923012223344', '+923012223344', 'GT Road, Near Shell Petrol Station', 2, 'WHOLESALE', 30000000, 30000000, 21, 80, 0, 0, 0, 0),
(3, 'CUST-103', 'Subhanallah Cold Corner', 'Subhanallah Cold Corner', 'Tariq Butt', '+923023334455', '+923023334455', 'Cantt Commercial Plaza, Shop #4', 3, 'RETAIL', 10000000, 10000000, 7, 30, 0, 0, 0, 0);

INSERT OR IGNORE INTO suppliers (
    id, code, name, company_name, contact_person, phone, email, address, supplier_type,
    current_payable, current_payable_paisa, crates_owed_to_company
) VALUES
(1, 'SUPP-001', 'Nextco Beverages Plant Hub', 'Nextco Beverages Plant Hub', 'Engr. Imran Khan', '+923451122334', 'orders@nextco.com.pk', 'Nextco Bottling Plant, Industrial Estate Hub', 'PRINCIPAL_BEVERAGE', 0, 0, 0),
(2, 'SUPP-002', 'Al-Madina Freight Services', 'Al-Madina Freight Services', 'Malik Riaz', '+923334455667', 'freight@almadina.pk', 'Main Goods Transport Adda, Ring Road', 'FREIGHT_TRANSPORTER', 0, 0, 0);
"#;
