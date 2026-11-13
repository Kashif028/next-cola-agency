use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("Record not found: entity={entity}, id={id}")]
    NotFound { entity: String, id: String },

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Insufficient stock for product {product_id}: requested {requested_base}, available {available_base}")]
    InsufficientStock {
        product_id: i64,
        requested_base: i64,
        available_base: i64,
    },

    #[error("Credit limit exceeded for customer {customer_id}: limit={limit_paisa}, current={current_paisa}, attempted={attempted_paisa}")]
    CreditLimitExceeded {
        customer_id: i64,
        limit_paisa: i64,
        current_paisa: i64,
        attempted_paisa: i64,
    },

    #[error("Unbalanced journal entry: debits={total_debit_paisa}, credits={total_credit_paisa}")]
    UnbalancedJournalEntry {
        total_debit_paisa: i64,
        total_credit_paisa: i64,
    },

    #[error("Unauthorized action: {0}")]
    Unauthorized(String),

    #[error("Day locked: operations prohibited on closed date {0}")]
    DayLocked(String),

    #[error("Backup failure: {0}")]
    BackupFailed(String),

    #[error("Restore failure: {0}")]
    RestoreFailed(String),

    #[error("Internal system error: {0}")]
    Internal(String),

    #[error("IO error: {0}")]
    IoError(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<r2d2::Error> for AppError {
    fn from(err: r2d2::Error) -> Self {
        AppError::Database(format!("Connection pool error: {}", err))
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::IoError(format!("I/O error: {}", err))
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
