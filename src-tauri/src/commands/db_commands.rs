use std::path::PathBuf;
use std::time::Instant;
use chrono::Utc;
use rusqlite::params;
use tauri::State;
use crate::db::backup::BackupService;
use crate::db::migrations::run_migrations;
use crate::db::pool::DbPool;
use crate::domain::dtos::{
    ApiResponse, BackupRequest, BackupResult, DbHealthReport, InitSchemaRequest,
    InitSchemaResult, RestoreRequest, RestoreResult,
};
use crate::domain::models::{AppSettings, UpdateAppSettingsDto};

pub struct AppState {
    pub pool: DbPool,
    pub db_path: PathBuf,
}

#[tauri::command]
pub async fn db_health_check(state: State<'_, AppState>) -> Result<ApiResponse<DbHealthReport>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode;", [], |r| r.get(0))
        .unwrap_or_else(|_| "unknown".to_string());

    let foreign_keys: i32 = conn
        .query_row("PRAGMA foreign_keys;", [], |r| r.get(0))
        .unwrap_or(0);

    let busy_timeout_ms: i64 = conn
        .query_row("PRAGMA busy_timeout;", [], |r| r.get(0))
        .unwrap_or(0);

    let page_size_bytes: i64 = conn
        .query_row("PRAGMA page_size;", [], |r| r.get(0))
        .unwrap_or(4096);

    let page_count: i64 = conn
        .query_row("PRAGMA page_count;", [], |r| r.get(0))
        .unwrap_or(0);

    let tables_count: usize = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let pool_state = state.pool.state();

    let report = DbHealthReport {
        status: if journal_mode.to_lowercase() == "wal" && foreign_keys == 1 {
            "OK".to_string()
        } else {
            "DEGRADED".to_string()
        },
        journal_mode,
        foreign_keys: foreign_keys == 1,
        busy_timeout_ms,
        pool_connections_active: pool_state.connections,
        pool_connections_idle: pool_state.idle_connections,
        pool_connections_max: 10,
        page_count,
        page_size_bytes,
        database_size_bytes: (page_size_bytes as u64) * (page_count as u64),
        tables_count,
        checked_at: Utc::now(),
    };

    Ok(ApiResponse::ok(report))
}

#[tauri::command]
pub async fn init_schema(
    state: State<'_, AppState>,
    request: Option<InitSchemaRequest>,
) -> Result<ApiResponse<InitSchemaResult>, ()> {
    let start = Instant::now();
    let mut conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    let force_reseed = request.map(|r| r.force_reseed).unwrap_or(false);
    if force_reseed {
        let _ = conn.execute("DROP TABLE IF EXISTS schema_migrations;", []);
    }

    let applied = match run_migrations(&mut conn) {
        Ok(app) => app,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "MIGRATION_ERROR")),
    };

    let total_tables: usize = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let seeded_accounts: usize = conn
        .query_row("SELECT count(*) FROM chart_of_accounts;", [], |r| r.get(0))
        .unwrap_or(0);

    let agency_name: String = conn
        .query_row(
            "SELECT agency_name FROM app_settings ORDER BY id ASC LIMIT 1;",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "Logar Traders".to_string());

    let result = InitSchemaResult {
        success: true,
        applied_migrations: applied,
        total_tables,
        seeded_accounts_count: seeded_accounts,
        seeded_agency_name: agency_name,
        execution_time_ms: start.elapsed().as_millis() as u64,
    };

    Ok(ApiResponse::ok(result))
}

#[tauri::command]
pub async fn trigger_hot_backup(
    state: State<'_, AppState>,
    request: Option<BackupRequest>,
) -> Result<ApiResponse<BackupResult>, ()> {
    let start = Instant::now();
    let dest_override = request.as_ref().and_then(|r| {
        r.destination_dir.as_ref().map(|dir| {
            let path = PathBuf::from(dir);
            if let Some(ref filename) = r.custom_filename {
                path.join(filename)
            } else {
                path.join(format!("logar_backup_{}.db", Utc::now().format("%Y%m%d_%H%M%S")))
            }
        })
    });

    match BackupService::create_live_backup(&state.pool, dest_override) {
        Ok(meta) => {
            let page_count = (meta.size_bytes / 4096) as i32;
            let result = BackupResult {
                backup_file_path: meta.file_path,
                file_size_bytes: meta.size_bytes,
                page_count,
                sha256_checksum: meta.checksum_sha256,
                created_at: meta.created_at,
                execution_duration_ms: start.elapsed().as_millis() as u64,
            };
            Ok(ApiResponse::ok(result))
        }
        Err(e) => Ok(ApiResponse::err(e.to_string(), "BACKUP_FAILED")),
    }
}

