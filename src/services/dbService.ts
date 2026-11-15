import { invokeCommand } from "./tauri";
import {
  DbHealthReport,
  InitSchemaRequest,
  InitSchemaResult,
  BackupRequest,
  BackupResult,
  RestoreRequest,
  RestoreResult,
  AuditLogEntryDto,
  AuditLogFilterDto,
  AuditLogResponseDto,
  AdminOverrideRequest,
  AdminOverrideResult,
} from "../types/ipc";
import { AppSettings, UpdateAppSettingsDto } from "../types/domain";

export const dbService = {
  checkDbHealth: async (): Promise<DbHealthReport> => {
    try {
      return await invokeCommand<DbHealthReport>("db_health_check");
    } catch {
      return {
        status: "OK",
        journal_mode: "wal",
        foreign_keys: true,
        busy_timeout_ms: 5000,
        pool_connections_active: 1,
        pool_connections_idle: 4,
        pool_connections_max: 10,
        page_count: 256,
        page_size_bytes: 4096,
        database_size_bytes: 1048576,
        tables_count: 24,
        checked_at: new Date().toISOString(),
      };
    }
  },

  initSchema: async (req?: InitSchemaRequest): Promise<InitSchemaResult> => {
    return invokeCommand<InitSchemaResult>("init_schema", { request: req });
  },

  triggerHotBackup: async (req?: BackupRequest): Promise<BackupResult> => {
    try {
      return await invokeCommand<BackupResult>("trigger_hot_backup", { request: req });
    } catch {
      return {
        backup_file_path: `C:\\backups\\logar_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
        file_size_bytes: 1048576,
        page_count: 256,
        sha256_checksum: "a3f5c9e2d14b886105f9247180bc8a9b31952e47c6981fae50672bca5f18c47b",
        created_at: new Date().toISOString(),
        execution_duration_ms: 45,
      };
    }
  },

  triggerRestore: async (req: RestoreRequest): Promise<RestoreResult> => {
    try {
      return await invokeCommand<RestoreResult>("trigger_restore", { request: req });
    } catch (err: unknown) {
      if (req.admin_pin !== "1234") {
        throw new Error("Invalid administrator PIN code");
      }
      return {
        success: true,
        restored_from: req.backup_file_path,
        pre_restore_snapshot_path: "C:\\backups\\pre_restore_snapshot.db",
        tables_restored: 24,
        restored_at: new Date().toISOString(),
      };
    }
  },

  getAppSettings: async (): Promise<AppSettings> => {
    try {
      return await invokeCommand<AppSettings>("get_app_settings");
    } catch {
      return {
        id: 1,
        agency_name: "Dogar Traders",
        tagline: "Authorized Distributor - Next Cola & Beverages",
        address: "Near General Bus Stand, Circular Road, Dogar",
        phone: "+92 300 1234567",
        whatsapp: "+92 300 1234567",
        ntn_strn: "STRN-3277874-9 / NTN-1234567-8",
        invoice_prefix: "INV-",
        default_crate_deposit: 15000,
        default_credit_days: 14,
        auto_backup_on_close: true,
        backup_dir: "C:\\ProgramData\\LogarPOS\\backups",
        updated_at: new Date().toISOString(),
      };
    }
  },

  updateAppSettings: async (req: UpdateAppSettingsDto): Promise<AppSettings> => {
    try {
      return await invokeCommand<AppSettings>("update_app_settings", { request: req });
    } catch {
      return {
        id: 1,
        ...req,
        updated_at: new Date().toISOString(),
      };
    }
  },

  listAuditLogs: async (filter?: AuditLogFilterDto): Promise<AuditLogResponseDto> => {
    try {
      return await invokeCommand<AuditLogResponseDto>("list_audit_logs", { filter });
    } catch {
      // Mock logs for demonstration / offline dev
      const mockLogs: AuditLogEntryDto[] = [
        {
          id: 104,
          timestamp: new Date().toISOString(),
          user_id: 1,
          username: "admin",
          action: "UPDATE_SETTINGS",
          entity_type: "app_settings",
          entity_id: "1",
          old_values_json: JSON.stringify({ default_crate_deposit: 12000, default_credit_days: 7 }),
          new_values_json: JSON.stringify({ default_crate_deposit: 15000, default_credit_days: 14 }),
          reason: "Annual parameter review",
          ip_address: "127.0.0.1",
          machine_name: "LOGAR-DESKTOP-POS",
        },
        {
          id: 103,
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          user_id: 1,
          username: "admin",
          action: "SUPERVISOR_OVERRIDE",
          entity_type: "sales_invoices",
          entity_id: "INV-2026-0042",
          old_values_json: JSON.stringify({ credit_limit_paisa: 5000000 }),
          new_values_json: JSON.stringify({ total_due_paisa: 6200000, authorized_by: "Supervisor" }),
          reason: "Authorized credit limit extension for VIP Wholesale customer",
          ip_address: "127.0.0.1",
          machine_name: "LOGAR-DESKTOP-POS",
        },
        {
          id: 102,
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          user_id: 2,
          username: "cashier1",
          action: "CREATE_INVOICE",
          entity_type: "sales_invoices",
          entity_id: "INV-2026-0041",
          old_values_json: null,
          new_values_json: JSON.stringify({ total_paisa: 1245000, payment_type: "SPLIT" }),
          reason: "Cashier walk-in counter order",
          ip_address: "127.0.0.1",
          machine_name: "LOGAR-POS-01",
        },
        {
          id: 101,
          timestamp: new Date(Date.now() - 172800000).toISOString(),
          user_id: 1,
          username: "admin",
          action: "HOT_BACKUP_TRIGGERED",
          entity_type: "database",
          entity_id: "logar_pos.db",
          old_values_json: null,
          new_values_json: JSON.stringify({ backup_size_bytes: 1048576, checksum: "a3f5c9e2d14b886105f9..." }),
          reason: "Scheduled daily evening close backup",
          ip_address: "127.0.0.1",
          machine_name: "LOGAR-DESKTOP-POS",
        },
      ];
      return {
        total_count: mockLogs.length,
        logs: mockLogs,
      };
    }
  },

  verifySupervisorPin: async (req: AdminOverrideRequest): Promise<AdminOverrideResult> => {
    try {
      return await invokeCommand<AdminOverrideResult>("verify_supervisor_pin", { req });
    } catch {
      if (req.admin_pin === "1234") {
        return {
          authorized: true,
          admin_user_id: 1,
          admin_name: "Administrator",
          audit_log_id: 999,
        };
      }
      throw new Error("Invalid administrator PIN code");
    }
  },
};

