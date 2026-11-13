/**
 * Unit & Integration Test Suite for useGitHubRelease
 * Verifies state machine transitions, error classification, empty states,
 * dual fetching, rate limit countdowns, and non-tearing cache preservation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveReleaseState } from '../hooks/useGitHubRelease';
import {
  FetchLatestResult,
  FetchHistoryResult,
  fetchLatestRelease,
} from '../services/githubService';
import { cacheService } from '../services/cacheService';
import { ReleaseInfo, GitHubApiError } from '../types/website';
import { getAppConfig } from '../config/appConfig';

const mockApkRelease: ReleaseInfo = {
  id: 101,
  versionTag: 'v1.2.0',
  title: 'Nextco Distribution v1.2.0',
  releaseDate: '2026-11-10T12:00:00Z',
  formattedDate: 'November 10, 2026',
  releaseNotesRaw: 'sha256: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
  sanitizedNotesHtml: '<p>sha256: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069</p>',
  githubReleaseUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v1.2.0',
  isPrerelease: false,
  apkAsset: {
    id: 501,
    filename: 'cold-drink-distribution-universal-v1.2.0.apk',
    sizeBytes: 25690112,
    formattedSize: '24.5 MB',
    downloadUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v1.2.0/cold-drink-distribution-universal-v1.2.0.apk',
    downloadCount: 120,
    updatedAt: '2026-11-10T12:05:00Z',
  },
  sha256Checksum: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
  compatibility: {
    minAndroidVersion: 'Android 8.0+',
    targetSdkVersion: 'API 34',
    packageName: 'com.logartraders.colddrinkdistribution',
  },
};

const mockNoApkRelease: ReleaseInfo = {
  ...mockApkRelease,
  apkAsset: null,
};

const mockHistoryList: ReleaseInfo[] = [
  mockApkRelease,
  {
    ...mockApkRelease,
    id: 100,
    versionTag: 'v1.1.0',
    title: 'Nextco Distribution v1.1.0',
  },
  {
    ...mockApkRelease,
    id: 99,
    versionTag: 'v1.0.0',
    title: 'Nextco Distribution v1.0.0',
  },
];

describe('useGitHubRelease State Machine & Resolver Suite', () => {
  beforeEach(() => {
    cacheService.clear();
    vi.restoreAllMocks();
  });

  // T-HOOK-01: Successful latest release with APK asset
  it('T-HOOK-01: Successful latest release with APK asset resolves to status "success"', () => {
    const latestResult: FetchLatestResult = {
      release: mockApkRelease,
    };
    const historyResult: FetchHistoryResult = {
      releases: [mockApkRelease],
    };

    const state = resolveReleaseState(latestResult, historyResult);

    expect(state.status).toBe('success');
    expect(state.latestRelease).toBe(mockApkRelease);
    expect(state.latestRelease?.versionTag).toBe('v1.2.0');
    expect(state.latestRelease?.apkAsset).not.toBeNull();
    expect(state.error).toBeNull();
    expect(state.emptyReason).toBeUndefined();
  });

  // T-HOOK-02: History releases collection population
  it('T-HOOK-02: Correctly populates history releases list from dual-fetch result', () => {
    const latestResult: FetchLatestResult = {
      release: mockApkRelease,
    };
    const historyResult: FetchHistoryResult = {
      releases: mockHistoryList,
    };

    const state = resolveReleaseState(latestResult, historyResult);

    expect(state.historyReleases.length).toBe(3);
    expect(state.historyReleases[0].versionTag).toBe('v1.2.0');
    expect(state.historyReleases[1].versionTag).toBe('v1.1.0');
    expect(state.historyReleases[2].versionTag).toBe('v1.0.0');
  });

  // T-HOOK-03: Empty repository (no published releases)
  it('T-HOOK-03: Repository without releases resolves to status "empty" and emptyReason "NO_RELEASES"', () => {
    const latestResult: FetchLatestResult = {
      release: null,
      emptyReason: 'NO_RELEASES',
    };
    const historyResult: FetchHistoryResult = {
      releases: [],
    };

    const state = resolveReleaseState(latestResult, historyResult);

    expect(state.status).toBe('empty');
    expect(state.emptyReason).toBe('NO_RELEASES');
    expect(state.latestRelease).toBeNull();
    expect(state.error).toBeNull();
  });

  // T-HOOK-04: Release without APK asset
  it('T-HOOK-04: Release without APK asset resolves to status "empty" and emptyReason "NO_APK"', () => {
    const latestResult: FetchLatestResult = {
      release: mockNoApkRelease,
      emptyReason: 'NO_APK',
    };
    const historyResult: FetchHistoryResult = {
      releases: [mockNoApkRelease],
    };

    const state = resolveReleaseState(latestResult, historyResult);

    expect(state.status).toBe('empty');
    expect(state.emptyReason).toBe('NO_APK');
    expect(state.latestRelease).toBe(mockNoApkRelease);
    expect(state.latestRelease?.apkAsset).toBeNull();
    expect(state.error).toBeNull();
  });

  // T-HOOK-05: 403 Rate limited with reset headers
  it('T-HOOK-05: HTTP 403 Rate Limited resolves to status "error" with code "RATE_LIMITED" and countdown', () => {
    const resetEpoch = Math.floor(Date.now() / 1000) + 1800; // 30 minutes from now
    const rateLimitError: GitHubApiError = {
      code: 'RATE_LIMITED',
      message: 'API rate limit exceeded',
      rateLimitInfo: {
        limit: 60,
        remaining: 0,
        resetTimestamp: resetEpoch,
        minutesUntilReset: 30,
      },
    };

    const latestResult: FetchLatestResult = {
      release: null,
      error: rateLimitError,
      rateLimitInfo: rateLimitError.rateLimitInfo,
    };
    const historyResult: FetchHistoryResult = {
      releases: [],
    };

    const state = resolveReleaseState(latestResult, historyResult);

    expect(state.status).toBe('error');
    expect(state.error?.code).toBe('RATE_LIMITED');
    expect(state.error?.minutesUntilReset).toBe(30);
    expect(state.error?.fallbackUrl).toContain('github.com');
  });

  // T-HOOK-06: 404 Repository or release not found
  it('T-HOOK-06: HTTP 404 resolves to status "empty" and emptyReason "REPO_404"', () => {
    const latestResult: FetchLatestResult = {
      release: null,
      error: {
        code: 'NOT_FOUND',
        message: 'Not found',
      },
    };
    const historyResult: FetchHistoryResult = {
      releases: [],
    };

    const state = resolveReleaseState(latestResult, historyResult);

    expect(state.status).toBe('empty');
    expect(state.emptyReason).toBe('REPO_404');
    expect(state.latestRelease).toBeNull();
    expect(state.error?.fallbackUrl).toContain('github.com');
  });

  // T-HOOK-07: Network failure / timeout
  it('T-HOOK-07: Network error resolves to status "error" with code "NETWORK_ERROR"', () => {
    const latestResult: FetchLatestResult = {
      release: null,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Network connection failed',
      },
    };
    const historyResult: FetchHistoryResult = {
      releases: [],
    };

    const state = resolveReleaseState(latestResult, historyResult);

    expect(state.status).toBe('error');
    expect(state.error?.code).toBe('NETWORK_ERROR');
    expect(state.error?.message).toContain('Network connection failed');
  });

  // T-HOOK-08: Non-tearing cache preservation during rate-limited revalidation
  it('T-HOOK-08: Rate limited refetch preserves previously cached latestRelease', () => {
    const rateLimitError: GitHubApiError = {
      code: 'RATE_LIMITED',
      message: 'Rate limit hit during revalidation',
    };

    const latestResult: FetchLatestResult = {
      release: null,
      error: rateLimitError,
    };
    const historyResult: FetchHistoryResult = {
      releases: [],
    };

    // Pass previously loaded release as previousRelease
    const state = resolveReleaseState(latestResult, historyResult, mockApkRelease);

    expect(state.status).toBe('error');
    expect(state.error?.code).toBe('RATE_LIMITED');
    // Non-tearing guarantee: previous release remains available
    expect(state.latestRelease).toBe(mockApkRelease);
    expect(state.latestRelease?.versionTag).toBe('v1.2.0');
  });

  // T-HOOK-09: Cache hit behavior does not trigger network calls
  it('T-HOOK-09: Fresh cache returns release immediately without network calls', async () => {
    const config = getAppConfig();
    cacheService.setCachedRelease(mockApkRelease, 'W/"test-etag"');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchLatestRelease(config, false);

    expect(result.release).toBeDefined();
    expect(result.release?.versionTag).toBe('v1.2.0');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // T-HOOK-10: Dynamic rate limit countdown calculation
  it('T-HOOK-10: Computes accurate minutes until reset from epoch timestamp', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const targetReset = nowSeconds + 1500; // 25 minutes from now

    const state = resolveReleaseState(
      {
        release: null,
        error: { code: 'RATE_LIMITED', message: 'Rate limited' },
        rateLimitInfo: {
          limit: 60,
          remaining: 0,
          resetTimestamp: targetReset,
          minutesUntilReset: 25,
        },
      },
      { releases: [] }
    );

    expect(state.status).toBe('error');
    expect(state.error?.minutesUntilReset).toBe(25);
    expect(state.error?.resetTimestamp).toBe(targetReset);
  });
});