#[tauri::command]
pub async fn trigger_restore(
    state: State<'_, AppState>,
    request: RestoreRequest,
) -> Result<ApiResponse<RestoreResult>, ()> {
    // 1. Verify admin pin
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    let admin_pin: Option<String> = conn
        .query_row(
            "SELECT pin_code FROM users WHERE role = 'ADMIN' AND is_active = 1 AND pin_code IS NOT NULL AND length(trim(pin_code)) > 0 LIMIT 1;",
            [],
            |r| r.get(0),
        )
        .ok();

    let expected_pin: Option<String> = match admin_pin {
        Some(pin) => Some(pin),
        None => conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'admin_pin' AND value IS NOT NULL AND length(trim(value)) > 0 LIMIT 1;",
                [],
                |r| r.get(0),
            )
            .ok(),
    };

    match expected_pin {
        Some(expected) => {
            if expected != request.admin_pin {
                return Ok(ApiResponse::err("Invalid administrator PIN code", "UNAUTHORIZED"));
            }
        }
        None => {
            return Ok(ApiResponse::err(
                "Administrator PIN is not configured in database",
                "UNAUTHORIZED",
            ));
        }
    }

    let backup_path = PathBuf::from(&request.backup_file_path);
    match BackupService::restore_from_backup(&state.pool, &backup_path, &state.db_path) {
        Ok(pre_restore_snapshot) => {
            let total_tables: usize = conn
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            let res = RestoreResult {
                success: true,
                restored_from: request.backup_file_path,
                pre_restore_snapshot_path: pre_restore_snapshot,
                tables_restored: total_tables,
                restored_at: Utc::now(),
            };
            Ok(ApiResponse::ok(res))
        }
        Err(e) => Ok(ApiResponse::err(e.to_string(), "RESTORE_FAILED")),
    }
}

#[tauri::command]
pub async fn get_app_settings(state: State<'_, AppState>) -> Result<ApiResponse<AppSettings>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    let settings = conn.query_row(
        "SELECT id, agency_name, tagline, address, phone, whatsapp, ntn_strn, invoice_prefix,
                default_crate_deposit, default_credit_days, auto_backup_on_close, backup_dir
         FROM app_settings ORDER BY id ASC LIMIT 1;",
        [],
        |row| {
            Ok(AppSettings {
                id: row.get(0)?,
                agency_name: row.get(1)?,
                tagline: row.get(2)?,
                address: row.get(3)?,
                phone: row.get(4)?,
                whatsapp: row.get(5)?,
                ntn_strn: row.get(6)?,
                invoice_prefix: row.get(7)?,
                default_crate_deposit: row.get(8)?,
                default_credit_days: row.get(9)?,
                auto_backup_on_close: row.get(10)?,
                backup_dir: row.get(11)?,
                updated_at: Utc::now(),
            })
        },
    );

    match settings {
        Ok(s) => Ok(ApiResponse::ok(s)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "SETTINGS_NOT_FOUND")),
    }
}

#[tauri::command]
pub async fn update_app_settings(
    state: State<'_, AppState>,
    request: UpdateAppSettingsDto,
) -> Result<ApiResponse<AppSettings>, ()> {
    if request.agency_name.trim().is_empty() {
        return Ok(ApiResponse::err("Agency name cannot be blank", "VALIDATION_ERROR"));
    }

    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    let result = conn.execute(
        "UPDATE app_settings SET
            agency_name = ?1,
            tagline = ?2,
            address = ?3,
            phone = ?4,
            whatsapp = ?5,
            ntn_strn = ?6,
            invoice_prefix = ?7,
            default_crate_deposit = ?8,
            default_credit_days = ?9,
            auto_backup_on_close = ?10,
            backup_dir = ?11,
            updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = 1;",
        params![
            request.agency_name,
            request.tagline,
            request.address,
            request.phone,
            request.whatsapp,
            request.ntn_strn,
            request.invoice_prefix,
            request.default_crate_deposit,
            request.default_credit_days,
            request.auto_backup_on_close,
            request.backup_dir,
        ],
    );

    match result {
        Ok(_) => {
            let updated = AppSettings {
                id: 1,
                agency_name: request.agency_name,
                tagline: request.tagline,
                address: request.address,
                phone: request.phone,
                whatsapp: request.whatsapp,
                ntn_strn: request.ntn_strn,
                invoice_prefix: request.invoice_prefix,
                default_crate_deposit: request.default_crate_deposit,
                default_credit_days: request.default_credit_days,
                auto_backup_on_close: request.auto_backup_on_close,
                backup_dir: request.backup_dir,
                updated_at: Utc::now(),
            };
            Ok(ApiResponse::ok(updated))
        }
        Err(e) => Ok(ApiResponse::err(e.to_string(), "UPDATE_FAILED")),
    }
}
