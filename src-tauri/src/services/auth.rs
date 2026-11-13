use chrono::Utc;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::domain::dtos::*;
use crate::domain::errors::AppError;
use crate::domain::rbac::{get_permissions_for_role, Role};

pub struct AuditService;

impl AuditService {
    pub fn log_audit_action(
        conn: &Connection,
        user_id: Option<i64>,
        username: Option<&str>,
        action: &str,
        entity_type: &str,
        entity_id: Option<i64>,
        details: &str,
    ) -> Result<i64, AppError> {
        let uname = username.unwrap_or("system");
        let ent_id = entity_id.map(|id| id.to_string()).unwrap_or_default();

        conn.execute(
            "INSERT INTO audit_logs (
                user_id, username, action, entity_type, entity_id,
                reason, ip_address, machine_name
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '127.0.0.1', 'LOGAR-DESKTOP-POS')",
            params![user_id, uname, action, entity_type, ent_id, details],
        )?;

        Ok(conn.last_insert_rowid())
    }

    pub fn log_audit_diff(
        conn: &Connection,
        user_id: Option<i64>,
        username: Option<&str>,
        action: &str,
        entity_type: &str,
        entity_id: &str,
        old_values: Option<&serde_json::Value>,
        new_values: Option<&serde_json::Value>,
        reason: Option<&str>,
        ip_address: Option<&str>,
    ) -> Result<i64, AppError> {
        let uname = username.unwrap_or("system");
        let old_json = old_values.map(|v| v.to_string());
        let new_json = new_values.map(|v| v.to_string());
        let ip = ip_address.unwrap_or("127.0.0.1");

        conn.execute(
            "INSERT INTO audit_logs (
                user_id, username, action, entity_type, entity_id,
                old_values_json, new_values_json, reason, ip_address, machine_name
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'LOGAR-DESKTOP-POS')",
            params![
                user_id,
                uname,
                action,
                entity_type,
                entity_id,
                old_json,
                new_json,
                reason,
                ip,
            ],
        )?;

        Ok(conn.last_insert_rowid())
    }

    pub fn query_logs(
        conn: &Connection,
        filter: AuditLogFilterDto,
    ) -> Result<AuditLogResponseDto, AppError> {
        let mut where_clauses = Vec::new();
        let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(ref from) = filter.from_date {
            where_clauses.push("timestamp >= ?");
            params_vec.push(rusqlite::types::Value::Text(format!("{}T00:00:00Z", from)));
        }
        if let Some(ref to) = filter.to_date {
            where_clauses.push("timestamp <= ?");
            params_vec.push(rusqlite::types::Value::Text(format!("{}T23:59:59Z", to)));
        }
        if let Some(ref act) = filter.action {
            where_clauses.push("action = ?");
            params_vec.push(rusqlite::types::Value::Text(act.clone()));
        }
        if let Some(ref etype) = filter.entity_type {
            where_clauses.push("entity_type = ?");
            params_vec.push(rusqlite::types::Value::Text(etype.clone()));
        }
        if let Some(ref eid) = filter.entity_id {
            where_clauses.push("entity_id = ?");
            params_vec.push(rusqlite::types::Value::Text(eid.clone()));
        }
        if let Some(uid) = filter.user_id {
            where_clauses.push("user_id = ?");
            params_vec.push(rusqlite::types::Value::Integer(uid));
        }

        let where_sql = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };

        let count_query = format!("SELECT COUNT(*) FROM audit_logs {}", where_sql);
        let mut count_stmt = conn.prepare(&count_query)?;
        let rusqlite_params = rusqlite::params_from_iter(params_vec.iter());
        let total_count: usize = count_stmt.query_row(rusqlite_params, |r| r.get(0))?;

        let limit = filter.limit.unwrap_or(50).min(500);
        let offset = filter.offset.unwrap_or(0);

        let data_query = format!(
            "SELECT id, timestamp, user_id, username, action, entity_type, entity_id,
                    old_values_json, new_values_json, reason, ip_address, machine_name
             FROM audit_logs
             {}
             ORDER BY id DESC
             LIMIT {} OFFSET {}",
            where_sql, limit, offset
        );

        let mut data_stmt = conn.prepare(&data_query)?;
        let rusqlite_params = rusqlite::params_from_iter(params_vec.iter());
        let rows = data_stmt.query_map(rusqlite_params, |r| {
            Ok(AuditLogEntryDto {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                user_id: r.get(2)?,
                username: r.get(3)?,
                action: r.get(4)?,
                entity_type: r.get(5)?,
                entity_id: r.get(6)?,
                old_values_json: r.get(7)?,
                new_values_json: r.get(8)?,
                reason: r.get(9)?,
                ip_address: r.get(10)?,
                machine_name: r.get(11)?,
            })
        })?;

        let mut logs = Vec::new();
        for row in rows {
            logs.push(row?);
        }

        Ok(AuditLogResponseDto { total_count, logs })
    }
}

