use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PackagingType {
    RgbGlass,
    PetPlastic,
    CanAlu,
    WaterCarboy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PriceTier {
    Retail,
    Wholesale,
    Special,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CreditStatus {
    Active,
    Warning,
    Blocked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SupplierType {
    PrincipalBeverage,
    FreightTransporter,
    LaborContractor,
    General,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PaymentType {
    Cash,
    Credit,
    Split,
    Bank,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InvoiceStatus {
    Paid,
    Partial,
    Unpaid,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UnitChosen {
    Pack,
    Base,
    Mixed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AccountType {
    Asset,
    Liability,
    Equity,
    Revenue,
    CostOfGoodsSold,
    OperatingExpense,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TripStatus {
    Dispatched,
    Completed,
    Settled,
    Audited,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UserRole {
    Admin,
    Accountant,
    Salesman,
    Warehouse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: i64,
    pub sku_code: String,
    pub name: String,
    pub brand: String,
    pub flavor: Option<String>,
    pub volume_ml: Option<i64>,
    pub packaging_type: String,
    pub is_glass: bool,
    pub requires_crate: bool,
    pub base_unit_name: String,
    pub default_pack_name: String,
    pub units_per_pack: i64,
    pub purchase_price_pack_paisa: i64,
    pub wholesale_price_pack_paisa: i64,
    pub retail_price_pack_paisa: i64,
    pub retail_price_base_paisa: i64,
    pub crate_deposit_paisa: i64,
    pub bottle_deposit_paisa: i64,
    pub current_stock_base_units: i64,
    pub empty_bottles_stock: i64,
    pub empty_crates_stock: i64,
    pub min_reorder_level_packs: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Customer {
    pub id: i64,
    pub code: String,
    pub shop_name: String,
    pub owner_name: String,
    pub phone: String,
    pub whatsapp: Option<String>,
    pub address: String,
    pub route_id: Option<i64>,
    pub price_tier: String,
    pub credit_limit_paisa: i64,
    pub credit_limit_days: i32,
    pub crate_limit: i32,
    pub current_balance_paisa: i64,
    pub current_crates_balance: i32,
    pub security_deposit_balance_paisa: i64,
    pub credit_status: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Supplier {
    pub id: i64,
    pub code: String,
    pub company_name: String,
    pub contact_person: Option<String>,
    pub phone: String,
    pub email: Option<String>,
    pub address: Option<String>,
    pub supplier_type: String,
    pub current_payable_paisa: i64,
    pub crates_owed_to_company: i32,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalesInvoice {
    pub id: i64,
    pub invoice_number: String,
    pub customer_id: i64,
    pub delivery_sheet_id: Option<i64>,
    pub invoice_date: String,
    pub due_date: String,
    pub subtotal_paisa: i64,
    pub discount_paisa: i64,
    pub tax_paisa: i64,
    pub crate_deposit_charged_paisa: i64,
    pub net_total_paisa: i64,
    pub paid_amount_paisa: i64,
    pub due_amount_paisa: i64,
    pub payment_type: String,
    pub status: String,
    pub crates_issued: i32,
    pub crates_returned: i32,
    pub is_cancelled: bool,
    pub is_locked: bool,
    pub created_by: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashBookEntry {
    pub id: i64,
    pub entry_date: String,
    pub entry_time: String,
    pub transaction_type: String,
    pub voucher_ref_type: String,
    pub voucher_ref_id: i64,
    pub voucher_ref_number: Option<String>,
    pub account_id: i64,
    pub particulars: String,
    pub cash_in_paisa: i64,
    pub cash_out_paisa: i64,
    pub running_balance_paisa: i64,
    pub is_locked: bool,
    pub created_by: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub id: i64,
    pub agency_name: String,
    pub tagline: Option<String>,
    pub address: String,
    pub phone: String,
    pub whatsapp: Option<String>,
    pub ntn_strn: Option<String>,
    pub invoice_prefix: String,
    pub default_crate_deposit: i64, // Paisas
    pub default_credit_days: i32,
    pub auto_backup_on_close: bool,
    pub backup_dir: String,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAppSettingsDto {
    pub agency_name: String,
    pub tagline: Option<String>,
    pub address: String,
    pub phone: String,
    pub whatsapp: Option<String>,
    pub ntn_strn: Option<String>,
    pub invoice_prefix: String,
    pub default_crate_deposit: i64,
    pub default_credit_days: i32,
    pub auto_backup_on_close: bool,
    pub backup_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyClosing {
    pub id: i64,
    pub closing_date: String,
    pub opening_cash_paisa: i64,
    pub cash_sales_paisa: i64,
    pub udhaar_recoveries_paisa: i64,
    pub crate_deposits_paisa: i64,
    pub other_cash_in_paisa: i64,
    pub total_cash_in_paisa: i64,
    pub supplier_payments_paisa: i64,
    pub cash_purchases_paisa: i64,
    pub expenses_paid_paisa: i64,
    pub deposit_refunds_paisa: i64,
    pub bank_deposits_paisa: i64,
    pub owner_drawings_paisa: i64,
    pub total_cash_out_paisa: i64,
    pub expected_closing_cash_paisa: i64,
    pub physical_closing_cash_paisa: i64,
    pub variance_paisa: i64,
    pub denominations_json: String,
    pub total_sales_invoiced_paisa: i64,
    pub total_credit_sales_paisa: i64,
    pub is_locked: bool,
    pub closed_by: i64,
    pub closed_at: String,
}
