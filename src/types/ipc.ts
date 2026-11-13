export type Paisa = number; // Exact integer Paisas (1 PKR = 100 Paisa)

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface DbHealthReport {
  status: string;
  journal_mode: string;
  foreign_keys: boolean;
  busy_timeout_ms: number;
  pool_connections_active: number;
  pool_connections_idle: number;
  pool_connections_max: number;
  page_count: number;
  page_size_bytes: number;
  database_size_bytes: number;
  tables_count: number;
  checked_at: string;
}

export interface InitSchemaRequest {
  force_reseed?: boolean;
}

export interface InitSchemaResult {
  success: boolean;
  applied_migrations: string[];
  total_tables: number;
  seeded_accounts_count: number;
  seeded_agency_name: string;
  execution_time_ms: number;
}

export interface BackupRequest {
  destination_dir?: string;
  custom_filename?: string;
  notes?: string;
}

export interface BackupResult {
  backup_file_path: string;
  file_size_bytes: number;
  page_count: number;
  sha256_checksum: string;
  created_at: string;
  execution_duration_ms: number;
}

export interface RestoreRequest {
  backup_file_path: string;
  admin_pin: string;
}

export interface RestoreResult {
  success: boolean;
  restored_from: string;
  pre_restore_snapshot_path: string;
  tables_restored: number;
  restored_at: string;
}

export interface AuditLogEntryDto {
  id: number;
  timestamp: string;
  user_id: number | null;
  username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values_json?: string | null;
  new_values_json?: string | null;
  reason?: string | null;
  ip_address?: string | null;
  machine_name?: string | null;
}

export interface AuditLogFilterDto {
  from_date?: string;
  to_date?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  user_id?: number;
  limit?: number;
  offset?: number;
}

export interface AuditLogResponseDto {
  total_count: number;
  logs: AuditLogEntryDto[];
}

export interface AdminOverrideRequest {
  admin_pin: string;
  action_type: string;
  context_description: string;
}

export interface AdminOverrideResult {
  authorized: boolean;
  admin_user_id: number;
  admin_name: string;
  audit_log_id: number;
}

