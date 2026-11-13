import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchLatestRelease,
  fetchReleaseHistory,
  transformRawRelease,
  parseRateLimitHeaders,
  resetInFlightPromises,
} from '../services/githubService';
import { cacheService } from '../services/cacheService';
import { resetAppConfig } from '../config/appConfig';
import { GitHubReleaseRaw } from '../types/github';

const mockReleaseRaw: GitHubReleaseRaw = {
  id: 1001,
  tag_name: 'v1.2.0',
  name: 'Next Cola Distribution App v1.2.0',
  body: '## Updates\n- Bluetooth printer stability\n\nSHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  draft: false,
  prerelease: false,
  created_at: '2026-11-10T12:00:00Z',
  published_at: '2026-11-10T14:00:00Z',
  html_url: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v1.2.0',
  tarball_url: null,
  zipball_url: null,
  assets: [
    {
      id: 501,
      name: 'next-cola-v1.2.0.apk',
      label: null,
      content_type: 'application/vnd.android.package-archive',
      state: 'uploaded',
      size: 25690112,
      download_count: 88,
      created_at: '2026-11-10T13:00:00Z',
      updated_at: '2026-11-10T13:30:00Z',
      browser_download_url:
        'https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v1.2.0/next-cola-v1.2.0.apk',
    },
  ],
};

describe('githubService', () => {
  beforeEach(() => {
    cacheService.clear();
    resetAppConfig();
    resetInFlightPromises();
    vi.restoreAllMocks();
  });

  it('T3.1: successfully transforms raw GitHub release', () => {
    const transformed = transformRawRelease(mockReleaseRaw);
    expect(transformed.id).toBe(1001);
    expect(transformed.versionTag).toBe('v1.2.0');
    expect(transformed.title).toBe('Next Cola Distribution App v1.2.0');
    expect(transformed.apkAsset).not.toBeNull();
    expect(transformed.apkAsset?.filename).toBe('next-cola-v1.2.0.apk');
    expect(transformed.apkAsset?.formattedSize).toBe('24.5 MB');
    expect(transformed.apkAsset?.downloadUrl).toBe(
      'https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v1.2.0/next-cola-v1.2.0.apk'
    );
    expect(transformed.sha256Checksum).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('T3.2: fetches latest release and writes to cache on HTTP 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({
        etag: '"test-etag-1"',
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '59',
        'x-ratelimit-reset': `${Math.floor(Date.now() / 1000) + 3600}`,
      }),
      json: async () => mockReleaseRaw,
    });

    const result = await fetchLatestRelease(undefined, true);
    expect(result.release).not.toBeNull();
    expect(result.release?.versionTag).toBe('v1.2.0');
    expect(result.rateLimitInfo?.remaining).toBe(59);

    const cached = cacheService.getCachedRelease();
    expect(cached).not.toBeNull();
    expect(cached?.etag).toBe('"test-etag-1"');
  });

  it('T3.3: uses cached release without network call if cache is fresh', async () => {
    const transformed = transformRawRelease(mockReleaseRaw);
    cacheService.setCachedRelease(transformed, '"fresh-etag"');

    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const result = await fetchLatestRelease();
    expect(result.release?.versionTag).toBe('v1.2.0');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('T3.4: handles HTTP 304 Not Modified by returning touched cached release', async () => {
    const transformed = transformRawRelease(mockReleaseRaw);
    cacheService.setCachedRelease(transformed, '"existing-etag"');

    global.fetch = vi.fn().mockResolvedValue({
      status: 304,
      ok: false,
      headers: new Headers(),
    });

    const result = await fetchLatestRelease(undefined, true);
    expect(result.release?.versionTag).toBe('v1.2.0');
  });

  it('T3.5: handles HTTP 403 Rate Limit and returns structured RATE_LIMITED error', async () => {
    const resetTime = Math.floor(Date.now() / 1000) + 1200; // 20 minutes from now
    global.fetch = vi.fn().mockResolvedValue({
      status: 403,
      ok: false,
      headers: new Headers({
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': `${resetTime}`,
      }),
      json: async () => ({ message: 'API rate limit exceeded' }),
    });

    const result = await fetchLatestRelease(undefined, true);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('RATE_LIMITED');
    expect(result.rateLimitInfo?.remaining).toBe(0);
    expect(result.rateLimitInfo?.minutesUntilReset).toBeGreaterThanOrEqual(19);
  });

  it('T3.6: handles HTTP 404 Not Found and returns NOT_FOUND error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 404,
      ok: false,
      headers: new Headers(),
      json: async () => ({ message: 'Not Found' }),
    });

    const result = await fetchLatestRelease(undefined, true);
    expect(result.release).toBeNull();
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('T3.7: identifies releases without APK assets and returns NO_APK emptyReason', async () => {
    const noApkRaw = {
      ...mockReleaseRaw,
      assets: [],
    };
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: async () => noApkRaw,
    });

    const result = await fetchLatestRelease(undefined, true);
    expect(result.release?.apkAsset).toBeNull();
    expect(result.emptyReason).toBe('NO_APK');
  });

  it('T3.8: handles network failure gracefully and returns NETWORK_ERROR', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await fetchLatestRelease(undefined, true);
    expect(result.release).toBeNull();
    expect(result.error?.code).toBe('NETWORK_ERROR');
    expect(result.error?.message).toContain('Failed to fetch');
  });

  it('T3.9: fetches release history and filters out draft releases', async () => {
    const rawList: GitHubReleaseRaw[] = [
      mockReleaseRaw,
      {
        ...mockReleaseRaw,
        id: 999,
        tag_name: 'v1.1.0-draft',
        draft: true,
      },
      {
        ...mockReleaseRaw,
        id: 998,
        tag_name: 'v1.0.0',
        draft: false,
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: async () => rawList,
    });

    const result = await fetchReleaseHistory(undefined, 10, true);
    expect(result.releases.length).toBe(2);
    expect(result.releases[0].versionTag).toBe('v1.2.0');
    expect(result.releases[1].versionTag).toBe('v1.0.0');
  });

  it('T3.10: deduplicates concurrent in-flight requests', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => mockReleaseRaw,
      };
    });

    const [res1, res2] = await Promise.all([
      fetchLatestRelease(undefined, true),
      fetchLatestRelease(undefined, true),
    ]);

    expect(res1.release?.versionTag).toBe('v1.2.0');
    expect(res2.release?.versionTag).toBe('v1.2.0');
    expect(callCount).toBe(1);
  });

  it('T3.11: strictly sends zero auth tokens or secrets in headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
      capturedHeaders = opts.headers;
      return {
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => mockReleaseRaw,
      };
    });

    await fetchLatestRelease(undefined, true);
    expect(capturedHeaders['Authorization']).toBeUndefined();
    expect(capturedHeaders['token']).toBeUndefined();
    expect(capturedHeaders['bearer']).toBeUndefined();
  });

  it('T3.12: parses rate limit headers accurately', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const headers = new Headers({
      'x-ratelimit-limit': '60',
      'x-ratelimit-remaining': '15',
      'x-ratelimit-reset': `${nowSec + 600}`,
    });
    const parsed = parseRateLimitHeaders(headers);
    expect(parsed).not.toBeNull();
    expect(parsed?.limit).toBe(60);
    expect(parsed?.remaining).toBe(15);
    expect(parsed?.minutesUntilReset).toBeGreaterThanOrEqual(9);
    expect(parsed?.minutesUntilReset).toBeLessThanOrEqual(11);
  });
});
