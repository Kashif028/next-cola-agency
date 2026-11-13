use std::fmt;
use serde::{Deserialize, Serialize};
use crate::domain::errors::AppError;
use crate::domain::models::UserRole;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Role {
    Admin,
    Accountant,
    Salesman,
    Warehouse,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Admin => "ADMIN",
            Role::Accountant => "ACCOUNTANT",
            Role::Salesman => "SALESMAN",
            Role::Warehouse => "WAREHOUSE",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim().to_uppercase().as_str() {
            "ADMIN" => Some(Role::Admin),
            "ACCOUNTANT" => Some(Role::Accountant),
            "SALESMAN" => Some(Role::Salesman),
            "WAREHOUSE" | "WAREHOUSE_OPERATOR" => Some(Role::Warehouse),
            _ => None,
        }
    }
}

impl fmt::Display for Role {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl From<UserRole> for Role {
    fn from(ur: UserRole) -> Self {
        match ur {
            UserRole::Admin => Role::Admin,
            UserRole::Accountant => Role::Accountant,
            UserRole::Salesman => Role::Salesman,
            UserRole::Warehouse => Role::Warehouse,
        }
    }
}

impl From<Role> for UserRole {
    fn from(r: Role) -> Self {
        match r {
            Role::Admin => UserRole::Admin,
            Role::Accountant => UserRole::Accountant,
            Role::Salesman => UserRole::Salesman,
            Role::Warehouse => UserRole::Warehouse,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Action {
    // POS & Sales
    PosCreateInvoice,
    PosViewInvoice,
    PosCancelInvoice,
    PosRecordReturn,
    PosOverrideCreditLimit,
    // Inventory & Warehouse
    InventoryViewStock,
    InventoryAdjustStock,
    InventoryReceivePurchase,
    InventoryIssueVehicleStock,
    InventoryRecordBreakage,
    InventoryManageEmpties,
    InventoryModifyPricing,
    // Logistics & Delivery
    LogisticsViewRoutes,
    LogisticsManageRoutes,
    LogisticsViewVehicles,
    LogisticsManageVehicles,
    LogisticsCreateLoadingSheet,
    LogisticsIssueLoadingSheet,
    LogisticsSubmitSettlement,
    LogisticsAuditSettlement,
    // Accounting & Financials
    AccountingViewLedgers,
    AccountingRecordRecovery,
    AccountingRecordSupplierPayment,
    AccountingRecordExpense,
    AccountingViewCashBook,
    AccountingViewBankBook,
    AccountingBankTransfer,
    AccountingViewFinancialReports,
    AccountingDailyClosing,
    // Administration & System
    AdminManageUsers,
    AdminManageSettings,
    AdminViewAuditLogs,
    AdminDatabaseBackup,
    AdminDatabaseRestore,
}

pub fn has_permission(role: Role, action: Action) -> bool {
    match role {
        Role::Admin => true,
        Role::Accountant => matches!(
            action,
            Action::AccountingViewLedgers
                | Action::AccountingRecordRecovery
                | Action::AccountingRecordSupplierPayment
                | Action::AccountingRecordExpense
                | Action::AccountingViewCashBook
                | Action::AccountingViewBankBook
                | Action::AccountingBankTransfer
                | Action::AccountingViewFinancialReports
                | Action::AccountingDailyClosing
                | Action::LogisticsViewRoutes
                | Action::LogisticsManageRoutes
                | Action::LogisticsViewVehicles
                | Action::LogisticsManageVehicles
                | Action::LogisticsCreateLoadingSheet
                | Action::LogisticsAuditSettlement
                | Action::PosViewInvoice
                | Action::PosRecordReturn
                | Action::InventoryViewStock
                | Action::InventoryReceivePurchase
                | Action::InventoryRecordBreakage
                | Action::InventoryManageEmpties
                | Action::AdminDatabaseBackup
        ),
        Role::Salesman => matches!(
            action,
            Action::PosCreateInvoice
                | Action::PosViewInvoice
                | Action::PosRecordReturn
                | Action::AccountingRecordRecovery
                | Action::LogisticsViewRoutes
                | Action::LogisticsViewVehicles
                | Action::LogisticsSubmitSettlement
                | Action::InventoryViewStock
        ),
        Role::Warehouse => matches!(
            action,
            Action::InventoryViewStock
                | Action::InventoryAdjustStock
                | Action::InventoryReceivePurchase
                | Action::InventoryIssueVehicleStock
                | Action::InventoryRecordBreakage
                | Action::InventoryManageEmpties
                | Action::LogisticsViewRoutes
                | Action::LogisticsViewVehicles
                | Action::LogisticsCreateLoadingSheet
                | Action::LogisticsIssueLoadingSheet
        ),
    }
}

pub fn check_permission(role: Role, action: Action) -> Result<(), AppError> {
    if has_permission(role, action) {
        Ok(())
    } else {
        Err(AppError::Unauthorized(format!(
            "Access Denied: Role '{}' does not have permission for action '{:?}'",
            role.as_str(),
            action
        )))
    }
}

pub fn get_permissions_for_role(role: Role) -> Vec<Action> {
    const ALL_ACTIONS: &[Action] = &[
        Action::PosCreateInvoice,
        Action::PosViewInvoice,
        Action::PosCancelInvoice,
        Action::PosRecordReturn,
        Action::PosOverrideCreditLimit,
        Action::InventoryViewStock,
        Action::InventoryAdjustStock,
        Action::InventoryReceivePurchase,
        Action::InventoryIssueVehicleStock,
        Action::InventoryRecordBreakage,
        Action::InventoryManageEmpties,
        Action::InventoryModifyPricing,
        Action::LogisticsViewRoutes,
        Action::LogisticsManageRoutes,
        Action::LogisticsViewVehicles,
        Action::LogisticsManageVehicles,
        Action::LogisticsCreateLoadingSheet,
        Action::LogisticsIssueLoadingSheet,
        Action::LogisticsSubmitSettlement,
        Action::LogisticsAuditSettlement,
        Action::AccountingViewLedgers,
        Action::AccountingRecordRecovery,
        Action::AccountingRecordSupplierPayment,
        Action::AccountingRecordExpense,
        Action::AccountingViewCashBook,
        Action::AccountingViewBankBook,
        Action::AccountingBankTransfer,
        Action::AccountingViewFinancialReports,
        Action::AccountingDailyClosing,
        Action::AdminManageUsers,
        Action::AdminManageSettings,
        Action::AdminViewAuditLogs,
        Action::AdminDatabaseBackup,
        Action::AdminDatabaseRestore,
    ];

    ALL_ACTIONS
        .iter()
        .copied()
        .filter(|&a| has_permission(role, a))
        .collect()
}
