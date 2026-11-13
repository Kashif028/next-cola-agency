import { ApiResponse } from "../types/ipc";

// Safely invoke Tauri commands with error normalization
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    // Dynamic import to prevent crash when running outside Tauri webview context
    const { invoke } = await import("@tauri-apps/api/core");
    const response = await invoke<ApiResponse<T>>(command, args);
    if (!response.success) {
      throw new Error(response.error || `Command ${command} failed`);
    }
    return response.data as T;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[IPC Error] ${command}:`, errorMsg);
    throw new Error(errorMsg);
  }
}
