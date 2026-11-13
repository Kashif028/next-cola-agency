use std::time::Instant;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use crate::db::schema::{SCHEMA_DDL, SEED_DATA_SQL};
use crate::domain::errors::AppError;

pub struct MigrationStep {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATION_003_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS breakage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    broken_base_units INTEGER NOT NULL CHECK(broken_base_units > 0),
    unit_cost REAL NOT NULL DEFAULT 0.0,
    unit_cost_paisa INTEGER NOT NULL CHECK(unit_cost_paisa >= 0),
    total_loss_amount REAL NOT NULL DEFAULT 0.0,
    total_loss_paisa INTEGER NOT NULL CHECK(total_loss_paisa >= 0),
    cause TEXT NOT NULL,
    incident_location TEXT NOT NULL,
    responsible_person TEXT,
    action_taken TEXT NOT NULL CHECK(action_taken IN ('EXPENSE', 'STAFF_RECOVERY', 'COMPANY_CLAIM')),
    notes TEXT,
    journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_breakage_logs_product ON breakage_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_breakage_logs_date ON breakage_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_breakage_logs_action ON breakage_logs(action_taken);

CREATE TABLE IF NOT EXISTS stock_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    location_type TEXT NOT NULL CHECK(location_type IN ('WAREHOUSE', 'VEHICLE', 'QUARANTINE', 'TRANSIT')),
    reference_id INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO stock_locations (id, code, name, location_type, reference_id) VALUES
(1, 'LOC-WH-MAIN', 'Main Depot Warehouse', 'WAREHOUSE', NULL),
(2, 'LOC-VAN-01', 'Delivery Van Beat-01 (LES-2489)', 'VEHICLE', 1),
(3, 'LOC-VAN-02', 'Delivery Van Beat-02 (LES-5512)', 'VEHICLE', 2),
(4, 'LOC-VAN-03', 'Delivery Van Beat-03 (LES-8840)', 'VEHICLE', 3),
(5, 'LOC-DAMAGED', 'Damaged & Breakage Quarantine Bay', 'QUARANTINE', NULL);

CREATE TABLE IF NOT EXISTS product_location_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
    balance_base_units INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(product_id, location_id)
);

INSERT OR IGNORE INTO product_location_balances (product_id, location_id, balance_base_units)
SELECT id, 1, stock_base_units FROM products;

