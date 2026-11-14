/**
 * GitHub Releases API Service
 * Manages GitHub Releases requests, asset detection & filtering, ETag validation,
 * rate limit tracking, error classification, and in-flight promise deduplication.
 */

import { AppConfig, getAppConfig } from '../config/appConfig';
import { GitHubAssetRaw, GitHubReleaseRaw } from '../types/github';
import {
  ApkAssetInfo,
  DesktopAssetInfo,
  GitHubApiError,
  RateLimitInfo,
  ReleaseInfo,
  EmptyReleaseReason,
} from '../types/website';
import { cacheService } from './cacheService';
import {
  sanitizeReleaseNotes,
  extractSha256Checksum,
  extractAndroidCompatibility,
} from './sanitizer';

// In-flight deduplication promises
let latestInFlightPromise: Promise<FetchLatestResult> | null = null;
let historyInFlightPromise: Promise<FetchHistoryResult> | null = null;

export function resetInFlightPromises(): void {
  latestInFlightPromise = null;
  historyInFlightPromise = null;
}

export interface FetchLatestResult {
  release: ReleaseInfo | null;
  emptyReason?: EmptyReleaseReason;
  rateLimitInfo?: RateLimitInfo;
  error?: GitHubApiError;
}

export interface FetchHistoryResult {
  releases: ReleaseInfo[];
  rateLimitInfo?: RateLimitInfo;
  error?: GitHubApiError;
}

/**
 * Checks if a filename is an Android APK asset.
 * Rejects non-APK files including source archives (.zip, .tar.gz), desktop binaries (.exe, .dmg), and checksums (.sha256).
 */
export function isApkAsset(filename: string): boolean {
  if (!filename || typeof filename !== 'string') return false;
  const clean = filename.trim().toLowerCase();

  // Must strictly end with .apk
  if (!clean.endsWith('.apk')) return false;

  // Reject compound or deceptive extensions
  const forbiddenEndings = [
    '.zip',
    '.tar.gz',
    '.tgz',
    '.tar',
    '.bz2',
    '.7z',
    '.rar',
    '.exe',
    '.msi',
    '.dmg',
    '.pkg',
    '.deb',
    '.rpm',
    '.sha256',
    '.sha1',
    '.md5',
    '.asc',
    '.sig',
    '.json',
    '.txt',
    '.log',
    '.md',
  ];
  for (const forbidden of forbiddenEndings) {
    if (clean.endsWith(forbidden)) return false;
  }

  return true;
}

/**
 * Formats byte size into human-readable representation.
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let val = bytes;

  while (val >= 1024 && unitIndex < units.length - 1) {
    val /= 1024;
    unitIndex++;
  }

  // 1 decimal place for KB/MB, 2 for GB, 0 for B
  const decimals = unitIndex === 0 ? 0 : unitIndex === 3 ? 2 : 1;
  return `${val.toFixed(decimals)} ${units[unitIndex]}`;
}

/**
 * Formats ISO date into human-readable string (e.g., "Nov 12, 2026").
 * Returns "Not provided" if date is null or invalid.
 */
export function formatReleaseDate(isoDate: string | null): string {
  if (!isoDate) return 'Not provided';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return 'Not provided';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return 'Not provided';
  }
}

/**
 * Selects the primary APK asset from a release based on hierarchy:
 * 1. Matches configured pattern
 * 2. Contains "universal"
 * 3. Contains "release"
 * 4. First valid APK
 */
export function selectPrimaryApk(
  assets: GitHubAssetRaw[],
  pattern?: RegExp | null
): GitHubAssetRaw | null {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  const validApks = assets.filter((asset) => isApkAsset(asset.name));
  if (validApks.length === 0) return null;
  if (validApks.length === 1) return validApks[0];

  // 1. Configured pattern match
  if (pattern) {
    const match = validApks.find((asset) => pattern.test(asset.name));
    if (match) return match;
  }

  // 2. Universal match
  const universalMatch = validApks.find((asset) => /universal/i.test(asset.name));
  if (universalMatch) return universalMatch;

  // 3. Release keyword match
  const releaseMatch = validApks.find((asset) => /release/i.test(asset.name));
  if (releaseMatch) return releaseMatch;

  // 4. Deterministic fallback to first APK
  return validApks[0];
}

