pub mod commands;
pub mod db;
pub mod domain;
pub mod services;

use commands::accounting_commands::{
    get_all_customers_aging_summary, get_bank_accounts, get_bank_reconciliation,
    get_cash_book_statement, get_chart_of_accounts, get_customer_aging_report,
    get_customer_ledger_statement, get_operating_expenses, get_profit_and_loss_report,
    get_supplier_ledger_statement, get_trial_balance_report, record_bank_transfer,
    record_customer_recovery, record_operating_expense, record_supplier_payment,
};
use commands::auth_commands::{
    get_current_user_permissions, get_user_list, list_audit_logs, login_credentials, login_pin,
    save_user, verify_supervisor_pin,
};
use commands::db_commands::{
    db_health_check, get_app_settings, init_schema, trigger_hot_backup, trigger_restore,
    update_app_settings, AppState,
};
use commands::inventory_commands::{
    inventory_adjust_stock, inventory_convert_base_to_pack, inventory_convert_pack_to_base,
    inventory_get_breakage_logs, inventory_get_customer_crate_ledger, inventory_get_empties_overview,
    inventory_get_packaging_units, inventory_get_stock_overview, inventory_record_breakage,
    inventory_record_crate_transaction, inventory_record_security_deposit,
    inventory_refund_security_deposit,
};
use commands::logistics_commands::{
    calculate_van_settlement, create_loading_sheet, create_route, create_vehicle, get_loading_sheet,
    get_route_by_id, get_routes, get_vehicle_by_id, get_vehicles, issue_loading_sheet,
    list_loading_sheets, submit_van_settlement, update_route, update_vehicle,
};
use commands::sales_commands::{
    closing_get_daily_summary, closing_get_history, closing_submit_closing,
    purchase_calculate_landed_cost, purchase_create_invoice, purchase_list_invoices,
    sales_cancel_invoice, sales_check_credit_status, sales_create_invoice, sales_get_invoice,
    sales_list_invoices, sales_list_returns, sales_record_return,
};
use db::migrations::run_migrations;
use db::pool::{create_db_pool, get_default_db_path};

pub fn run() {
    let db_path = get_default_db_path().expect("Failed to resolve database path");
    let pool = create_db_pool(&db_path).expect("Failed to initialize SQLite connection pool");

    // Execute automatic migrations on application startup
    {
        let mut conn = pool.get().expect("Failed to acquire connection for initial migrations");
        if let Err(e) = run_migrations(&mut conn) {
            log::error!("Failed to execute schema migrations on startup: {}", e);
        }
    }

    let app_state = AppState { pool, db_path };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            db_health_check,
            init_schema,
            trigger_hot_backup,
            trigger_restore,
            get_app_settings,
            update_app_settings,
            inventory_convert_pack_to_base,
            inventory_convert_base_to_pack,
            inventory_get_packaging_units,
            inventory_get_stock_overview,
            inventory_adjust_stock,
            inventory_get_empties_overview,
            inventory_record_crate_transaction,
            inventory_get_customer_crate_ledger,
            inventory_record_security_deposit,
            inventory_refund_security_deposit,
            inventory_record_breakage,
            inventory_get_breakage_logs,
            sales_create_invoice,
            sales_get_invoice,
            sales_list_invoices,
            sales_check_credit_status,
            purchase_create_invoice,
            purchase_calculate_landed_cost,
            purchase_list_invoices,
            sales_cancel_invoice,
            sales_record_return,
            sales_list_returns,
            closing_get_daily_summary,
            closing_submit_closing,
            closing_get_history,
            get_customer_ledger_statement,
            get_supplier_ledger_statement,
            get_customer_aging_report,
            get_all_customers_aging_summary,
            record_customer_recovery,
            record_supplier_payment,
            record_operating_expense,
            get_operating_expenses,
            get_cash_book_statement,
            get_bank_accounts,
            record_bank_transfer,
            get_bank_reconciliation,
            get_profit_and_loss_report,
            get_trial_balance_report,
            get_chart_of_accounts,
            // M5 Logistics Commands
            get_routes,
            create_route,
            update_route,
            get_route_by_id,
            get_vehicles,
            create_vehicle,
            update_vehicle,
            get_vehicle_by_id,
            create_loading_sheet,
            issue_loading_sheet,
            get_loading_sheet,
            list_loading_sheets,
            calculate_van_settlement,
            submit_van_settlement,
            // M5 Auth Commands
            login_pin,
            login_credentials,
            verify_supervisor_pin,
            get_current_user_permissions,
            list_audit_logs,
            get_user_list,
            save_user
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Logar Traders Tauri application");
}
