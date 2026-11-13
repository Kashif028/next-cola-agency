/**
 * UI Domain Types & State Machine Contracts
 * Consumed by WebsiteApp components, hooks, and services.
 * Matches specifications from PROJECT.md § Interface Contracts.
 */

export interface AppConfig {
  github: {
    owner: string;
    repo: string;
    latestApiUrl: string;
    releasesApiUrl: string;
    releasesWebUrl: string;
    apkFilenamePattern: RegExp | null;
    cacheTtlMs: number;
  };
  app: {
    name: string;
    tagline: string;
    contactEmail: string;
    contactPhone: string;
  };
}

export interface ApkAssetInfo {
  id: number;
  filename: string;
  sizeBytes: number;
  formattedSize: string; // e.g. "24.5 MB"
  downloadUrl: string; // validated HTTPS download link
  downloadCount: number;
  updatedAt: string;
}

export interface CompatibilityInfo {
  minAndroidVersion: string | null; // e.g. "Android 7.0+" or null ("Not provided")
  targetSdkVersion: string | null;   // e.g. "API 34" or null
  packageName: string | null;        // e.g. "com.nextcola.distribution" or null
}

export interface ReleaseInfo {
  id: number;
  versionTag: string; // e.g. "v1.2.0"
  title: string; // e.g. "Cold Drink Distribution Agency App v1.2.0"
  releaseDate: string; // ISO 8601 string
  formattedDate: string; // e.g. "Nov 12, 2026"
  releaseNotesRaw: string;
  sanitizedNotesHtml: string;
  githubReleaseUrl: string;
  isPrerelease: boolean;
  apkAsset: ApkAssetInfo | null;
  sha256Checksum: string | null; // Genuine extracted hex checksum or null ("Not provided")
  compatibility: CompatibilityInfo;
}

export type EmptyReleaseReason = 'NO_RELEASES' | 'NO_APK' | 'REPO_404';

export type GitHubApiErrorCode =
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'NO_APK'
  | 'NO_RELEASES'
  | 'NETWORK_ERROR'
  | 'INVALID_CONFIG'
  | 'UNKNOWN';

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTimestamp: number; // Unix epoch seconds
  minutesUntilReset: number;
}

export interface GitHubApiError {
  code: GitHubApiErrorCode;
  message: string;
  rateLimitInfo?: RateLimitInfo;
  retryAfterSeconds?: number;
  minutesUntilReset?: number;
  resetTimestamp?: number;
  fallbackUrl?: string;
}

export interface GitHubReleaseState {
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  emptyReason?: EmptyReleaseReason;
  latestRelease: ReleaseInfo | null;
  historyReleases: ReleaseInfo[];
  error: GitHubApiError | null;
  refetch: (forceRefresh?: boolean) => Promise<void>;
  isRefreshing: boolean;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  etag?: string | null;
}