/**
 * Parses GitHub HTTP rate limit headers into RateLimitInfo.
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limitHeader = headers.get('x-ratelimit-limit');
  const remainingHeader = headers.get('x-ratelimit-remaining');
  const resetHeader = headers.get('x-ratelimit-reset');

  if (!limitHeader || !remainingHeader || !resetHeader) return null;

  const limit = parseInt(limitHeader, 10);
  const remaining = parseInt(remainingHeader, 10);
  const resetTimestamp = parseInt(resetHeader, 10);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const secondsUntilReset = Math.max(0, resetTimestamp - nowSeconds);
  const minutesUntilReset = Math.max(1, Math.ceil(secondsUntilReset / 60));

  return {
    limit,
    remaining,
    resetTimestamp,
    minutesUntilReset,
  };
}

/**
 * Selects the primary Windows desktop executable (.exe) from a release.
 */
export function selectPrimaryExe(
  assets: GitHubAssetRaw[]
): GitHubAssetRaw | null {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const valid = assets.filter(
    (a) => a && typeof a.name === 'string' && a.name.trim().toLowerCase().endsWith('.exe')
  );
  if (valid.length === 0) {
    const msi = assets.filter(
      (a) => a && typeof a.name === 'string' && a.name.trim().toLowerCase().endsWith('.msi')
    );
    return msi.length > 0 ? msi[0] : null;
  }
  const setupMatch = valid.find((a) => /setup/i.test(a.name));
  return setupMatch || valid[0];
}

/**
 * Transforms a raw GitHub release into a normalized ReleaseInfo domain object.
 */
export function transformRawRelease(
  raw: GitHubReleaseRaw,
  pattern?: RegExp | null
): ReleaseInfo {
  const selectedApk = selectPrimaryApk(raw.assets || [], pattern);

  let apkAsset: ApkAssetInfo | null = null;
  if (selectedApk) {
    const rawUrl = typeof selectedApk.browser_download_url === 'string'
      ? selectedApk.browser_download_url
      : '';
    const downloadUrl = rawUrl.startsWith('https://')
      ? rawUrl
      : rawUrl
      ? `https://${rawUrl.replace(/^http:\/\//, '')}`
      : (raw.html_url || '');

    apkAsset = {
      id: selectedApk.id,
      filename: selectedApk.name,
      sizeBytes: selectedApk.size,
      formattedSize: formatFileSize(selectedApk.size),
      downloadUrl,
      downloadCount: selectedApk.download_count || 0,
      updatedAt: selectedApk.updated_at,
    };
  }

  const selectedExe = selectPrimaryExe(raw.assets || []);
  let exeAsset: DesktopAssetInfo | null = null;
  if (selectedExe) {
    const rawUrl = typeof selectedExe.browser_download_url === 'string'
      ? selectedExe.browser_download_url
      : '';
    const downloadUrl = rawUrl.startsWith('https://')
      ? rawUrl
      : rawUrl
      ? `https://${rawUrl.replace(/^http:\/\//, '')}`
      : (raw.html_url || '');

    exeAsset = {
      id: selectedExe.id,
      filename: selectedExe.name,
      sizeBytes: selectedExe.size,
      formattedSize: formatFileSize(selectedExe.size),
      downloadUrl,
      downloadCount: selectedExe.download_count || 0,
      updatedAt: selectedExe.updated_at,
    };
  }

  const dateToUse = raw.published_at || raw.created_at;

  return {
    id: raw.id,
    versionTag: raw.tag_name || 'v0.0.0',
    title: raw.name || raw.tag_name || 'Cold Drink Distribution Agency App',
    releaseDate: dateToUse,
    formattedDate: formatReleaseDate(dateToUse),
    releaseNotesRaw: raw.body || '',
    sanitizedNotesHtml: sanitizeReleaseNotes(raw.body || ''),
    githubReleaseUrl: raw.html_url || '',
    isPrerelease: !!raw.prerelease,
    apkAsset,
    exeAsset,
    sha256Checksum: extractSha256Checksum(raw.body || ''),
    compatibility: extractAndroidCompatibility(raw.body || ''),
  };
}

/**
 * Fetches the latest published stable release from GitHub.
 * Implements 5-minute sessionStorage caching, conditional ETag requests, and in-flight deduplication.
 */
