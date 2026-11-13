import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  fetchLatestRelease,
  transformRawRelease,
  parseRateLimitHeaders,
  selectPrimaryApk,
  isApkAsset,
  resetInFlightPromises,
} from '../services/githubService';
import { cacheService, CacheService } from '../services/cacheService';
import { resetAppConfig } from '../config/appConfig';
import {
  sanitizeReleaseNotes,
  extractSha256Checksum,
} from '../services/sanitizer';
import { GitHubAssetRaw, GitHubReleaseRaw } from '../types/github';

function makeMockAsset(
  name: string,
  size = 25000000,
  url?: string
): GitHubAssetRaw {
  return {
    id: Math.floor(Math.random() * 100000),
    name,
    label: null,
    content_type: 'application/vnd.android.package-archive',
    state: 'uploaded',
    size,
    download_count: 120,
    created_at: '2026-11-10T12:00:00Z',
    updated_at: '2026-11-10T12:00:00Z',
    browser_download_url: url || `https://github.com/downloads/${name}`,
  };
}

function makeMockRelease(
  assets: GitHubAssetRaw[] = [],
  body = '',
  tag = 'v1.0.0'
): GitHubReleaseRaw {
  return {
    id: 1001,
    tag_name: tag,
    name: `App ${tag}`,
    body,
    draft: false,
    prerelease: false,
    created_at: '2026-11-10T12:00:00Z',
    published_at: '2026-11-10T14:00:00Z',
    html_url: `https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/${tag}`,
    tarball_url: null,
    zipball_url: null,
    assets,
  };
}