pub struct AuthService;

impl AuthService {
    pub fn login_pin(conn: &Connection, pin: &str) -> Result<AuthSessionDto, AppError> {
        let clean_pin = pin.trim();
        if clean_pin.is_empty() {
            return Err(AppError::Unauthorized("PIN code is required".into()));
        }

        let user_row: Result<(i64, String, String, String), rusqlite::Error> = conn.query_row(
            "SELECT id, username, full_name, role
             FROM users
             WHERE pin_code = ?1 AND is_active = 1
             LIMIT 1",
            params![clean_pin],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        );

        match user_row {
            Ok((id, username, full_name, role_str)) => {
                let role = Role::from_str(&role_str)
                    .ok_or_else(|| AppError::Unauthorized("Invalid user role configured".into()))?;

                let permissions = get_permissions_for_role(role);
                let session_token = Uuid::new_v4().to_string();
                let logged_in_at = Utc::now().to_rfc3339();

                let _ = AuditService::log_audit_action(
                    conn,
                    Some(id),
                    Some(&username),
                    "USER_LOGIN_PIN",
                    "users",
                    Some(id),
                    "Successful PIN login",
                );

                Ok(AuthSessionDto {
                    session_token,
                    user_id: id,
                    username,
                    full_name,
                    role,
                    permissions,
                    logged_in_at,
                })
            }
            Err(_) => Err(AppError::Unauthorized("Invalid PIN code entered".into())),
        }
    }

    pub fn login_credentials(
        conn: &Connection,
        username: &str,
        password: &str,
    ) -> Result<AuthSessionDto, AppError> {
        let clean_user = username.trim().to_lowercase();
        let clean_pass = password.trim();

        if clean_user.is_empty() || clean_pass.is_empty() {
            return Err(AppError::Unauthorized("Username and password are required".into()));
        }

        let user_row: Result<(i64, String, String, String, String, String), rusqlite::Error> = conn.query_row(
            "SELECT id, username, full_name, role, password_hash, salt
             FROM users
             WHERE username = ?1 AND is_active = 1
             LIMIT 1",
            params![clean_user],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        );

        match user_row {
            Ok((id, username, full_name, role_str, stored_hash, salt)) => {
                let mut hasher = Sha256::new();
                hasher.update(clean_pass.as_bytes());
                hasher.update(salt.as_bytes());
                let computed_hash = hex::encode(hasher.finalize());

                if computed_hash != stored_hash && clean_pass != stored_hash {
                    return Err(AppError::Unauthorized("Invalid username or password".into()));
                }

                let role = Role::from_str(&role_str)
                    .ok_or_else(|| AppError::Unauthorized("Invalid user role configured".into()))?;

                let permissions = get_permissions_for_role(role);
                let session_token = Uuid::new_v4().to_string();
                let logged_in_at = Utc::now().to_rfc3339();

                let _ = AuditService::log_audit_action(
                    conn,
                    Some(id),
                    Some(&username),
                    "USER_LOGIN_PASS",
                    "users",
                    Some(id),
                    "Successful credentials login",
                );

                Ok(AuthSessionDto {
                    session_token,
                    user_id: id,
                    username,
                    full_name,
                    role,
                    permissions,
                    logged_in_at,
                })
            }
            Err(_) => Err(AppError::Unauthorized("Invalid username or password".into())),
        }
    }

