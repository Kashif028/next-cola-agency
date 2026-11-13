use tauri::State;

use crate::commands::db_commands::AppState;
use crate::domain::dtos::*;
use crate::domain::rbac::{get_permissions_for_role, Role};
use crate::services::auth::{AuditService, AuthService};

#[tauri::command]
pub async fn login_pin(
    state: State<'_, AppState>,
    req: PinLoginRequest,
) -> Result<ApiResponse<AuthSessionDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AuthService::login_pin(&conn, &req.pin) {
        Ok(session) => Ok(ApiResponse::ok(session)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "UNAUTHORIZED")),
    }
}

#[tauri::command]
pub async fn login_credentials(
    state: State<'_, AppState>,
    req: CredentialsLoginRequest,
) -> Result<ApiResponse<AuthSessionDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AuthService::login_credentials(&conn, &req.username, &req.password) {
        Ok(session) => Ok(ApiResponse::ok(session)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "UNAUTHORIZED")),
    }
}

#[tauri::command]
pub async fn verify_supervisor_pin(
    state: State<'_, AppState>,
    req: AdminOverrideRequest,
) -> Result<ApiResponse<AdminOverrideResult>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AuthService::validate_supervisor_pin(&conn, &req.admin_pin, &req.action_type, &req.context_description) {
        Ok(result) => Ok(ApiResponse::ok(result)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "UNAUTHORIZED")),
    }
}

#[tauri::command]
pub async fn get_current_user_permissions(
    role: String,
) -> Result<ApiResponse<Vec<String>>, ()> {
    match Role::from_str(&role) {
        Some(r) => {
            let perms = get_permissions_for_role(r)
                .into_iter()
                .map(|a| format!("{:?}", a))
                .collect();
            Ok(ApiResponse::ok(perms))
        }
        None => Ok(ApiResponse::err("Unknown user role", "INVALID_ROLE")),
    }
}

#[tauri::command]
pub async fn list_audit_logs(
    state: State<'_, AppState>,
    filter: Option<AuditLogFilterDto>,
) -> Result<ApiResponse<AuditLogResponseDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AuditService::query_logs(&conn, filter.unwrap_or_default()) {
        Ok(res) => Ok(ApiResponse::ok(res)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn get_user_list(
    state: State<'_, AppState>,
) -> Result<ApiResponse<Vec<UserDto>>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AuthService::list_users(&conn) {
        Ok(users) => Ok(ApiResponse::ok(users)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "QUERY_ERROR")),
    }
}

#[tauri::command]
pub async fn save_user(
    state: State<'_, AppState>,
    req: SaveUserDto,
) -> Result<ApiResponse<UserDto>, ()> {
    let conn = match state.pool.get() {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse::err(e.to_string(), "POOL_ERROR")),
    };

    match AuthService::save_user(&conn, req) {
        Ok(user) => Ok(ApiResponse::ok(user)),
        Err(e) => Ok(ApiResponse::err(e.to_string(), "SAVE_ERROR")),
    }
}