export async function fetchLatestRelease(
  customConfig?: AppConfig,
  forceRefresh = false
): Promise<FetchLatestResult> {
  const config = customConfig || getAppConfig();
  const cached = cacheService.getCachedRelease();

  // 1. Fresh cache check (immediate return, no network request)
  if (!forceRefresh && cacheService.isFresh(cached, config.github.cacheTtlMs) && cached?.data) {
    const release = cached.data;
    if (!release.apkAsset) {
      return { release, emptyReason: 'NO_APK' };
    }
    return { release };
  }

  // Deduplicate concurrent in-flight requests
  if (latestInFlightPromise) {
    return latestInFlightPromise;
  }

  latestInFlightPromise = (async () => {
    try {
      // 2. Prepare conditional headers (ZERO AUTH TOKENS)
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (!forceRefresh && cached?.etag) {
        headers['If-None-Match'] = cached.etag;
      }

      const res = await fetch(config.github.latestApiUrl, {
        method: 'GET',
        headers,
      });

      const rateLimitInfo = parseRateLimitHeaders(res.headers) || undefined;

      // 3. HTTP 304 Not Modified
      if (res.status === 304) {
        cacheService.touchReleaseCache();
        const release = cached ? cached.data : null;
        if (release && !release.apkAsset) {
          return { release, emptyReason: 'NO_APK', rateLimitInfo };
        }
        return { release, rateLimitInfo };
      }

      // 4. HTTP 403 Rate Limited
      if (res.status === 403) {
        const minutes = rateLimitInfo?.minutesUntilReset || 60;
        return {
          release: null,
          rateLimitInfo,
          error: {
            code: 'RATE_LIMITED',
            message: `GitHub API rate limit exceeded (60 requests/hr). Reset in approximately ${minutes} minute${minutes === 1 ? '' : 's'}.`,
            rateLimitInfo,
          },
        };
      }

      // 5. HTTP 404 No Release or Repo Not Found
      if (res.status === 404) {
        return {
          release: null,
          emptyReason: 'NO_RELEASES',
          rateLimitInfo,
          error: {
            code: 'NOT_FOUND',
            message: 'No published releases found for this repository.',
            rateLimitInfo,
          },
        };
      }

      // 6. Generic HTTP error
      if (!res.ok) {
        return {
          release: null,
          rateLimitInfo,
          error: {
            code: 'NETWORK_ERROR',
            message: `GitHub API error: HTTP ${res.status} ${res.statusText}`,
            rateLimitInfo,
          },
        };
      }

      // 7. HTTP 200 Success
      const rawData = (await res.json()) as GitHubReleaseRaw;
      const release = transformRawRelease(rawData, config.github.apkFilenamePattern);
      const etag = res.headers.get('etag');

      cacheService.setCachedRelease(release, etag);

      if (!release.apkAsset) {
        return { release, emptyReason: 'NO_APK', rateLimitInfo };
      }
      return { release, rateLimitInfo };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown network failure';
      return {
        release: null,
        error: {
          code: 'NETWORK_ERROR',
          message: `Network failure connecting to GitHub API: ${message}`,
        },
      };
    } finally {
      latestInFlightPromise = null;
    }
  })();

  return latestInFlightPromise;
}

/**
 * Fetches release history for the Version History section.
 */
export async function fetchReleaseHistory(
  customConfig?: AppConfig,
  perPage = 10,
  forceRefresh = false
): Promise<FetchHistoryResult> {
  const config = customConfig || getAppConfig();
  const cached = cacheService.getCachedHistory();

  // 1. Fresh cache check
  if (!forceRefresh && cacheService.isFresh(cached, config.github.cacheTtlMs) && cached?.data) {
    return { releases: cached.data };
  }

  if (historyInFlightPromise) {
    return historyInFlightPromise;
  }

  historyInFlightPromise = (async () => {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (!forceRefresh && cached?.etag) {
        headers['If-None-Match'] = cached.etag;
      }

      const url = `${config.github.releasesApiUrl}?per_page=${perPage}&page=1`;
      const res = await fetch(url, { method: 'GET', headers });
      const rateLimitInfo = parseRateLimitHeaders(res.headers) || undefined;

      if (res.status === 304) {
        cacheService.touch('release_history');
        return { releases: cached ? cached.data : [], rateLimitInfo };
      }

      if (res.status === 403) {
        return {
          releases: cached ? cached.data : [],
          rateLimitInfo,
          error: {
            code: 'RATE_LIMITED',
            message: 'GitHub API rate limit reached.',
            rateLimitInfo,
          },
        };
      }

      if (!res.ok) {
        return {
          releases: cached ? cached.data : [],
          rateLimitInfo,
          error: {
            code: 'NETWORK_ERROR',
            message: `Failed to fetch release history: HTTP ${res.status}`,
            rateLimitInfo,
          },
        };
      }

      const rawReleases = (await res.json()) as GitHubReleaseRaw[];
      const releases = rawReleases
        .filter((r) => !r.draft)
        .map((r) => transformRawRelease(r, config.github.apkFilenamePattern));

      const etag = res.headers.get('etag');
      cacheService.setCachedHistory(releases, etag);

      return { releases, rateLimitInfo };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown network failure';
      return {
        releases: [],
        error: {
          code: 'NETWORK_ERROR',
          message: `Network error fetching history: ${message}`,
        },
      };
    } finally {
      historyInFlightPromise = null;
    }
  })();

  return historyInFlightPromise;
}
