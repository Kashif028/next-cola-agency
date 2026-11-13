use std::path::{Path, PathBuf};
use directories::ProjectDirs;
use r2d2::{CustomizeConnection, Pool, PooledConnection};
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{Connection, Error as SqliteError};
use crate::domain::errors::AppError;

pub type DbPool = Pool<SqliteConnectionManager>;
pub type DbConnection = PooledConnection<SqliteConnectionManager>;

/// Connection customizer that executes performance and integrity PRAGMAs
/// every time a connection is acquired from the pool.
#[derive(Debug)]
pub struct SqlitePragmaCustomizer;

impl CustomizeConnection<Connection, SqliteError> for SqlitePragmaCustomizer {
    fn on_acquire(&self, conn: &mut Connection) -> Result<(), SqliteError> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -64000;
             PRAGMA temp_store = MEMORY;"
        )?;
        Ok(())
    }
}

/// Resolves standard OS data directory for Logar Traders database:
/// `%LOCALAPPDATA%\LogarTraders\data\logar_pos.db`
pub fn get_default_db_path() -> Result<PathBuf, AppError> {
    if let Some(proj_dirs) = ProjectDirs::from("com", "logartraders", "pos") {
        let data_dir = proj_dirs.data_local_dir();
        std::fs::create_dir_all(data_dir)
            .map_err(|e| AppError::IoError(format!("Failed to create data dir: {}", e)))?;
        Ok(data_dir.join("logar_pos.db"))
    } else {
        let fallback = PathBuf::from("./data");
        std::fs::create_dir_all(&fallback)
            .map_err(|e| AppError::IoError(format!("Failed to create fallback dir: {}", e)))?;
        Ok(fallback.join("logar_pos.db"))
    }
}

/// Resolves default directory for SQLite hot backup archives
pub fn get_default_backup_dir() -> Result<PathBuf, AppError> {
    let db_path = get_default_db_path()?;
    let parent = db_path.parent().unwrap_or_else(|| Path::new("./"));
    let backup_dir = parent.join("backups");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| AppError::IoError(format!("Failed to create backup dir: {}", e)))?;
    Ok(backup_dir)
}

/// Builds the production r2d2 SQLite connection pool with WAL mode and foreign keys enabled
pub fn create_db_pool<P: AsRef<Path>>(db_path: P) -> Result<DbPool, AppError> {
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|conn| {
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA cache_size = -64000;
                 PRAGMA temp_store = MEMORY;"
            )
        });

    let pool = Pool::builder()
        .max_size(10)
        .min_idle(Some(2))
        .connection_customizer(Box::new(SqlitePragmaCustomizer))
        .build(manager)
        .map_err(|e| AppError::Database(format!("Failed to build connection pool: {}", e)))?;

    Ok(pool)
}

/// Builds an in-memory pooled database for fast isolated testing
pub fn create_in_memory_pool() -> Result<DbPool, AppError> {
    let manager = SqliteConnectionManager::memory()
        .with_init(|conn| {
            conn.execute_batch(
                "PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;"
            )
        });

    let pool = Pool::builder()
        .max_size(5)
        .connection_customizer(Box::new(SqlitePragmaCustomizer))
        .build(manager)
        .map_err(|e| AppError::Database(format!("Failed to build in-memory pool: {}", e)))?;

    Ok(pool)
}

/// Transaction execution helper guaranteeing atomic commits and automatic rollbacks
pub fn execute_transaction<F, T>(pool: &DbPool, operation: F) -> Result<T, AppError>
where
    F: FnOnce(&mut Connection) -> Result<T, AppError>,
{
    let mut pooled_conn = pool.get()
        .map_err(|e| AppError::Database(format!("Failed to acquire connection: {}", e)))?;

    pooled_conn.execute_batch("BEGIN IMMEDIATE TRANSACTION;")
        .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

    match operation(&mut pooled_conn) {
        Ok(result) => {
            pooled_conn.execute_batch("COMMIT;")
                .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
            Ok(result)
        }
        Err(err) => {
            let _ = pooled_conn.execute_batch("ROLLBACK;");
            Err(err)
        }
    }
}