    pub fn validate_supervisor_pin(
        conn: &Connection,
        pin: &str,
        action_type: &str,
        context_description: &str,
    ) -> Result<AdminOverrideResult, AppError> {
        let clean_pin = pin.trim();
        let admin_row: Result<(i64, String, String), rusqlite::Error> = conn.query_row(
            "SELECT id, username, full_name
             FROM users
             WHERE (role = 'ADMIN' OR role = 'admin') AND pin_code = ?1 AND is_active = 1
             LIMIT 1",
            params![clean_pin],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        );

        match admin_row {
            Ok((id, username, full_name)) => {
                let audit_id = AuditService::log_audit_action(
                    conn,
                    Some(id),
                    Some(&username),
                    &format!("ADMIN_OVERRIDE_{}", action_type),
                    "admin_override",
                    None,
                    context_description,
                )
                .unwrap_or(0);

                Ok(AdminOverrideResult {
                    authorized: true,
                    admin_user_id: id,
                    admin_name: full_name,
                    audit_log_id: audit_id,
                })
            }
            Err(_) => Err(AppError::Unauthorized("Invalid Administrator override PIN".into())),
        }
    }

    pub fn list_users(conn: &Connection) -> Result<Vec<UserDto>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, username, full_name, role, phone, is_active FROM users ORDER BY id ASC"
        )?;

        let rows = stmt.query_map([], |r| {
            Ok(UserDto {
                id: r.get(0)?,
                username: r.get(1)?,
                full_name: r.get(2)?,
                role: r.get(3)?,
                phone: r.get(4)?,
                is_active: r.get::<_, i32>(5)? == 1,
            })
        })?;

        let mut list = Vec::new();
        for u in rows {
            list.push(u?);
        }
        Ok(list)
    }

    pub fn save_user(conn: &Connection, user: SaveUserDto) -> Result<UserDto, AppError> {
        let username = user.username.trim().to_lowercase();
        let full_name = user.full_name.trim();

        if username.is_empty() || full_name.is_empty() {
            return Err(AppError::Validation("Username and full name are required".into()));
        }

        if let Some(id) = user.id {
            conn.execute(
                "UPDATE users SET
                    username = ?1,
                    full_name = ?2,
                    role = ?3,
                    phone = ?4,
                    pin_code = COALESCE(?5, pin_code),
                    password_hash = COALESCE(?6, password_hash),
                    is_active = ?7,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?8",
                params![
                    username,
                    full_name,
                    user.role.trim().to_uppercase(),
                    user.phone,
                    user.pin_code,
                    user.password,
                    if user.is_active { 1 } else { 0 },
                    id
                ],
            )?;

            conn.query_row(
                "SELECT id, username, full_name, role, phone, is_active FROM users WHERE id = ?1",
                params![id],
                |r| {
                    Ok(UserDto {
                        id: r.get(0)?,
                        username: r.get(1)?,
                        full_name: r.get(2)?,
                        role: r.get(3)?,
                        phone: r.get(4)?,
                        is_active: r.get::<_, i32>(5)? == 1,
                    })
                },
            )
            .map_err(Into::into)
        } else {
            let pin = user.pin_code.unwrap_or_else(|| "1234".into());
            let salt = format!("s@lt_{}_2026", username);
            let raw_pass = user.password.unwrap_or_else(|| "password".into());
            let mut hasher = Sha256::new();
            hasher.update(raw_pass.as_bytes());
            hasher.update(salt.as_bytes());
            let hash = hex::encode(hasher.finalize());

            conn.execute(
                "INSERT INTO users (
                    username, password_hash, salt, full_name, role, phone, pin_code, is_active
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    username,
                    hash,
                    salt,
                    full_name,
                    user.role.trim().to_uppercase(),
                    user.phone,
                    pin,
                    if user.is_active { 1 } else { 0 },
                ],
            )?;

            let id = conn.last_insert_rowid();
            conn.query_row(
                "SELECT id, username, full_name, role, phone, is_active FROM users WHERE id = ?1",
                params![id],
                |r| {
                    Ok(UserDto {
                        id: r.get(0)?,
                        username: r.get(1)?,
                        full_name: r.get(2)?,
                        role: r.get(3)?,
                        phone: r.get(4)?,
                        is_active: r.get::<_, i32>(5)? == 1,
                    })
                },
            )
            .map_err(Into::into)
        }
    }
}
