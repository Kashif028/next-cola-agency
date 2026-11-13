use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use chrono::Utc;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use crate::db::pool::{get_default_backup_dir, DbPool};
use crate::domain::dtos::BackupMetadata;
use crate::domain::errors::AppError;

pub struct BackupService;

impl BackupService {
    /// Creates a non-blocking hot backup of the live SQLite database
    pub fn create_live_backup(
        pool: &DbPool,
        destination_override: Option<PathBuf>,
    ) -> Result<BackupMetadata, AppError> {
        let src_conn = pool.get()
            .map_err(|e| AppError::Database(format!("Failed to acquire DB connection: {}", e)))?;

        // 1. Determine destination path
        let dest_path = match destination_override {
            Some(path) => path,
            None => {
                let backup_dir = get_default_backup_dir()?;
                let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
                backup_dir.join(format!("logar_traders_backup_{}.db", timestamp))
            }
        };

        // Ensure parent directory exists
        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::IoError(format!("Cannot create backup directory: {}", e)))?;
        }

        // 2. Open destination SQLite connection
        let mut dst_conn = Connection::open(&dest_path)
            .map_err(|e| AppError::Database(format!("Failed to create backup target file: {}", e)))?;

        // 3. Initialize SQLite Online Backup Session
        let backup = rusqlite::backup::Backup::new(&src_conn, &mut dst_conn)
            .map_err(|e| AppError::BackupFailed(format!("Failed to initialize online backup: {}", e)))?;

        // Step through pages: 100 pages per step with 10ms yield to ensure non-blocking operation
        backup.run_to_completion(100, std::time::Duration::from_millis(10), None)
            .map_err(|e| AppError::BackupFailed(format!("Backup execution failed: {}", e)))?;

        drop(backup);
        // Explicitly close target connection to flush buffers
        drop(dst_conn);

        // 4. Calculate file size and SHA-256 checksum for verification
        let file_size = std::fs::metadata(&dest_path)
            .map_err(|e| AppError::IoError(format!("Failed to read backup metadata: {}", e)))?
            .len();

        let checksum = Self::calculate_file_sha256(&dest_path)?;

        let metadata = BackupMetadata {
            backup_id: uuid::Uuid::new_v4().to_string(),
            file_name: dest_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
            file_path: dest_path.to_string_lossy().to_string(),
            size_bytes: file_size,
            checksum_sha256: checksum,
            created_at: Utc::now(),
            notes: "Automated live hot backup".to_string(),
        };

        log::info!("Live backup created successfully at: {:?}", dest_path);
        Ok(metadata)
    }

    /// Safely restores database from a designated backup archive
    pub fn restore_from_backup(
        pool: &DbPool,
        backup_file_path: &Path,
        _db_file_path: &Path,
    ) -> Result<String, AppError> {
        // Step 1: Pre-validation of backup file existence and integrity
        if !backup_file_path.exists() {
            return Err(AppError::Validation(format!(
                "Backup archive not found: {:?}",
                backup_file_path
            )));
        }

        // Step 2: Validate SQLite Magic Header
        Self::verify_sqlite_header(backup_file_path)?;

        // Step 3: Run SQLite PRAGMA integrity_check on the backup file
        let backup_conn = Connection::open(backup_file_path)
            .map_err(|e| AppError::Database(format!("Cannot open backup file: {}", e)))?;

        let integrity_result: String = backup_conn
            .query_row("PRAGMA integrity_check;", [], |row| row.get(0))
            .map_err(|e| AppError::Database(format!("Integrity check query failed: {}", e)))?;

        if integrity_result != "ok" {
            return Err(AppError::RestoreFailed(format!(
                "Backup file corrupted! Integrity check returned: {}",
                integrity_result
            )));
        }

        // Step 4: Create pre-restore safety snapshot of the active database before overwriting
        log::info!("Creating pre-restore safety snapshot...");
        let backup_dir = get_default_backup_dir()?;
        let safety_path = backup_dir.join(format!(
            "pre_restore_safety_{}.db",
            Utc::now().format("%Y%m%d_%H%M%S")
        ));
        Self::create_live_backup(pool, Some(safety_path.clone()))
            .map_err(|e| AppError::RestoreFailed(format!("Failed to create pre-restore safety snapshot: {}", e)))?;

        // Step 5: Restore via Online Backup API in reverse (Backup -> Active DB)
        let mut active_conn = pool.get()
            .map_err(|e| AppError::Database(format!("Cannot acquire active connection: {}", e)))?;

        let restore_session = rusqlite::backup::Backup::new(&backup_conn, &mut active_conn)
            .map_err(|e| AppError::RestoreFailed(format!("Failed to start reverse restore session: {}", e)))?;

        restore_session.run_to_completion(250, std::time::Duration::from_millis(5), None)
            .map_err(|e| AppError::RestoreFailed(format!("Restore session failed: {}", e)))?;

        drop(restore_session);

        // Re-enforce WAL mode and PRAGMAs post-restore
        let _ = active_conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;"
        );

        log::info!("Database restore completed successfully from {:?}", backup_file_path);
        Ok(safety_path.to_string_lossy().to_string())
    }

    /// Verifies standard SQLite 3 header magic string: "SQLite format 3\0"
    pub fn verify_sqlite_header(path: &Path) -> Result<(), AppError> {
        let mut file = File::open(path)
            .map_err(|e| AppError::IoError(format!("Cannot open file for header check: {}", e)))?;
        let mut header = [0u8; 16];
        file.read_exact(&mut header)
            .map_err(|e| AppError::IoError(format!("File too short to be SQLite database: {}", e)))?;

        if &header != b"SQLite format 3\0" {
            return Err(AppError::Validation(
                "Invalid database file format. Missing SQLite header.".to_string(),
            ));
        }
        Ok(())
    }

    /// Calculates SHA-256 hash of a file for tamper and integrity checks
    pub fn calculate_file_sha256(path: &Path) -> Result<String, AppError> {
        let mut file = File::open(path)
            .map_err(|e| AppError::IoError(format!("Failed to open file for checksum: {}", e)))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 8192];

        loop {
            let bytes_read = file.read(&mut buffer)
                .map_err(|e| AppError::IoError(format!("Error reading file for checksum: {}", e)))?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }

        Ok(hex::encode(hasher.finalize()))
    }
}