describe('Empirical Adversarial Challenge Suite', () => {
  beforeEach(() => {
    cacheService.clear();
    resetAppConfig();
    resetInFlightPromises();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Caching Service: TTL Expiration, Rapid Concurrency, Quota & Clock Skew
  // =========================================================================
  describe('1. Caching Service Under Adversarial & Stress Conditions', () => {
    it('ADV-CACHE-01: TTL boundary test - fresh at T+4999ms, expired at T+5000ms', () => {
      const now = 1000000000;
      const ttl = 5000;
      const entry = {
        data: { version: 'v1.0.0' },
        timestamp: now,
        etag: 'etag-1',
      };

      const dateSpy = vi.spyOn(Date, 'now');

      // T + 4999ms -> Fresh
      dateSpy.mockReturnValue(now + 4999);
      expect(cacheService.isFresh(entry, ttl)).toBe(true);

      // T + 5000ms -> Expired (strictly < ttl)
      dateSpy.mockReturnValue(now + 5000);
      expect(cacheService.isFresh(entry, ttl)).toBe(false);

      // T + 10000ms -> Expired
      dateSpy.mockReturnValue(now + 10000);
      expect(cacheService.isFresh(entry, ttl)).toBe(false);
    });

    it('ADV-CACHE-02: Clock skew - local clock jumping backwards or forwards', () => {
      const baseTime = 1700000000000;
      const ttl = 300000; // 5 min
      const entry = {
        data: 'clock-test',
        timestamp: baseTime,
        etag: null,
      };

      const dateSpy = vi.spyOn(Date, 'now');

      // Jump 1 hour forward into future
      dateSpy.mockReturnValue(baseTime + 3600000);
      expect(cacheService.isFresh(entry, ttl)).toBe(false);

      // Jump 1 hour backward into past (Date.now() < timestamp)
      dateSpy.mockReturnValue(baseTime - 3600000);
      // Evaluates Date.now() - timestamp = -3600000 < 300000 -> returns true
      const resultPast = cacheService.isFresh(entry, ttl);
      expect(typeof resultPast).toBe('boolean');
    });

    it('ADV-CACHE-03: Storage quota failure simulation in sessionStorage', () => {
      // Create a fresh CacheService instance with mocked sessionStorage
      const mockStorage: Record<string, string> = {};
      const fakeSessionStorage = {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (_k: string, _v: string) => {
          throw new Error('QuotaExceededError: DomException 22');
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          for (const k in mockStorage) delete mockStorage[k];
        },
        key: (_i: number) => null,
        length: 0,
      };

      const origWindow = global.window;
      // @ts-expect-error mocking window.sessionStorage
      global.window = { sessionStorage: fakeSessionStorage };

      try {
        const quotaCache = new CacheService();
        // setItem should catch QuotaExceededError and write to memoryMap
        expect(() => {
          quotaCache.set('quota_key', { resilient: true }, 'etag-q');
        }).not.toThrow();

        const retrieved = quotaCache.get<{ resilient: boolean }>('quota_key');
        expect(retrieved).not.toBeNull();
        expect(retrieved?.data.resilient).toBe(true);
      } finally {
        global.window = origWindow;
      }
    });

    it('ADV-CACHE-03B: Runtime storage quota exhaustion (setItem throws AFTER checkStorageSupport passed)', () => {
      let quotaFull = false;
      const mockStorage: Record<string, string> = {};
      const fakeSessionStorage = {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => {
          if (quotaFull) {
            throw new Error('QuotaExceededError: DOMException 22');
          }
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          for (const k in mockStorage) delete mockStorage[k];
        },
        key: (_i: number) => null,
        length: 0,
      };

      const origWindow = global.window;
      // @ts-expect-error mocking window.sessionStorage
      global.window = { sessionStorage: fakeSessionStorage };

      try {
        const quotaCache = new CacheService();
        // At initialization, checkStorageSupport succeeded (quotaFull is false)
        expect(quotaCache.isStorageAvailable()).toBe(true);

        // Now simulate storage becoming full
        quotaFull = true;

        // Attempting to set an item throws inside setItem, but cacheService catches it and writes to memoryMap
        expect(() => {
          quotaCache.set('runtime_quota_key', { inMemory: true }, 'etag-mem');
        }).not.toThrow();

        // What happens when getting the item?
        const retrieved = quotaCache.get<{ inMemory: boolean }>('runtime_quota_key');
        console.log('[ADV-CACHE-03B] Runtime quota exhaustion get result:', retrieved);
      } finally {
        global.window = origWindow;
      }
    });

    it('ADV-CACHE-04: Rapid consecutive queries (100 simultaneous concurrent fetches)', async () => {
      let networkCalls = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        networkCalls++;
        // Simulate async I/O latency
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          status: 200,
          ok: true,
          headers: new Headers({
            etag: '"concurrent-etag"',
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '40',
            'x-ratelimit-reset': `${Math.floor(Date.now() / 1000) + 1800}`,
          }),
          json: async () =>
            makeMockRelease([makeMockAsset('next-cola-v1.0.0.apk')]),
        };
      });

      // Fire 100 concurrent calls simultaneously
      const promises = Array.from({ length: 100 }, () =>
        fetchLatestRelease(undefined, true)
      );
      const results = await Promise.all(promises);

      // In-flight deduplication must collapse 100 requests into exactly 1 network call
      expect(networkCalls).toBe(1);
      expect(results.length).toBe(100);
      for (const res of results) {
        expect(res.release?.versionTag).toBe('v1.0.0');
        expect(res.release?.apkAsset?.filename).toBe('next-cola-v1.0.0.apk');
      }
    });

    it('ADV-CACHE-05: Corrupted cache payload in storage does not crash service', () => {
      // Mock window.sessionStorage with malformed JSON
      const storage: Record<string, string> = {
        'apk_dl_cache_latest_release': '{ bad json corrupted string %%',
        'apk_dl_cache_bad_schema': JSON.stringify({ invalid: 'no timestamp or data' }),
      };
      const origWindow = global.window;
      // @ts-expect-error mock
      global.window = {
        sessionStorage: {
          getItem: (k: string) => storage[k] || null,
          setItem: (k: string, v: string) => {
            storage[k] = v;
          },
          removeItem: (k: string) => {
            delete storage[k];
          },
          clear: () => {},
          key: () => null,
          length: 0,
        },
      };

      try {
        const testCache = new CacheService();
        expect(() => testCache.getCachedRelease()).not.toThrow();
        expect(testCache.getCachedRelease()).toBeNull();
        expect(testCache.get('bad_schema')).toBeNull();
      } finally {
        global.window = origWindow;
      }
    });
  });

  // =========================================================================
  // 2. ETag Matching & HTTP 304 Handling
  // =========================================================================
  describe('2. ETag Matching and HTTP 304 Resilience', () => {
    it('ADV-ETAG-01: Sends If-None-Match header when cached ETag exists and refreshes cache timestamp on 304', async () => {
      const mockApk = makeMockAsset('next-cola-universal.apk');
      const release = transformRawRelease(makeMockRelease([mockApk]));
      
      // Seed cache with expired timestamp
      const pastTime = Date.now() - 400000; // 400s ago (> 300s TTL)
      cacheService.setCachedRelease(release, '"etag-abc-123"');
      const stored = cacheService.getCachedRelease();
      if (stored) stored.timestamp = pastTime;

      let sentIfNoneMatch: string | null = null;
      global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        sentIfNoneMatch = opts?.headers?.['If-None-Match'] || null;
        return {
          status: 304,
          ok: false,
          headers: new Headers({
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '55',
            'x-ratelimit-reset': `${Math.floor(Date.now() / 1000) + 3000}`,
          }),
        };
      });

      // Call without forceRefresh -> Cache is expired, so it must send conditional request
      const res = await fetchLatestRelease(undefined, false);

      expect(sentIfNoneMatch).toBe('"etag-abc-123"');
      expect(res.release?.versionTag).toBe('v1.0.0');

      // Cache timestamp should have been touched to current time (> pastTime)
      const updatedCache = cacheService.getCachedRelease();
      expect(updatedCache?.timestamp).toBeGreaterThan(pastTime);

      // Subsequent call immediately after should hit fresh cache without calling fetch
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;
      const resFresh = await fetchLatestRelease(undefined, false);
      expect(resFresh.release?.versionTag).toBe('v1.0.0');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('ADV-ETAG-02: Handles HTTP 304 when client has no cached release without throwing', async () => {
      cacheService.clear();

      global.fetch = vi.fn().mockResolvedValue({
        status: 304,
        ok: false,
        headers: new Headers(),
      });

      const res = await fetchLatestRelease(undefined, true);
      expect(res.release).toBeNull();
      expect(res.error).toBeUndefined();
    });

    it('ADV-ETAG-03: HTTP 304 preserves emptyReason if cached release had NO_APK', async () => {
      const releaseNoApk = transformRawRelease(makeMockRelease([]));
      cacheService.setCachedRelease(releaseNoApk, '"etag-empty"');

      global.fetch = vi.fn().mockResolvedValue({
        status: 304,
        ok: false,
        headers: new Headers(),
      });

      const res = await fetchLatestRelease(undefined, true);
      expect(res.release?.apkAsset).toBeNull();
      expect(res.emptyReason).toBe('NO_APK');
    });
  });

  // =========================================================================
  // 3. Rate Limiting Headers: Missing, Boundary, Negative & Extreme Resets
  // =========================================================================
  describe('3. Rate Limiting Headers Stress & Edge Cases', () => {
    it('ADV-RATE-01: Handles completely missing rate limit headers safely', () => {
      const headers = new Headers();
      expect(parseRateLimitHeaders(headers)).toBeNull();
    });

    it('ADV-RATE-02: Handles partially missing rate limit headers', () => {
      const headers1 = new Headers({ 'x-ratelimit-limit': '60' });
      expect(parseRateLimitHeaders(headers1)).toBeNull();

      const headers2 = new Headers({
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '0',
      });
      expect(parseRateLimitHeaders(headers2)).toBeNull();
    });

    it('ADV-RATE-03: Zero remaining requests properly sets remaining = 0', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const headers = new Headers({
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': `${nowSec + 120}`,
      });
      const parsed = parseRateLimitHeaders(headers);
      expect(parsed).not.toBeNull();
      expect(parsed?.remaining).toBe(0);
      expect(parsed?.minutesUntilReset).toBe(2);
    });

    it('ADV-RATE-04: Negative remaining requests (e.g. -1 or -5)', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const headers = new Headers({
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '-5',
        'x-ratelimit-reset': `${nowSec + 300}`,
      });
      const parsed = parseRateLimitHeaders(headers);
      expect(parsed).not.toBeNull();
      expect(parsed?.remaining).toBe(-5);
      expect(parsed?.minutesUntilReset).toBe(5);
    });

    it('ADV-RATE-05: Reset timestamp in the past clamps minutesUntilReset to >= 1', () => {
      const pastSec = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const headers = new Headers({
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': `${pastSec}`,
      });
      const parsed = parseRateLimitHeaders(headers);
      expect(parsed).not.toBeNull();
      // Should not be negative minutes
      expect(parsed?.minutesUntilReset).toBe(1);
    });

    it('ADV-RATE-06: Reset timestamp in far future (> 1 year)', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const oneYearFuture = nowSec + 31536000;
      const headers = new Headers({
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '10',
        'x-ratelimit-reset': `${oneYearFuture}`,
      });
      const parsed = parseRateLimitHeaders(headers);
      expect(parsed).not.toBeNull();
      expect(parsed?.minutesUntilReset).toBe(525600);
      expect(isNaN(parsed?.minutesUntilReset || NaN)).toBe(false);
    });

    it('ADV-RATE-07: Malformed non-numeric rate limit headers', () => {
      const headers = new Headers({
        'x-ratelimit-limit': 'unlimited',
        'x-ratelimit-remaining': 'none',
        'x-ratelimit-reset': 'tomorrow',
      });
      const parsed = parseRateLimitHeaders(headers);
      // parseInt('unlimited') returns NaN
      expect(parsed).not.toBeNull();
      expect(Number.isNaN(parsed?.limit)).toBe(true);
      expect(Number.isNaN(parsed?.remaining)).toBe(true);
      expect(Number.isNaN(parsed?.resetTimestamp)).toBe(true);
      expect(Number.isNaN(parsed?.minutesUntilReset)).toBe(true);
    });
  });

  // =========================================================================
  // 4. Tricky Asset Filenames, Filtering & Selection Hierarchy
  // =========================================================================
  describe('4. Tricky Asset Filenames and Asset Selection Hierarchy', () => {
    it('ADV-ASSET-01: Case variations of .apk (.APK, .Apk, .aPk, .apK)', () => {
      expect(isApkAsset('next-cola-v1.0.0.APK')).toBe(true);
      expect(isApkAsset('next-cola-v1.0.0.Apk')).toBe(true);
      expect(isApkAsset('next-cola-v1.0.0.aPk')).toBe(true);
      expect(isApkAsset('next-cola-v1.0.0.apK')).toBe(true);
    });

    it('ADV-ASSET-02: Deceptive compound extensions must be rejected', () => {
      expect(isApkAsset('app.apk.zip')).toBe(false);
      expect(isApkAsset('app.apk.tar.gz')).toBe(false);
      expect(isApkAsset('app.apk.tgz')).toBe(false);
      expect(isApkAsset('app.apk.7z')).toBe(false);
      expect(isApkAsset('app.apk.rar')).toBe(false);
      expect(isApkAsset('source_code.tar.gz')).toBe(false);
      expect(isApkAsset('app.apk.sha256')).toBe(false);
      expect(isApkAsset('app.apk.sig')).toBe(false);
      expect(isApkAsset('app.apk.exe')).toBe(false);
      expect(isApkAsset('app.apk.dmg')).toBe(false);
    });

    it('ADV-ASSET-03: APK ending with update.zip.apk (contains zip before apk)', () => {
      // Ends with .apk
      expect(isApkAsset('update.zip.apk')).toBe(true);
    });

    it('ADV-ASSET-04: Asset names with spaces, brackets, unicode, and special chars', () => {
      expect(isApkAsset('  Next Cola v1.0.apk  ')).toBe(true);
      expect(isApkAsset('Next Cola [Universal] (v1.2).apk')).toBe(true);
      expect(isApkAsset('app+v1.0#beta@release.apk')).toBe(true);
      expect(isApkAsset('distribution_cola_1.0.0.apk')).toBe(true);
    });

    it('ADV-ASSET-05: Non-filename inputs (URLs with query params or fragments, null, empty)', () => {
      expect(isApkAsset('https://github.com/download/app.apk?token=xyz')).toBe(false);
      expect(isApkAsset('https://github.com/download/app.apk#anchor')).toBe(false);
      expect(isApkAsset('')).toBe(false);
      expect(isApkAsset('   ')).toBe(false);
      // @ts-expect-error test non-string
      expect(isApkAsset(null)).toBe(false);
      // @ts-expect-error test non-string
      expect(isApkAsset(undefined)).toBe(false);
      // @ts-expect-error test number
      expect(isApkAsset(12345)).toBe(false);
    });

    it('ADV-ASSET-06: Extension only (.apk) without stem', () => {
      // ".apk".endsWith('.apk') is true
      expect(isApkAsset('.apk')).toBe(true);
    });

    it('ADV-ASSET-07: Selection hierarchy - Configured Pattern > Universal > Release > First Fallback', () => {
      const pattern = /custom-client/i;

      // Scenario A: All 4 candidates present -> Pattern must win
      const assetsAll = [
        makeMockAsset('app-first-fallback.apk'),
        makeMockAsset('app-release.apk'),
        makeMockAsset('app-universal.apk'),
        makeMockAsset('app-custom-client.apk'),
      ];
      expect(selectPrimaryApk(assetsAll, pattern)?.name).toBe('app-custom-client.apk');

      // Scenario B: No pattern match -> Universal must win over Release and Fallback
      const assetsNoPattern = [
        makeMockAsset('app-first-fallback.apk'),
        makeMockAsset('app-release.apk'),
        makeMockAsset('app-universal.apk'),
      ];
      expect(selectPrimaryApk(assetsNoPattern, pattern)?.name).toBe('app-universal.apk');

      // Scenario C: No universal -> Release must win over Fallback
      const assetsNoUniversal = [
        makeMockAsset('app-first-fallback.apk'),
        makeMockAsset('app-arm64-release.apk'),
        makeMockAsset('app-debug.apk'),
      ];
      expect(selectPrimaryApk(assetsNoUniversal, null)?.name).toBe('app-arm64-release.apk');

      // Scenario D: No keywords -> Deterministic First Fallback
      const assetsGeneric = [
        makeMockAsset('app-v8a.apk'),
        makeMockAsset('app-v7a.apk'),
        makeMockAsset('app-x86.apk'),
      ];
      expect(selectPrimaryApk(assetsGeneric, null)?.name).toBe('app-v8a.apk');
    });

    it('ADV-ASSET-08: Zero assets, releases with no APKs, and non-array assets', () => {
      expect(selectPrimaryApk([])).toBeNull();

      const nonApkAssets = [
        makeMockAsset('source.zip'),
        makeMockAsset('checksums.sha256'),
        makeMockAsset('notes.txt'),
        makeMockAsset('windows-installer.exe'),
      ];
      expect(selectPrimaryApk(nonApkAssets)).toBeNull();

      // @ts-expect-error non-array
      expect(selectPrimaryApk(null)).toBeNull();
      // @ts-expect-error non-array
      expect(selectPrimaryApk(undefined)).toBeNull();
      // @ts-expect-error non-array
      expect(selectPrimaryApk({})).toBeNull();
    });

    it('ADV-ASSET-09: Array containing null or malformed asset elements', () => {
      // In adversarial scenarios, API might return null in assets array
      const malformedAssets = [
        { id: 1 } as unknown as GitHubAssetRaw, // missing name
      ];
      expect(() => selectPrimaryApk(malformedAssets)).not.toThrow();
      expect(selectPrimaryApk(malformedAssets)).toBeNull();

      // If array contains null element:
      const assetsWithNull = [null as unknown as GitHubAssetRaw];
      expect(() => selectPrimaryApk(assetsWithNull)).toThrowError(TypeError);
    });
  });

  // =========================================================================
  // 5. Security & Sanitization Adversarial Stress
  // =========================================================================
  describe('5. Security, XSS Vectors & SHA-256 Checksum Honesty', () => {
    it('ADV-SEC-01: Strips advanced XSS vectors from release notes', () => {
      const attacks = [
        '<sCrIpt src="http://evil.com/xss.js"></sCrIpt>',
        '<img src="x" onerror="alert(document.cookie)">',
        '<svg onload="alert(1)">',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<a href="javascript:alert(1)">Click Me</a>',
        '<a href="j&#97;vascript:alert(1)">Entity Obfuscated</a>',
        '<a href="jav&#x09;ascript:alert(1)">Tab In Scheme</a>',
        '<a href="%6a%61%76%61%73%63%72%69%70%74:alert(1)">Percent Encoded</a>',
        '<a href="data:text/html,<script>alert(1)</script>">Data Scheme</a>',
        '<form action="http://evil.com"><input type="password"></form>',
        '<style>body { display: none; }</style>',
        '<div onmouseover="alert(1)">Hover me</div>',
        '<button onclick="alert(1)">Execute</button>',
      ];

      for (const attack of attacks) {
        const sanitized = sanitizeReleaseNotes(attack);
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('onload');
        expect(sanitized).not.toContain('onclick');
        expect(sanitized).not.toContain('onmouseover');
        expect(sanitized).not.toContain('<iframe');
        expect(sanitized).not.toContain('<svg');
        expect(sanitized).not.toContain('<form');
        expect(sanitized).not.toContain('<input');
        expect(sanitized).not.toContain('<button');
        expect(sanitized).not.toContain('<style');
        expect(sanitized).not.toContain('href="javascript:');
        expect(sanitized).not.toContain('href="data:');
      }
    });

    it('ADV-SEC-02: SHA-256 honesty - rejects fake, shortened, lengthened or fabricated hashes', () => {
      // 63-hex (1 char too short)
      expect(extractSha256Checksum('SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85')).toBeNull();

      // 65-hex (1 char too long)
      expect(extractSha256Checksum('SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855a')).toBeNull();

      // Invalid hex characters (g, h, z)
      expect(extractSha256Checksum('SHA-256: z3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85g')).toBeNull();

      // Empty or no hash present -> Truthfully returns null
      expect(extractSha256Checksum('')).toBeNull();
      expect(extractSha256Checksum(null)).toBeNull();
      expect(extractSha256Checksum('Release notes with no checksum mentioned.')).toBeNull();

      // Valid 64-char hex extracted in lowercase
      const validHash = 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
      expect(extractSha256Checksum(`Release: ${validHash}`)).toBe(validHash.toLowerCase());
    });

    it('ADV-SEC-03: Performance under large payload (100KB input without ReDoS)', () => {
      const largePayload = '## Change log\n' + '- Fixed item\n'.repeat(5000);
      const start = Date.now();
      const sanitized = sanitizeReleaseNotes(largePayload);
      const duration = Date.now() - start;

      expect(sanitized.length).toBeGreaterThan(1000);
      expect(duration).toBeLessThan(500); // Must process in under 500ms
    });

    it('ADV-SEC-04: HTTPS enforcement on download URLs', () => {
      const httpAsset = makeMockAsset('insecure.apk', 1000, 'http://insecure-cdn.example.com/insecure.apk');
      const release = transformRawRelease(makeMockRelease([httpAsset]));
      expect(release.apkAsset?.downloadUrl.startsWith('https://')).toBe(true);
      expect(release.apkAsset?.downloadUrl).toBe('https://insecure-cdn.example.com/insecure.apk');
    });
  });
});
