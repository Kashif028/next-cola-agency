/**
 * Resilient Session Storage & Memory Caching Service
 * Provides caching with TTL expiration, ETag persistence, and automatic memory fallback.
 */

import { CacheEntry, ReleaseInfo } from '../types/website';

const NAMESPACE = 'apk_dl_cache_';
const KEY_LATEST = 'latest_release';
const KEY_HISTORY = 'release_history';

export class CacheService {
  private memoryMap = new Map<string, CacheEntry<unknown>>();
  private storageSupported: boolean | null = null;

  constructor() {
    this.checkStorageSupport();
  }

  /**
   * Tests whether sessionStorage is available and functional.
   */
  public checkStorageSupport(): boolean {
    if (this.storageSupported !== null) return this.storageSupported;
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) {
        this.storageSupported = false;
        return false;
      }
      const testKey = `__test_${Math.random()}__`;
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      this.storageSupported = true;
      return true;
    } catch {
      this.storageSupported = false;
      return false;
    }
  }

  private getKey(key: string): string {
    return `${NAMESPACE}${key}`;
  }

  /**
   * Retrieves a cached entry by key. Returns null if missing or corrupted.
   */
  public get<T>(key: string): CacheEntry<T> | null {
    const namespacedKey = this.getKey(key);

    if (this.checkStorageSupport()) {
      try {
        const item = window.sessionStorage.getItem(namespacedKey);
        if (item) {
          const parsed = JSON.parse(item) as CacheEntry<T>;
          if (parsed && typeof parsed.timestamp === 'number' && 'data' in parsed) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn(`[cacheService] Failed to read ${key} from sessionStorage:`, err);
      }
    }

    const memEntry = this.memoryMap.get(namespacedKey);
    return memEntry ? (memEntry as CacheEntry<T>) : null;
  }

  /**
   * Saves data into cache with a timestamp and optional ETag.
   */
  public set<T>(key: string, data: T, etag?: string | null): void {
    const namespacedKey = this.getKey(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      etag: etag ?? null,
    };

    if (this.checkStorageSupport()) {
      try {
        window.sessionStorage.setItem(namespacedKey, JSON.stringify(entry));
        this.memoryMap.delete(namespacedKey);
        return;
      } catch (err) {
        console.warn(`[cacheService] Failed to set ${key} in sessionStorage (falling back to memory):`, err);
      }
    }

    this.memoryMap.set(namespacedKey, entry as CacheEntry<unknown>);
  }

  /**
   * Touches an existing cache entry to reset its TTL timestamp (used on HTTP 304 Not Modified).
   */
  public touch(key: string): void {
    const existing = this.get<unknown>(key);
    if (existing) {
      this.set(key, existing.data, existing.etag);
    }
  }

  /**
   * Checks whether a cache entry is still fresh given a TTL in milliseconds.
   */
  public isFresh(entry: CacheEntry<unknown> | null, ttlMs: number): boolean {
    if (!entry) return false;
    return Date.now() - entry.timestamp < ttlMs;
  }

  /**
   * Removes a specific item from both storage and memory.
   */
  public remove(key: string): void {
    const namespacedKey = this.getKey(key);
    if (this.checkStorageSupport()) {
      try {
        window.sessionStorage.removeItem(namespacedKey);
      } catch {
        // ignore
      }
    }
    this.memoryMap.delete(namespacedKey);
  }

  /**
   * Clears all cached items belonging to this namespace.
   */
  public clear(): void {
    if (this.checkStorageSupport()) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(NAMESPACE)) {
            keysToRemove.push(k);
          }
        }
        for (const k of keysToRemove) {
          window.sessionStorage.removeItem(k);
        }
      } catch {
        // ignore
      }
    }
    this.memoryMap.clear();
  }

  public isStorageAvailable(): boolean {
    return this.checkStorageSupport();
  }

  // --- Convenience Methods per Requirement 4 ---

  public getCachedRelease(): CacheEntry<ReleaseInfo> | null {
    return this.get<ReleaseInfo>(KEY_LATEST);
  }

  public setCachedRelease(release: ReleaseInfo, etag?: string | null): void {
    this.set<ReleaseInfo>(KEY_LATEST, release, etag);
  }

  public getCachedHistory(): CacheEntry<ReleaseInfo[]> | null {
    return this.get<ReleaseInfo[]>(KEY_HISTORY);
  }

  public setCachedHistory(releases: ReleaseInfo[], etag?: string | null): void {
    this.set<ReleaseInfo[]>(KEY_HISTORY, releases, etag);
  }

  public touchReleaseCache(): void {
    this.touch(KEY_LATEST);
  }

  public clearCache(): void {
    this.clear();
  }
}

export const cacheService = new CacheService();