CREATE TABLE IF NOT EXISTS entity_crate_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('CUSTOMER', 'SUPPLIER', 'WAREHOUSE', 'VAN_ROUTE')),
    entity_id INTEGER NOT NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
    current_crates_balance INTEGER NOT NULL DEFAULT 0,
    current_bottles_balance INTEGER NOT NULL DEFAULT 0,
    deposit_balance_paisa INTEGER NOT NULL DEFAULT 0,
    last_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(entity_type, entity_id, product_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movement_code TEXT UNIQUE NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('PURCHASE', 'SALE', 'SALE_RETURN', 'BREAKAGE', 'TRANSFER', 'MANUAL_ADJUSTMENT', 'PURCHASE_RECEIPT', 'POS_SALE', 'VAN_DISPATCH', 'VAN_SALE', 'VAN_RETURN', 'BREAKAGE_WAREHOUSE', 'BREAKAGE_VAN', 'COMPANY_CLAIM', 'STOCK_ADJUSTMENT')),
    from_location_id INTEGER REFERENCES stock_locations(id),
    to_location_id INTEGER REFERENCES stock_locations(id),
    delta_base_units INTEGER NOT NULL DEFAULT 0,
    quantity_base_units INTEGER NOT NULL DEFAULT 0,
    pack_qty INTEGER NOT NULL DEFAULT 0,
    loose_qty INTEGER NOT NULL DEFAULT 0,
    unit_cost_paisa INTEGER NOT NULL DEFAULT 0,
    total_cost_paisa INTEGER NOT NULL DEFAULT 0,
    previous_stock_base_units INTEGER NOT NULL DEFAULT 0,
    new_stock_base_units INTEGER NOT NULL DEFAULT 0,
    reference_type TEXT NOT NULL DEFAULT '',
    reference_id INTEGER,
    reference_doc_type TEXT,
    reference_doc_id INTEGER,
    reference_doc_number TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_prod_loc_balances ON product_location_balances(product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_entity_crate_balances_lookup ON entity_crate_balances(entity_type, entity_id, product_id);
"#;

pub const MIGRATION_004_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS sales_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT UNIQUE NOT NULL,
    invoice_id INTEGER REFERENCES sales_invoices(id) ON DELETE SET NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    return_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
    total_return_paisa INTEGER NOT NULL DEFAULT 0 CHECK(total_return_paisa >= 0),
    refund_mode TEXT NOT NULL CHECK(refund_mode IN ('CREDIT_NOTE', 'CASH', 'BANK')),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'APPROVED' CHECK(status IN ('APPROVED', 'PENDING', 'CANCELLED')),
    is_cancelled BOOLEAN NOT NULL DEFAULT 0 CHECK(is_cancelled IN (0, 1)),
    is_locked BOOLEAN NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sales_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    base_units INTEGER NOT NULL CHECK(base_units >= 0),
    refund_rate_paisa INTEGER NOT NULL CHECK(refund_rate_paisa >= 0),
    line_total_paisa INTEGER NOT NULL CHECK(line_total_paisa >= 0),
    condition TEXT NOT NULL CHECK(condition IN ('SALABLE', 'DAMAGED')),
    breakage_log_id INTEGER REFERENCES breakage_logs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS supplier_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    entry_date TEXT NOT NULL,
    voucher_type TEXT NOT NULL CHECK(voucher_type IN ('PURCHASE', 'CASH_PAYMENT', 'BANK_PAYMENT', 'PURCHASE_RETURN', 'ADJUSTMENT')),
    voucher_ref_id INTEGER,
    description TEXT NOT NULL,
    debit INTEGER NOT NULL DEFAULT 0,
    credit INTEGER NOT NULL DEFAULT 0,
    running_balance INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO chart_of_accounts (
    id, account_code, account_name, account_type, parent_code, is_system, is_active, description
) VALUES (
    39, 4090, 'Miscellaneous Income / Cash Excess', 'REVENUE', 4000, 1, 1, 'Physical cash overage and excess identified during daily closing ceremony'
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier_date ON supplier_ledger(supplier_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON daily_closings(closing_date);

CREATE VIEW IF NOT EXISTS purchase_items AS
SELECT 
    id, purchase_id, product_id, pack_qty, loose_qty, total_base_units,
    (pack_purchase_rate_paisa / 100.0) AS unit_cost,
    (line_total_paisa / 100.0) AS line_total
FROM purchase_invoice_items;

CREATE TRIGGER IF NOT EXISTS trg_prevent_update_locked_sales_returns
BEFORE UPDATE ON sales_returns
FOR EACH ROW
WHEN OLD.is_locked = 1
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot modify a sales return on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_locked_sales_returns
BEFORE DELETE ON sales_returns
FOR EACH ROW
WHEN OLD.is_locked = 1
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot delete a sales return on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_insert_locked_sales_return
BEFORE INSERT ON sales_returns
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = NEW.return_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot create a sales return on a locked accounting date.');
END;
"#;

pub const MIGRATION_005_SQL: &str = r#"
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

CREATE TRIGGER IF NOT EXISTS trg_prevent_insert_locked_sales_return
BEFORE INSERT ON sales_returns
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = NEW.return_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot create a sales return on a locked accounting date.');
END;
"#;

pub const MIGRATION_006_SQL: &str = r#"
-- 1. Enhance Customer Ledger with integer Paisa columns and indexes
ALTER TABLE customer_ledger ADD COLUMN voucher_number TEXT;
ALTER TABLE customer_ledger ADD COLUMN debit_paisa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_ledger ADD COLUMN credit_paisa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_ledger ADD COLUMN running_balance_paisa INTEGER NOT NULL DEFAULT 0;

UPDATE customer_ledger SET
    debit_paisa = debit * 100,
    credit_paisa = credit * 100,
    running_balance_paisa = running_balance * 100
WHERE debit_paisa = 0 AND credit_paisa = 0 AND (debit != 0 OR credit != 0 OR running_balance != 0);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_date ON customer_ledger(customer_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_date ON customer_ledger(entry_date);

-- 2. Enhance Supplier Ledger with integer Paisa columns and indexes
ALTER TABLE supplier_ledger ADD COLUMN voucher_number TEXT;
ALTER TABLE supplier_ledger ADD COLUMN debit_paisa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supplier_ledger ADD COLUMN credit_paisa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supplier_ledger ADD COLUMN running_balance_paisa INTEGER NOT NULL DEFAULT 0;

UPDATE supplier_ledger SET
    debit_paisa = debit * 100,
    credit_paisa = credit * 100,
    running_balance_paisa = running_balance * 100
WHERE debit_paisa = 0 AND credit_paisa = 0 AND (debit != 0 OR credit != 0 OR running_balance != 0);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_date ON supplier_ledger(entry_date);

-- 3. Master Bank Accounts Table
CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_name TEXT NOT NULL,
    account_number TEXT UNIQUE NOT NULL,
    account_title TEXT NOT NULL,
    branch TEXT,
    iban TEXT,
    opening_balance_paisa INTEGER NOT NULL DEFAULT 0,
    current_balance_paisa INTEGER NOT NULL DEFAULT 0,
    current_balance REAL NOT NULL DEFAULT 0.0,
    is_active BOOLEAN NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO bank_accounts (
    id, bank_name, account_number, account_title, branch, iban,
    opening_balance_paisa, current_balance_paisa, current_balance, is_active
) VALUES (
    1, 'Meezan Bank Limited', '0102-0103948101', 'Logar Traders - Operating Account',
    'Main Branch, Rahim Yar Khan', 'PK45MEZN0001020103948101',
    10000000, 10000000, 100000.0, 1
);

-- 4. Operating Expenses Table
CREATE TABLE IF NOT EXISTS operating_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_number TEXT,
    expense_date TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    account_code INTEGER NOT NULL DEFAULT 0,
    amount REAL NOT NULL CHECK(amount >= 0.0),
    amount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(amount_paisa >= 0),
    payment_mode TEXT NOT NULL CHECK(payment_mode IN ('CASH', 'BANK')),
    bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    recipient_name TEXT DEFAULT '',
    description TEXT NOT NULL,
    receipt_ref_no TEXT,
    delivery_sheet_id INTEGER,
    trip_id INTEGER,
    journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
    cash_book_id INTEGER REFERENCES cash_book(id) ON DELETE SET NULL,
    bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE SET NULL,
    is_locked BOOLEAN NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_operating_expenses_date ON operating_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_account ON operating_expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_mode ON operating_expenses(payment_mode);
CREATE INDEX IF NOT EXISTS idx_bank_tx_account ON bank_transactions(bank_name, account_number);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(transaction_date);

CREATE TRIGGER IF NOT EXISTS trg_operating_expenses_defaults
AFTER INSERT ON operating_expenses
FOR EACH ROW
BEGIN
    UPDATE operating_expenses
    SET 
        expense_number = CASE WHEN NEW.expense_number IS NULL OR NEW.expense_number = '' THEN 'EXP-' || NEW.id ELSE NEW.expense_number END,
        amount_paisa = CASE WHEN NEW.amount_paisa = 0 AND NEW.amount > 0 THEN CAST(ROUND(NEW.amount * 100) AS INTEGER) ELSE NEW.amount_paisa END,
        amount = CASE WHEN NEW.amount = 0.0 AND NEW.amount_paisa > 0 THEN NEW.amount_paisa / 100.0 ELSE NEW.amount END,
        account_code = CASE WHEN NEW.account_code = 0 THEN (SELECT COALESCE(account_code, NEW.account_id) FROM chart_of_accounts WHERE id = NEW.account_id OR account_code = NEW.account_id) ELSE NEW.account_code END
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_insert_locked_operating_expense
BEFORE INSERT ON operating_expenses
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = NEW.expense_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot record an operating expense on a locked accounting date.');
END;

DROP TRIGGER IF EXISTS trg_prevent_update_locked_operating_expense;
CREATE TRIGGER IF NOT EXISTS trg_prevent_update_locked_operating_expense
BEFORE UPDATE ON operating_expenses
FOR EACH ROW
WHEN OLD.is_locked = 1 OR EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = OLD.expense_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot modify an expense on a locked accounting date.');
END;

DROP TRIGGER IF EXISTS trg_prevent_delete_operating_expense;
CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_operating_expense
BEFORE DELETE ON operating_expenses
FOR EACH ROW
WHEN OLD.is_locked = 1 OR EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = OLD.expense_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Operating expenses cannot be deleted on a locked accounting date.');
END;

-- 5. Customer Recoveries & Allocations
CREATE TABLE IF NOT EXISTS customer_recoveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recovery_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    recovery_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
    amount_paisa INTEGER NOT NULL CHECK(amount_paisa > 0),
    amount REAL NOT NULL CHECK(amount > 0.0),
    payment_mode TEXT NOT NULL CHECK(payment_mode IN ('CASH', 'BANK', 'CHEQUE')),
    allocation_mode TEXT NOT NULL CHECK(allocation_mode IN ('FIFO', 'SPECIFIC', 'ON_ACCOUNT')),
    bank_name TEXT,
    instrument_number TEXT,
    instrument_date TEXT,
    notes TEXT,
    previous_balance_paisa INTEGER NOT NULL,
    new_balance_paisa INTEGER NOT NULL,
    unallocated_remainder_paisa INTEGER NOT NULL DEFAULT 0,
    journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
    cash_book_id INTEGER REFERENCES cash_book(id) ON DELETE SET NULL,
    bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE SET NULL,
    is_locked BOOLEAN NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS recovery_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recovery_id INTEGER NOT NULL REFERENCES customer_recoveries(id) ON DELETE CASCADE,
    invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
    allocated_paisa INTEGER NOT NULL CHECK(allocated_paisa > 0),
    previous_invoice_due_paisa INTEGER NOT NULL,
    new_invoice_due_paisa INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_customer_recoveries_cust ON customer_recoveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_recoveries_date ON customer_recoveries(recovery_date);
CREATE INDEX IF NOT EXISTS idx_recovery_allocations_recovery ON recovery_allocations(recovery_id);
CREATE INDEX IF NOT EXISTS idx_recovery_allocations_invoice ON recovery_allocations(invoice_id);

CREATE TRIGGER IF NOT EXISTS trg_prevent_insert_locked_recovery
BEFORE INSERT ON customer_recoveries
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = NEW.recovery_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot record recovery on a locked accounting date.');
END;

DROP TRIGGER IF EXISTS trg_prevent_update_locked_recovery;
CREATE TRIGGER IF NOT EXISTS trg_prevent_update_locked_recovery
BEFORE UPDATE ON customer_recoveries
FOR EACH ROW
WHEN OLD.is_locked = 1 OR EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = OLD.recovery_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot modify a recovery on a locked accounting date.');
END;

DROP TRIGGER IF EXISTS trg_prevent_delete_locked_recovery;
CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_locked_recovery
BEFORE DELETE ON customer_recoveries
FOR EACH ROW
WHEN OLD.is_locked = 1 OR EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = OLD.recovery_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot delete a recovery on a locked accounting date.');
END;
"#;

pub const MIGRATION_007_SQL: &str = r#"
-- ============================================================================
-- MIGRATION 007: VEHICLES MASTER, LOGISTICS DISPATCH & SETTLEMENT SCHEMA
-- ============================================================================

-- 1. Create Vehicles Fleet Table
CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_number TEXT UNIQUE NOT NULL,
    model TEXT NOT NULL,
    capacity_crates INTEGER NOT NULL DEFAULT 150 CHECK(capacity_crates > 0),
    capacity_weight_kg REAL NOT NULL DEFAULT 1500.0 CHECK(capacity_weight_kg > 0.0),
    default_driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    stock_location_id INTEGER REFERENCES stock_locations(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    current_odometer_km INTEGER NOT NULL DEFAULT 0 CHECK(current_odometer_km >= 0),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_vehicles_number ON vehicles(vehicle_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON vehicles(default_driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_location ON vehicles(stock_location_id);

-- 2. Seed Baseline Vehicles
INSERT OR IGNORE INTO vehicles (id, vehicle_number, model, capacity_crates, capacity_weight_kg, default_driver_id, driver_id, stock_location_id, current_odometer_km, notes) VALUES
(1, 'LES-2489', 'Suzuki Ravi 800cc Pick-up', 120, 800.0, 3, 3, 2, 45200, 'Beat-01 City Center Distribution Van'),
(2, 'LES-5512', 'Isuzu NPR 4.5-Ton Heavy Truck', 350, 4500.0, 3, 3, 3, 89100, 'Beat-02 GT Road & Industrial Beat Consignment Truck'),
(3, 'LES-8840', 'Hyundai Shehzore 1.5-Ton Van', 180, 1500.0, 3, 3, 4, 62400, 'Beat-03 Cantt & Societies Delivery Van');

-- 3. Update Stock Locations with Vehicle References
UPDATE stock_locations SET reference_id = 1 WHERE id = 2;
UPDATE stock_locations SET reference_id = 2 WHERE id = 3;
UPDATE stock_locations SET reference_id = 3 WHERE id = 4;

-- 4. Enhance delivery_routes
ALTER TABLE delivery_routes ADD COLUMN default_vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL;
ALTER TABLE delivery_routes ADD COLUMN start_time TEXT DEFAULT '08:00';
ALTER TABLE delivery_routes ADD COLUMN target_daily_sales_paisa INTEGER NOT NULL DEFAULT 0;

UPDATE delivery_routes SET default_vehicle_id = 1 WHERE id = 1;
UPDATE delivery_routes SET default_vehicle_id = 2 WHERE id = 2;
UPDATE delivery_routes SET default_vehicle_id = 3 WHERE id = 3;

-- 5. Safe Table Migration for delivery_sheets (Supporting DRAFT & ISSUED Statuses)
CREATE TABLE delivery_sheets_dg_tmp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_number TEXT UNIQUE NOT NULL,
    trip_code TEXT UNIQUE,
    sheet_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
    trip_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
    route_id INTEGER NOT NULL REFERENCES delivery_routes(id) ON DELETE RESTRICT,
    driver_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    driver_name TEXT NOT NULL DEFAULT 'Driver',
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    vehicle_number TEXT NOT NULL DEFAULT 'LES-1000',
    helper_name TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'ISSUED', 'DISPATCHED', 'COMPLETED', 'SETTLED', 'AUDITED')),
    dispatched_at TEXT,
    departure_time TEXT,
    returned_at TEXT,
    opening_km INTEGER,
    closing_km INTEGER,
    morning_dispatcher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    empty_crates_loaded INTEGER NOT NULL DEFAULT 0 CHECK(empty_crates_loaded >= 0),
    total_load_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK(total_load_cost_paisa >= 0),
    total_load_retail_paisa INTEGER NOT NULL DEFAULT 0 CHECK(total_load_retail_paisa >= 0),
    expected_cash_paisa INTEGER NOT NULL DEFAULT 0,
    actual_cash_paisa INTEGER NOT NULL DEFAULT 0,
    cash_variance_paisa INTEGER NOT NULL DEFAULT 0,
    empty_crates_expected INTEGER NOT NULL DEFAULT 0,
    empty_crates_returned INTEGER NOT NULL DEFAULT 0,
    crates_variance INTEGER NOT NULL DEFAULT 0,
    total_credit_sales_paisa INTEGER NOT NULL DEFAULT 0,
    total_recoveries_paisa INTEGER NOT NULL DEFAULT 0,
    total_route_expenses_paisa INTEGER NOT NULL DEFAULT 0,
    shortage_journal_entry_id INTEGER REFERENCES journal_entries(id),
    cash_book_entry_id INTEGER REFERENCES cash_book(id),
    is_locked BOOLEAN NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
    settlement_notes TEXT,
    notes TEXT,
    settled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO delivery_sheets_dg_tmp (
    id, sheet_number, trip_code, sheet_date, trip_date, route_id, driver_id, driver_name,
    vehicle_number, status, dispatched_at, returned_at, opening_km, closing_km,
    expected_cash_paisa, actual_cash_paisa, cash_variance_paisa,
    empty_crates_expected, empty_crates_returned, crates_variance,
    settlement_notes, notes, settled_by, created_by, created_at, updated_at
)
SELECT 
    id, sheet_number, trip_code, sheet_date, trip_date, route_id, driver_id, driver_name,
    vehicle_number, status, dispatched_at, returned_at, opening_km, closing_km,
    expected_cash_paisa, actual_cash_paisa, cash_variance_paisa,
    empty_crates_expected, empty_crates_returned, crates_variance,
    settlement_notes, notes, settled_by, created_by, created_at, updated_at
FROM delivery_sheets;

DROP TABLE delivery_sheets;
ALTER TABLE delivery_sheets_dg_tmp RENAME TO delivery_sheets;

CREATE INDEX IF NOT EXISTS idx_delivery_sheets_route_date ON delivery_sheets(route_id, sheet_date);
CREATE INDEX IF NOT EXISTS idx_delivery_sheets_status ON delivery_sheets(status);
CREATE INDEX IF NOT EXISTS idx_delivery_sheets_vehicle ON delivery_sheets(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_delivery_sheets_driver ON delivery_sheets(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_sheets_date ON delivery_sheets(sheet_date);

-- 6. Safe Table Migration for compatibility delivery_trips
CREATE TABLE delivery_trips_dg_tmp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_code TEXT UNIQUE NOT NULL,
    trip_date TEXT NOT NULL,
    route_id INTEGER NOT NULL REFERENCES delivery_routes(id),
    driver_name TEXT NOT NULL,
    vehicle_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'ISSUED', 'DISPATCHED', 'COMPLETED', 'SETTLED', 'AUDITED')),
    dispatched_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    returned_at TEXT,
    opening_km INTEGER,
    closing_km INTEGER,
    notes TEXT
);

INSERT INTO delivery_trips_dg_tmp (id, trip_code, trip_date, route_id, driver_name, vehicle_number, status, dispatched_at, returned_at, opening_km, closing_km, notes)
SELECT id, trip_code, trip_date, route_id, driver_name, vehicle_number, status, dispatched_at, returned_at, opening_km, closing_km, notes
FROM delivery_trips;

DROP TABLE delivery_trips;
ALTER TABLE delivery_trips_dg_tmp RENAME TO delivery_trips;

-- 7. Enhance delivery_items with Landed Cost and Retail Price Snapshots
ALTER TABLE delivery_items ADD COLUMN unit_cost_paisa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE delivery_items ADD COLUMN unit_price_paisa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE delivery_items ADD COLUMN line_cost_paisa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE delivery_items ADD COLUMN line_retail_paisa INTEGER NOT NULL DEFAULT 0;

-- 7b. Link customer recoveries to route delivery sheets for driver cash reconciliation
ALTER TABLE customer_recoveries ADD COLUMN delivery_sheet_id INTEGER REFERENCES delivery_sheets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customer_recoveries_sheet ON customer_recoveries(delivery_sheet_id);

-- 8. High-Performance Semantic Views
CREATE VIEW IF NOT EXISTS loading_sheets AS
SELECT 
    id, sheet_number, sheet_date, route_id, driver_id, driver_name,
    vehicle_id, vehicle_number, helper_name, status, dispatched_at,
    departure_time, returned_at, opening_km, closing_km, morning_dispatcher_id,
    empty_crates_loaded, total_load_cost_paisa, total_load_retail_paisa,
    notes, created_by, created_at, updated_at
FROM delivery_sheets;

CREATE VIEW IF NOT EXISTS loading_sheet_items AS
SELECT
    id, sheet_id, product_id, loaded_packs, loaded_loose, total_loaded_base,
    unit_cost_paisa, unit_price_paisa, line_cost_paisa, line_retail_paisa,
    sold_base, returned_packs, returned_loose, total_returned_base,
    breakage_base, variance_base
FROM delivery_items;

-- 9. Master trip_settlements Table
CREATE TABLE IF NOT EXISTS trip_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER UNIQUE NOT NULL,
    sheet_id INTEGER REFERENCES delivery_sheets(id) ON DELETE SET NULL,
    settlement_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
    total_cash_sales_paisa INTEGER NOT NULL DEFAULT 0,
    total_cash_sales REAL NOT NULL DEFAULT 0.00,
    total_credit_sales_paisa INTEGER NOT NULL DEFAULT 0,
    total_credit_sales REAL NOT NULL DEFAULT 0.00,
    total_udhaar_recoveries_paisa INTEGER NOT NULL DEFAULT 0,
    total_udhaar_recoveries REAL NOT NULL DEFAULT 0.00,
    total_crate_deposits_paisa INTEGER NOT NULL DEFAULT 0,
    total_crate_deposits REAL NOT NULL DEFAULT 0.00,
    total_route_expenses_paisa INTEGER NOT NULL DEFAULT 0,
    total_route_expenses REAL NOT NULL DEFAULT 0.00,
    expected_cash_paisa INTEGER NOT NULL DEFAULT 0,
    expected_cash_deposit REAL NOT NULL DEFAULT 0.00,
    actual_cash_paisa INTEGER NOT NULL DEFAULT 0,
    actual_cash_handed_over REAL NOT NULL DEFAULT 0.00,
    cash_variance_paisa INTEGER NOT NULL DEFAULT 0,
    cash_variance REAL NOT NULL DEFAULT 0.00,
    driver_shortage_action TEXT NOT NULL DEFAULT 'BALANCED' CHECK(driver_shortage_action IN ('BALANCED', 'CHARGE_DRIVER', 'EXPENSE_WAIVER')),
    empty_crates_expected INTEGER NOT NULL DEFAULT 0,
    empty_crates_returned INTEGER NOT NULL DEFAULT 0,
    crates_variance INTEGER NOT NULL DEFAULT 0,
    settled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_trip_settlements_trip ON trip_settlements(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_settlements_date ON trip_settlements(settlement_date);
CREATE INDEX IF NOT EXISTS idx_trip_settlements_sheet ON trip_settlements(sheet_id);

-- 10. Defensive Day-Locking Triggers
CREATE TRIGGER IF NOT EXISTS trg_prevent_insert_locked_delivery_sheet
BEFORE INSERT ON delivery_sheets
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = NEW.sheet_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot create a loading sheet on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_update_locked_delivery_sheet
BEFORE UPDATE ON delivery_sheets
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = OLD.sheet_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot modify a delivery sheet on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_locked_delivery_sheet
BEFORE DELETE ON delivery_sheets
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = OLD.sheet_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot delete a delivery sheet on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_settle_locked_delivery_sheet
BEFORE UPDATE OF status ON delivery_sheets
FOR EACH ROW
WHEN NEW.status = 'SETTLED' AND EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = NEW.sheet_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot settle a delivery sheet on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_modify_settled_delivery_sheet
BEFORE UPDATE ON delivery_sheets
FOR EACH ROW
WHEN OLD.is_locked = 1 OR (OLD.status IN ('SETTLED', 'AUDITED') AND EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = OLD.sheet_date AND is_locked = 1))
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Settled delivery sheets cannot be altered on a locked accounting date.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_settled_delivery_sheet
BEFORE DELETE ON delivery_sheets
FOR EACH ROW
WHEN OLD.status IN ('SETTLED', 'AUDITED') OR OLD.is_locked = 1
BEGIN
    SELECT RAISE(ABORT, 'Deletion Forbidden: Settled delivery sheets are permanent audit records.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_insert_locked_trip_settlement
BEFORE INSERT ON trip_settlements
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_closings WHERE closing_date = NEW.settlement_date AND is_locked = 1)
BEGIN
    SELECT RAISE(ABORT, 'Access Denied: Cannot create trip settlement on a locked accounting date.');
END;
"#;

pub const MIGRATIONS: &[MigrationStep] = &[
    MigrationStep {
        version: 1,
        name: "initial_schema_24_tables",
        sql: SCHEMA_DDL,
    },
    MigrationStep {
        version: 2,
        name: "seed_initial_distribution_data",
        sql: SEED_DATA_SQL,
    },
    MigrationStep {
        version: 3,
        name: "breakage_logs_and_stock_movements",
        sql: MIGRATION_003_SQL,
    },
    MigrationStep {
        version: 4,
        name: "m3_purchases_returns_and_supplier_khata",
        sql: MIGRATION_004_SQL,
    },
    MigrationStep {
        version: 5,
        name: "m3_day_locking_creation_triggers",
        sql: MIGRATION_005_SQL,
    },
    MigrationStep {
        version: 6,
        name: "m4_accounting_ledgers_and_expenses_schema",
        sql: MIGRATION_006_SQL,
    },
    MigrationStep {
        version: 7,
        name: "m5_vehicles_logistics_and_settlement_schema",
        sql: MIGRATION_007_SQL,
    },
];

/// Runs all pending schema migrations inside an atomic transaction
pub fn run_migrations(conn: &mut Connection) -> Result<Vec<String>, AppError> {
    // 1. Establish performance PRAGMAs on migration connection
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = OFF;
         PRAGMA busy_timeout = 5000;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = -64000;
         PRAGMA temp_store = MEMORY;"
    )?;

    // 2. Ensure schema_migrations table exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER UNIQUE NOT NULL,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            checksum TEXT NOT NULL,
            execution_time_ms INTEGER NOT NULL
        );",
        [],
    )?;

    // 3. Query current migration version
    let current_version: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    let mut applied = Vec::new();

    // 4. Execute pending migrations inside atomic transactions
    for step in MIGRATIONS {
        if step.version > current_version {
            let start = Instant::now();
            let mut hasher = Sha256::new();
            hasher.update(step.sql.as_bytes());
            let checksum = hex::encode(hasher.finalize());

            let tx = conn.transaction()?;
            tx.execute_batch(step.sql)?;

            let elapsed_ms = start.elapsed().as_millis() as i64;

            tx.execute(
                "INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![step.version, step.name, checksum, elapsed_ms],
            )?;

            tx.commit()?;
            applied.push(format!("V{}: {}", step.version, step.name));
            log::info!("Applied migration V{}: {} ({} ms)", step.version, step.name, elapsed_ms);
        }
    }

    // Defensive schema check: Ensure customer_recoveries has delivery_sheet_id
    let has_sheet_col: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('customer_recoveries') WHERE name = 'delivery_sheet_id'",
            [],
            |r| Ok(r.get::<_, i64>(0)? > 0),
        )
        .unwrap_or(false);
    if !has_sheet_col {
        let table_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = 'customer_recoveries'",
                [],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);
        if table_exists {
            let _ = conn.execute(
                "ALTER TABLE customer_recoveries ADD COLUMN delivery_sheet_id INTEGER REFERENCES delivery_sheets(id) ON DELETE SET NULL;",
                [],
            );
            let _ = conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_customer_recoveries_sheet ON customer_recoveries(delivery_sheet_id);",
                [],
            );
        }
    }

    // 5. Re-enable foreign keys
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    Ok(applied)
}
