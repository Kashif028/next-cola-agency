/**
/**
 * Tier 5 Adversarial Coverage Hardening Test Suite
 * Challenger 1 (challenger_m3_1) — Milestone 3 Phase 2
 *
 * White-box adversarial testing of API, Caching, Sanitizer, and Security layers:
 * 1. Malformed GitHub API payloads (304/403/404/500/502/503/504, corrupt epochs, empty assets)
 * 2. Deceptive asset filtering (double extensions, mixed case, zero-byte files, non-HTTPS URLs)
 * 3. Cryptographic SHA-256 extraction honesty (63/65 chars, invalid hex, URL tokens, multi-hash)
 * 4. Advanced XSS vectors (HTML5 tokenization, solidus, protocol obfuscation, SVG/MathML)
 * 5. Cache resilience (runtime quota exceptions, private mode, memory fallback, TTL boundaries)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  fetchLatestRelease,
  fetchReleaseHistory,
  transformRawRelease,
  parseRateLimitHeaders,
  isApkAsset,
  formatFileSize,
  resetInFlightPromises,
} from '../services/githubService';
import { cacheService, CacheService } from '../services/cacheService';
import { resetAppConfig } from '../config/appConfig';
import {
  sanitizeHtml,
  sanitizeReleaseNotes,
  extractSha256Checksum,
} from '../services/sanitizer';
import { resolveReleaseState } from '../hooks/useGitHubRelease';
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
    download_count: 150,
    created_at: '2026-11-13T10:00:00Z',
    updated_at: '2026-11-13T10:00:00Z',
    browser_download_url: url || `https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v1.0.0/${name}`,
  };
}

function makeMockRelease(
  assets: GitHubAssetRaw[] = [],
  body = '',
  tag = 'v1.0.0'
): GitHubReleaseRaw {
  return {
    id: 5001,
    tag_name: tag,
    name: `Cold Drink Distribution App ${tag}`,
    body,
    draft: false,
    prerelease: false,
    created_at: '2026-11-13T10:00:00Z',
    published_at: '2026-11-13T10:30:00Z',
    html_url: `https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/${tag}`,
    tarball_url: null,
    zipball_url: null,
    assets,
  };
}

describe('Tier 5 Adversarial Coverage Hardening Suite (Challenger 1)', () => {
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
  // DOMAIN 1: GitHub API Payloads, Status Codes & Header Corruption
  // =========================================================================
  describe('Domain 1: Malformed GitHub Releases API Payloads & Error States', () => {
    it('T5-API-01: HTTP 500 Internal Server Error returns structured NETWORK_ERROR', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
        ok: false,
        headers: new Headers(),
      });

      const res = await fetchLatestRelease(undefined, true);
      expect(res.release).toBeNull();
      expect(res.error).toBeDefined();
      expect(res.error?.code).toBe('NETWORK_ERROR');
      expect(res.error?.message).toContain('HTTP 500');
    });

    it('T5-API-02: HTTP 502 Bad Gateway returning raw HTML does not crash JSON parser', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 502,
        statusText: 'Bad Gateway',
        ok: false,
        headers: new Headers(),
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      const res = await fetchLatestRelease(undefined, true);
      expect(res.release).toBeNull();
      expect(res.error?.code).toBe('NETWORK_ERROR');
      expect(res.error?.message).toContain('HTTP 502');
    });

    it('T5-API-03: HTTP 503 Service Unavailable with Retry-After header', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 503,
        statusText: 'Service Unavailable',
        ok: false,
        headers: new Headers({
          'retry-after': '120',
        }),
      });

      const res = await fetchLatestRelease(undefined, true);
      expect(res.release).toBeNull();
      expect(res.error?.code).toBe('NETWORK_ERROR');
      expect(res.error?.message).toContain('HTTP 503');
    });

    it('T5-API-04: HTTP 504 Gateway Timeout handled gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 504,
        statusText: 'Gateway Timeout',
        ok: false,
        headers: new Headers(),
      });

      const res = await fetchLatestRelease(undefined, true);
      expect(res.release).toBeNull();
      expect(res.error?.code).toBe('NETWORK_ERROR');
    });

    it('T5-API-05: Rate limit reset with past epoch timestamp clamps minutesUntilReset to 1', () => {
      const pastSeconds = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
      const headers = new Headers({
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': `${pastSeconds}`,
      });

      const info = parseRateLimitHeaders(headers);
      expect(info).not.toBeNull();
      expect(info?.minutesUntilReset).toBe(1);
    });

    it('T5-API-06: Rate limit reset with corrupt non-numeric string produces NaN in parsed fields', () => {
      const headers = new Headers({
        'x-ratelimit-limit': 'invalid',
        'x-ratelimit-remaining': 'corrupt',
        'x-ratelimit-reset': 'epoch_time',
      });

      const info = parseRateLimitHeaders(headers);
      expect(info).not.toBeNull();
      expect(Number.isNaN(info?.limit)).toBe(true);
      expect(Number.isNaN(info?.remaining)).toBe(true);
      expect(Number.isNaN(info?.resetTimestamp)).toBe(true);
      expect(Number.isNaN(info?.minutesUntilReset)).toBe(true);
    });

    it('T5-API-07: Dual-fetch state resolution: latest 200 SUCCESS but history 403 RATE_LIMITED', () => {
      const mockApk = makeMockAsset('app-universal.apk');
      const release = transformRawRelease(makeMockRelease([mockApk]));

      const latestResult = {
        release,
        emptyReason: undefined,
      };

      const historyResult = {
        releases: [],
        error: {
          code: 'RATE_LIMITED' as const,
          message: 'Rate limited on history',
        },
      };

      const resolved = resolveReleaseState(latestResult, historyResult);
      // Rate limit on either request pulls state to error but preserves latestRelease
      expect(resolved.status).toBe('error');
      expect(resolved.error?.code).toBe('RATE_LIMITED');
      expect(resolved.latestRelease?.versionTag).toBe('v1.0.0');
    });

    it('T5-API-08: Dual-fetch state resolution: latest 200 SUCCESS but history NETWORK_ERROR', () => {
      const mockApk = makeMockAsset('app-universal.apk');
      const release = transformRawRelease(makeMockRelease([mockApk]));

      const latestResult = {
        release,
      };

      const historyResult = {
        releases: [],
        error: {
          code: 'NETWORK_ERROR' as const,
          message: 'Failed to fetch history',
        },
      };

      // Gracefully keeps latest release in success state despite history network error
      const resolved = resolveReleaseState(latestResult, historyResult);
      expect(resolved.status).toBe('success');
      expect(resolved.latestRelease?.versionTag).toBe('v1.0.0');
      expect(resolved.historyReleases).toEqual([]);
    });

    it('T5-API-09: HTTP 404 No Published Releases transforms to empty state with NO_RELEASES reason', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        ok: false,
        headers: new Headers(),
      });

      const res = await fetchLatestRelease(undefined, true);
      expect(res.release).toBeNull();
      expect(res.emptyReason).toBe('NO_RELEASES');
      expect(res.error?.code).toBe('NOT_FOUND');
    });

    it('T5-API-10: Release payload with missing assets property defaults safely to empty array', () => {
      const rawReleaseMissingAssets = {
        id: 101,
        tag_name: 'v1.0.0',
        name: 'Release without assets prop',
        body: 'Notes',
        draft: false,
        prerelease: false,
        created_at: '2026-11-13T00:00:00Z',
        published_at: '2026-11-13T00:00:00Z',
        html_url: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v1.0.0',
        tarball_url: null,
        zipball_url: null,
        // assets property omitted
      } as unknown as GitHubReleaseRaw;

      expect(() => transformRawRelease(rawReleaseMissingAssets)).not.toThrow();
      const release = transformRawRelease(rawReleaseMissingAssets);
      expect(release.apkAsset).toBeNull();
    });

    it('T5-API-11: Release history filters out draft releases automatically', async () => {
      const normalRelease = makeMockRelease([makeMockAsset('v1.apk')], 'Normal release', 'v1.0.0');
      const draftRelease = {
        ...makeMockRelease([makeMockAsset('v2-draft.apk')], 'Draft release', 'v2.0.0'),
        draft: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => [draftRelease, normalRelease],
      });

      const historyResult = await fetchReleaseHistory(undefined, 10, true);
      expect(historyResult.releases.length).toBe(1);
      expect(historyResult.releases[0].versionTag).toBe('v1.0.0');
    });
  });

  // =========================================================================
  // DOMAIN 2: Asset Filtering, Deceptive Filenames & URL Safety
  // =========================================================================
  describe('Domain 2: Asset Filtering & Deceptive Filename Defense', () => {
    it('T5-AST-01: Rejects deceptive double extensions ending in archive or executable', () => {
      const deceptive = [
        'app.apk.zip',
        'app.apk.tar.gz',
        'app.apk.tgz',
        'app.apk.7z',
        'app.apk.rar',
        'app.apk.exe',
        'app.apk.dmg',
        'app.apk.pkg',
        'app.apk.deb',
        'app.apk.rpm',
        'app.apk.sha256',
        'app.apk.sig',
        'app.apk.txt',
        'app.apk.json',
      ];

      for (const name of deceptive) {
        expect(isApkAsset(name)).toBe(false);
      }
    });

    it('T5-AST-02: Accepts uppercase and mixed case APK extensions', () => {
      expect(isApkAsset('distribution-app.APK')).toBe(true);
      expect(isApkAsset('distribution-app.Apk')).toBe(true);
      expect(isApkAsset('distribution-app.aPk')).toBe(true);
      expect(isApkAsset('distribution-app.apK')).toBe(true);
    });

    it('T5-AST-03: Accepts legit nested names ending in .apk', () => {
      expect(isApkAsset('update.zip.apk')).toBe(true);
      expect(isApkAsset('release-1.0.0.tar.apk')).toBe(true);
      expect(isApkAsset('backup.apk.apk')).toBe(true);
    });

    it('T5-AST-04: Non-filename inputs safely rejected without throwing', () => {
      expect(isApkAsset('')).toBe(false);
      expect(isApkAsset('   ')).toBe(false);
      // @ts-expect-error test non-string
      expect(isApkAsset(null)).toBe(false);
      // @ts-expect-error test non-string
      expect(isApkAsset(undefined)).toBe(false);
      // @ts-expect-error test number
      expect(isApkAsset(999)).toBe(false);
      // @ts-expect-error test object
      expect(isApkAsset({})).toBe(false);
    });

    it('T5-AST-05: Zero-byte file formatting and handling', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(-100)).toBe('0 B');
      expect(formatFileSize(NaN)).toBe('0 B');
    });

    it('T5-AST-06: Astronomical file size formatting (100 GB)', () => {
      const hundredGB = 100 * 1024 * 1024 * 1024;
      expect(formatFileSize(hundredGB)).toBe('100.00 GB');
    });

    it('T5-AST-07: Insecure HTTP download URL upgraded to HTTPS', () => {
      const httpAsset = makeMockAsset('app.apk', 5000000, 'http://mirror.example.com/app.apk');
      const release = transformRawRelease(makeMockRelease([httpAsset]));
      expect(release.apkAsset?.downloadUrl).toBe('https://mirror.example.com/app.apk');
    });

    it('T5-AST-08: Malformed asset missing browser_download_url handled safely without throwing', () => {
      // White-box vulnerability test: If GitHub API returns an asset with missing browser_download_url
      const assetNoUrl = {
        id: 999,
        name: 'app.apk',
        size: 5000000,
        // browser_download_url is undefined
      } as unknown as GitHubAssetRaw;

      // Safely falls back to html_url or empty string without throwing TypeError
      expect(() => {
        transformRawRelease(makeMockRelease([assetNoUrl]));
      }).not.toThrow();

      const release = transformRawRelease(makeMockRelease([assetNoUrl]));
      expect(release.apkAsset).not.toBeNull();
      expect(release.apkAsset?.downloadUrl).toBe('https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v1.0.0');
    });
  });

  // =========================================================================
  // DOMAIN 3: Cryptographic SHA-256 Checksum Extraction & Honesty
  // =========================================================================
  describe('Domain 3: Cryptographic SHA-256 Extraction & Honesty Invariants', () => {
    const validHex64 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

    it('T5-SHA-01: Extracts valid labeled SHA-256 with various label syntaxes', () => {
      const syntaxes = [
        `SHA-256: ${validHex64}`,
        `sha256: ${validHex64}`,
        `SHA256: ${validHex64}`,
        `sha-256 checksum: ${validHex64}`,
        `checksum: ${validHex64}`,
        `SHA_256: ${validHex64}`,
        `SHA-256 = ${validHex64}`,
        `sha256: \`${validHex64}\``,
      ];

      for (const text of syntaxes) {
        expect(extractSha256Checksum(text)).toBe(validHex64.toLowerCase());
      }
    });

    it('T5-SHA-02: Strictly rejects 63-character hex (1 char too short)', () => {
      const short63 = validHex64.substring(0, 63);
      expect(extractSha256Checksum(`SHA-256: ${short63}`)).toBeNull();
      expect(extractSha256Checksum(short63)).toBeNull();
    });

    it('T5-SHA-03: Strictly rejects 65-character hex (1 char too long)', () => {
      const long65 = validHex64 + 'a';
      expect(extractSha256Checksum(`SHA-256: ${long65}`)).toBeNull();
      expect(extractSha256Checksum(long65)).toBeNull();
    });

    it('T5-SHA-04: Rejects 64-char strings containing invalid hex characters', () => {
      // Replace last char with 'z', 'g', 'h'
      const invalidZ = validHex64.substring(0, 63) + 'z';
      const invalidG = validHex64.substring(0, 63) + 'g';
      expect(extractSha256Checksum(`SHA-256: ${invalidZ}`)).toBeNull();
      expect(extractSha256Checksum(`SHA-256: ${invalidG}`)).toBeNull();
    });

    it('T5-SHA-05: Rejects fake or placeholder checksum strings', () => {
      expect(extractSha256Checksum('SHA-256: Pending')).toBeNull();
      expect(extractSha256Checksum('SHA-256: TBD')).toBeNull();
      expect(extractSha256Checksum('SHA-256: Verified')).toBeNull();
      expect(extractSha256Checksum('SHA-256: none')).toBeNull();
      expect(extractSha256Checksum('checksum: Not available')).toBeNull();
    });

    it('T5-SHA-06: Truthful null on empty, whitespace, or null body', () => {
      expect(extractSha256Checksum(null)).toBeNull();
      expect(extractSha256Checksum('')).toBeNull();
      expect(extractSha256Checksum('    ')).toBeNull();
    });

    it('T5-SHA-07: Does not extract 40-char SHA-1 or 32-char MD5 hashes', () => {
      const sha1 = '356a192b7913b04c54574d18c28d46e6395428ab';
      const md5 = 'c4ca4238a0b923820dcc509a6f75849b';
      expect(extractSha256Checksum(`SHA-1: ${sha1}`)).toBeNull();
      expect(extractSha256Checksum(`MD5: ${md5}`)).toBeNull();
      expect(extractSha256Checksum(`checksum: ${sha1}`)).toBeNull();
    });

    it('T5-SHA-08: Dummy 64-zero placeholder is extracted as valid hex by regex', () => {
      const dummy64 = '0'.repeat(64);
      expect(extractSha256Checksum(`SHA-256: ${dummy64}`)).toBe(dummy64);
    });

    it('T5-SHA-09: Multi-hash release notes: prioritizes universal APK hash over unrelated builds', () => {
      const arm64Hash = '1111111111111111111111111111111111111111111111111111111111111111';
      const universalHash = '2222222222222222222222222222222222222222222222222222222222222222';
      const body = `
Release notes:
- arm64: ${arm64Hash}
- universal: ${universalHash}
      `;
      // Prioritizes universal build checksum over ARM64
      expect(extractSha256Checksum(body)).toBe(universalHash);
    });

    it('T5-SHA-10: 64-character token in URL query parameter is rejected by Pattern 2', () => {
      const token64 = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const body = `Download from: https://cdn.example.com/asset.apk?auth_token=${token64}`;
      // Pattern 2 rejects URL tokens and returns truthful null
      expect(extractSha256Checksum(body)).toBeNull();
    });
  });

  // =========================================================================
  // DOMAIN 4: Sanitizer, XSS Defense & Markdown Safety
  // =========================================================================
  describe('Domain 4: Sanitizer, Advanced XSS Vectors & Link Hardening', () => {
    it('T5-XSS-01: HTML5 tokenization tricks with solidus delimiter stripped', () => {
      const attack1 = '<svg/onload=alert(1)>';
      const attack2 = '<b/onmouseover=alert(1)>Hover</b>';
      const attack3 = '<img/src="x"/onerror=alert(1)>';

      const s1 = sanitizeHtml(attack1);
      const s2 = sanitizeHtml(attack2);
      const s3 = sanitizeHtml(attack3);

      expect(s1).not.toContain('onload');
      expect(s1).not.toContain('<svg');
      expect(s2).not.toContain('onmouseover');
      expect(s3).not.toContain('onerror');
    });

    it('T5-XSS-02: Protocol obfuscation in href neutralized', () => {
      const attacks = [
        '<a href="java&#x09;script:alert(1)">Tab</a>',
        '<a href="java&#x0a;script:alert(1)">Newline</a>',
        '<a href="java&#x0d;script:alert(1)">CR</a>',
        '<a href="java\0script:alert(1)">Null byte</a>',
        '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)">Dec entities</a>',
        '<a href="&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1)">Hex entities</a>',
        '<a href="%6a%61%76%61%73%63%72%69%70%74:alert(1)">Percent encoded</a>',
      ];

      for (const atk of attacks) {
        const sanitized = sanitizeHtml(atk);
        expect(sanitized).not.toContain('href="javascript');
        expect(sanitized).not.toContain('alert(1)');
      }
    });

    it('T5-XSS-03: Data and vbscript URI schemes neutralized', () => {
      const attacks = [
        '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Data URI</a>',
        '<a href="vbscript:msgbox(1)">VBScript</a>',
        '<a href="blob:https://example.com/uuid">Blob URI</a>',
      ];

      for (const atk of attacks) {
        const sanitized = sanitizeHtml(atk);
        expect(sanitized).not.toContain('href="data:');
        expect(sanitized).not.toContain('href="vbscript:');
        expect(sanitized).not.toContain('href="blob:');
      }
    });

    it('T5-XSS-04: SVG and MathML payloads completely dropped', () => {
      const attacks = [
        '<svg><circle cx="50" cy="50" r="40" onload="alert(1)" /></svg>',
        '<math><mtext><table><mglyph><style><!--</style><img src=1 onerror=alert(1)>',
        '<svg><animate onbegin=alert(1) attributeName=x dur=1s>',
      ];

      for (const atk of attacks) {
        const sanitized = sanitizeHtml(atk);
        expect(sanitized).not.toContain('<svg');
        expect(sanitized).not.toContain('<math');
        expect(sanitized).not.toContain('onload');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('onbegin');
      }
    });

    it('T5-XSS-05: Target="_blank" and rel="noopener noreferrer" enforced on all anchors', () => {
      const input = '<a href="https://github.com/LogarTraders">Repository</a>';
      const sanitized = sanitizeHtml(input);
      expect(sanitized).toContain('target="_blank"');
      expect(sanitized).toContain('rel="noopener noreferrer"');
    });

    it('T5-XSS-06: Markdown links with javascript: URIs neutralized', () => {
      const md = '[Click me](javascript:alert(document.cookie))';
      const html = sanitizeReleaseNotes(md);
      expect(html).not.toContain('href="javascript:');
      expect(html).not.toContain('alert');
      expect(html).toContain('href="#"');
    });

    it('T5-XSS-07: Nested tags designed to bypass single-pass regex stripped cleanly', () => {
      const nested = '<scr<script>ipt>alert(1)</scr</script>ipt>';
      const sanitized = sanitizeHtml(nested);
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('alert(1)');
    });
  });

  // =========================================================================
  // DOMAIN 5: Cache Resilience, Quota Exhaustion & Storage Stress
  // =========================================================================
  describe('Domain 5: Cache Resilience & Storage Stress', () => {
    it('T5-CSH-01: TTL boundary: fresh at TTL - 1ms, expired at TTL + 0ms', () => {
      const now = 2000000000;
      const ttl = 300000; // 5 min
      const entry = {
        data: 'cache-data',
        timestamp: now,
        etag: 'etag-1',
      };

      const dateSpy = vi.spyOn(Date, 'now');

      // T + 299999ms -> Fresh
      dateSpy.mockReturnValue(now + ttl - 1);
      expect(cacheService.isFresh(entry, ttl)).toBe(true);

      // T + 300000ms -> Expired (strictly Date.now() - timestamp < ttl)
      dateSpy.mockReturnValue(now + ttl);
      expect(cacheService.isFresh(entry, ttl)).toBe(false);

      // T + 300001ms -> Expired
      dateSpy.mockReturnValue(now + ttl + 1);
      expect(cacheService.isFresh(entry, ttl)).toBe(false);
    });

    it('T5-CSH-02: Private mode simulation (accessing sessionStorage throws SecurityError)', () => {
      const origWindow = global.window;
      // Define window where sessionStorage getter throws SecurityError (Safari/Chrome Private Mode)
      // @ts-expect-error mock
      global.window = {
        get sessionStorage(): Storage {
          throw new DOMException('Access is denied for this document', 'SecurityError');
        },
      };

      try {
        const privateCache = new CacheService();
        expect(privateCache.isStorageAvailable()).toBe(false);

        // Operating in private mode must not throw and must use memory fallback
        expect(() => {
          privateCache.set('private_key', { secret: true }, 'etag-p');
        }).not.toThrow();

        const retrieved = privateCache.get<{ secret: boolean }>('private_key');
        expect(retrieved).not.toBeNull();
        expect(retrieved?.data.secret).toBe(true);
      } finally {
        global.window = origWindow;
      }
    });

    it('T5-CSH-03: Corrupt cache entries with invalid schema return null', () => {
      const origWindow = global.window;
      const fakeStorage: Record<string, string> = {
        'apk_dl_cache_no_timestamp': JSON.stringify({ data: 'hello' }),
        'apk_dl_cache_no_data': JSON.stringify({ timestamp: Date.now() }),
        'apk_dl_cache_primitive': '12345',
        'apk_dl_cache_null_str': 'null',
      };

      // @ts-expect-error mock
      global.window = {
        sessionStorage: {
          getItem: (k: string) => fakeStorage[k] || null,
          setItem: () => {},
          removeItem: () => {},
          clear: () => {},
          key: () => null,
          length: 0,
        },
      };

      try {
        const testCache = new CacheService();
        expect(testCache.get('no_timestamp')).toBeNull();
        expect(testCache.get('no_data')).toBeNull();
        expect(testCache.get('primitive')).toBeNull();
        expect(testCache.get('null_str')).toBeNull();
      } finally {
        global.window = origWindow;
      }
    });

    it('T5-CSH-04: Runtime storage quota failure seamlessly retrieves item from memoryMap in get()', () => {
      let quotaExhausted = false;
      const storage: Record<string, string> = {};
      const fakeStorage = {
        getItem: (k: string) => storage[k] || null,
        setItem: (k: string, v: string) => {
          if (quotaExhausted) {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
          }
          storage[k] = v;
        },
        removeItem: (k: string) => delete storage[k],
        clear: () => {
          for (const k in storage) delete storage[k];
        },
        key: () => null,
        length: 0,
      };

      const origWindow = global.window;
      // @ts-expect-error mock
      global.window = { sessionStorage: fakeStorage };

      try {
        const quotaCache = new CacheService();
        expect(quotaCache.isStorageAvailable()).toBe(true);

        // Simulate quota becoming exhausted at runtime
        quotaExhausted = true;

        // set() catches the QuotaExceededError and writes entry to this.memoryMap
        expect(() => {
          quotaCache.set('quota_item', { payload: 'saved_in_mem' }, 'etag-mem');
        }).not.toThrow();

        // Remediated behavior: get() falls back to memoryMap when sessionStorage.getItem returns null
        const result = quotaCache.get<{ payload: string }>('quota_item');
        expect(result).not.toBeNull();
        expect(result?.data.payload).toBe('saved_in_mem');
        expect(result?.etag).toBe('etag-mem');
      } finally {
        global.window = origWindow;
      }
    });

    it('T5-CSH-05: Clock skew backward (local clock set 1 hour in the past)', () => {
      const now = 2000000000;
      const ttl = 300000;
      const entry = {
        data: 'clock-skew-test',
        timestamp: now,
        etag: null,
      };

      const dateSpy = vi.spyOn(Date, 'now');
      // Clock jumped 1 hour backward into past (Date.now() < timestamp)
      dateSpy.mockReturnValue(now - 3600000);
      // Date.now() - timestamp is negative (-3600000), which is < 300000, so evaluates to true
      expect(cacheService.isFresh(entry, ttl)).toBe(true);
    });

    it('T5-CSH-06: Clock skew forward (local clock set 1 hour into future)', () => {
      const now = 2000000000;
      const ttl = 300000;
      const entry = {
        data: 'clock-skew-test',
        timestamp: now,
        etag: null,
      };

      const dateSpy = vi.spyOn(Date, 'now');
      // Clock jumped 1 hour forward into future
      dateSpy.mockReturnValue(now + 3600000);
      expect(cacheService.isFresh(entry, ttl)).toBe(false);
    });
  });
});
