/**
 * Milestone 2 Empirical Adversarial Challenger Test Suite
 * Authors: Challenger 1 (critic, specialist)
 * Scope: useGitHubRelease, resolveReleaseState, UI components, adversarial inputs, anchor links
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveReleaseState } from '../hooks/useGitHubRelease';
import {
  FetchLatestResult,
  FetchHistoryResult,
  fetchLatestRelease,
  resetInFlightPromises,
} from '../services/githubService';
import { cacheService } from '../services/cacheService';
import { extractSha256Checksum, sanitizeReleaseNotes } from '../services/sanitizer';
import { ReleaseInfo } from '../types/website';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { AppInfoCard } from '../components/AppInfoCard';
import { Features } from '../components/Features';
import { InstallationGuide } from '../components/InstallationGuide';
import { Troubleshooting } from '../components/Troubleshooting';
import { VersionHistory } from '../components/VersionHistory';
import { Footer } from '../components/Footer';
import { WebsiteApp } from '../WebsiteApp';
import { getAppConfig } from '../config/appConfig';

const validBaseRelease: ReleaseInfo = {
  id: 201,
  versionTag: 'v2.0.0',
  title: 'Nextco Distribution v2.0.0',
  releaseDate: '2026-11-12T10:00:00Z',
  formattedDate: 'November 12, 2026',
  releaseNotesRaw: 'sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  sanitizedNotesHtml: '<p>sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</p>',
  githubReleaseUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v2.0.0',
  isPrerelease: false,
  apkAsset: {
    id: 901,
    filename: 'cold-drink-agency-v2.0.0.apk',
    sizeBytes: 24500000,
    formattedSize: '23.4 MB',
    downloadUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v2.0.0/cold-drink-agency-v2.0.0.apk',
    downloadCount: 250,
    updatedAt: '2026-11-12T10:05:00Z',
  },
  sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  compatibility: {
    minAndroidVersion: 'Android 8.0 (Oreo)+',
    targetSdkVersion: 'API 34',
    packageName: 'com.logartraders.colddrinkdistribution',
  },
};

describe('M2 Empirical Adversarial Challenger Suite', () => {
  beforeEach(() => {
    cacheService.clear();
    resetInFlightPromises();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SECTION 1: useGitHubRelease and resolveReleaseState Stress Testing
  // =========================================================================
  describe('1. resolveReleaseState & Hook Stress Tests', () => {
    it('CHAL-STATE-01: Normal valid release with APK resolves to success', () => {
      const latest: FetchLatestResult = { release: validBaseRelease };
      const history: FetchHistoryResult = { releases: [validBaseRelease] };

      const state = resolveReleaseState(latest, history);

      expect(state.status).toBe('success');
      expect(state.latestRelease).toBe(validBaseRelease);
      expect(state.latestRelease?.apkAsset?.filename).toBe('cold-drink-agency-v2.0.0.apk');
      expect(state.error).toBeNull();
      expect(state.emptyReason).toBeUndefined();
    });

    it('CHAL-STATE-02: Release with 0 assets resolves to empty state with NO_APK reason', () => {
      const releaseWithNoAssets: ReleaseInfo = {
        ...validBaseRelease,
        apkAsset: null,
      };
      const latest: FetchLatestResult = {
        release: releaseWithNoAssets,
        emptyReason: 'NO_APK',
      };
      const history: FetchHistoryResult = { releases: [] };

      const state = resolveReleaseState(latest, history);

      expect(state.status).toBe('empty');
      expect(state.emptyReason).toBe('NO_APK');
      expect(state.latestRelease).toBe(releaseWithNoAssets);
      expect(state.latestRelease?.apkAsset).toBeNull();
      expect(state.error).toBeNull();
    });

    it('CHAL-STATE-03: Release with only .zip/.tar.gz archives resolves to empty state with NO_APK reason', () => {
      const releaseWithOnlyArchives: ReleaseInfo = {
        ...validBaseRelease,
        apkAsset: null, // Filtered out by asset detection
      };
      const latest: FetchLatestResult = {
        release: releaseWithOnlyArchives,
        emptyReason: 'NO_APK',
      };
      const history: FetchHistoryResult = { releases: [] };

      const state = resolveReleaseState(latest, history);

      expect(state.status).toBe('empty');
      expect(state.emptyReason).toBe('NO_APK');
      expect(state.latestRelease?.apkAsset).toBeNull();
    });

    it('CHAL-STATE-04A: 403 Rate limited state with reset epoch in the PAST preserves cached release', () => {
      const pastResetTs = Math.floor(Date.now() / 1000) - 300; // 5 minutes ago
      const latest: FetchLatestResult = {
        release: null,
        rateLimitInfo: {
          limit: 60,
          remaining: 0,
          resetTimestamp: pastResetTs,
          minutesUntilReset: 1,
        },
        error: {
          code: 'RATE_LIMITED',
          message: 'GitHub API rate limit exceeded.',
        },
      };
      const history: FetchHistoryResult = { releases: [] };

      const state = resolveReleaseState(latest, history, validBaseRelease);

      expect(state.status).toBe('error');
      expect(state.error?.code).toBe('RATE_LIMITED');
      expect(state.error?.resetTimestamp).toBe(pastResetTs);
      // Non-tearing: cached release is preserved
      expect(state.latestRelease).toBe(validBaseRelease);
    });

    it('CHAL-STATE-04B: 403 Rate limited state with IMMEDIATE reset epoch', () => {
      const immediateResetTs = Math.floor(Date.now() / 1000);
      const latest: FetchLatestResult = {
        release: null,
        rateLimitInfo: {
          limit: 60,
          remaining: 0,
          resetTimestamp: immediateResetTs,
          minutesUntilReset: 1,
        },
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded.',
        },
      };
      const history: FetchHistoryResult = { releases: [] };

      const state = resolveReleaseState(latest, history, null);

      expect(state.status).toBe('error');
      expect(state.error?.code).toBe('RATE_LIMITED');
      expect(state.error?.resetTimestamp).toBe(immediateResetTs);
      expect(state.latestRelease).toBeNull();
    });

    it('CHAL-STATE-04C: 403 Rate limited state with 1-HOUR OUT reset epoch calculates fallback URL', () => {
      const futureResetTs = Math.floor(Date.now() / 1000) + 3600;
      const latest: FetchLatestResult = {
        release: null,
        rateLimitInfo: {
          limit: 60,
          remaining: 0,
          resetTimestamp: futureResetTs,
          minutesUntilReset: 60,
        },
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded.',
        },
      };
      const history: FetchHistoryResult = { releases: [] };

      const state = resolveReleaseState(latest, history, null, 'TestOwner', 'TestRepo');

      expect(state.status).toBe('error');
      expect(state.error?.code).toBe('RATE_LIMITED');
      expect(state.error?.minutesUntilReset).toBe(60);
      expect(state.error?.fallbackUrl).toBe('https://github.com/TestOwner/TestRepo/releases');
    });

    it('CHAL-STATE-05: 404 Repo not found resolves to empty state with REPO_404 reason', () => {
      const latest: FetchLatestResult = {
        release: null,
        error: {
          code: 'NOT_FOUND',
          message: 'Repository not found.',
        },
      };
      const history: FetchHistoryResult = { releases: [] };

      const state = resolveReleaseState(latest, history, null, 'TestOwner', 'TestRepo');

      expect(state.status).toBe('empty');
      expect(state.emptyReason).toBe('REPO_404');
      expect(state.latestRelease).toBeNull();
      expect(state.error?.fallbackUrl).toBe('https://github.com/TestOwner/TestRepo');
    });

    it('CHAL-STATE-06: Network exception / timeout preserves cached release and sets error status', () => {
      const latest: FetchLatestResult = {
        release: null,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Failed to fetch: timeout after 8000ms',
        },
      };
      const history: FetchHistoryResult = { releases: [] };

      const state = resolveReleaseState(latest, history, validBaseRelease);

      expect(state.status).toBe('error');
      expect(state.error?.code).toBe('NETWORK_ERROR');
      expect(state.error?.message).toContain('timeout after 8000ms');
      expect(state.latestRelease).toBe(validBaseRelease);
    });

    it('CHAL-STATE-07: Concurrent rapid refetch calls deduplicate in-flight promises without collision', async () => {
      // Mock global fetch to simulate a 30ms latency API response
      const mockFetch = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '55',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1800),
          }),
          json: async () => ({
            id: 888,
            tag_name: 'v2.1.0',
            name: 'Release v2.1.0',
            body: 'Release notes',
            draft: false,
            prerelease: false,
            created_at: '2026-11-12T10:00:00Z',
            published_at: '2026-11-12T10:00:00Z',
            html_url: 'https://github.com/test/test/releases/tag/v2.1.0',
            assets: [
              {
                id: 111,
                name: 'app.apk',
                content_type: 'application/vnd.android.package-archive',
                state: 'uploaded',
                size: 20000000,
                download_count: 5,
                created_at: '2026-11-12T10:00:00Z',
                updated_at: '2026-11-12T10:00:00Z',
                browser_download_url: 'https://github.com/test/test/releases/download/v2.1.0/app.apk',
              },
            ],
          }),
        };
      });

      vi.stubGlobal('fetch', mockFetch);

      const config = getAppConfig();
      // Launch 50 concurrent fetch requests simultaneously
      const promises = Array.from({ length: 50 }, () =>
        fetchLatestRelease(config, true)
      );

      const results = await Promise.all(promises);

      // Verify that all 50 calls resolved to identical valid results
      expect(results.length).toBe(50);
      results.forEach((res) => {
        expect(res.release?.versionTag).toBe('v2.1.0');
        expect(res.release?.apkAsset?.filename).toBe('app.apk');
      });

      // Verify in-flight deduplication: exactly 1 underlying network fetch occurred
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // SECTION 2: UI Component Rendering Under Adversarial Inputs
  // =========================================================================
  describe('2. UI Component Rendering Under Adversarial Inputs', () => {
    it('CHAL-UI-01: Extremely long release notes (> 100KB) render safely without stack overflow', () => {
      // Build a 120KB markdown string
      const chunk = '### Section Update\n- Verified distribution performance improvements.\n- Fixed edge case in SQLite sync.\n`code_block_sample_hash_check_operation();`\n\n';
      const repeated = chunk.repeat(800); // > 100,000 bytes
      expect(repeated.length).toBeGreaterThan(100000);

      const sanitized = sanitizeReleaseNotes(repeated);
      expect(sanitized.length).toBeGreaterThan(100000);

      const heavyRelease: ReleaseInfo = {
        ...validBaseRelease,
        releaseNotesRaw: repeated,
        sanitizedNotesHtml: sanitized,
      };

      const start = Date.now();
      const cardHtml = renderToStaticMarkup(
        <AppInfoCard latestRelease={heavyRelease} status="success" />
      );
      const historyHtml = renderToStaticMarkup(
        <VersionHistory releases={[heavyRelease]} status="success" />
      );
      const duration = Date.now() - start;

      expect(cardHtml).toContain('Verified distribution performance improvements.');
      expect(historyHtml).toContain('Section Update');
      expect(duration).toBeLessThan(1500); // Sub-second render even on Windows Node
    });

    it('CHAL-UI-02: Unicode, Emoji, and RTL characters in release notes render cleanly', () => {
      const multilingualNotes = `
# 🚀 تحديث جديد للنظام - Official Cold Drink Release
مرحبا بكم في التحديث الجديد لتوزيع المشروبات الباردة.
- ⚡ Fast delivery enabled: کولڈ ڈرنک ایجنسی نیا ورژن
- ❄️ Ice temperature telemetry added: קירור משקאות קלים
- 🥤 Accents: 日本語サポート & 汉字测试
- BiDi Override Test: \u202Ereversed text\u202C normal
- Emoji barrage: 🎉🔥🧊🍎🍇🥭📦🚛💨
      `;

      const sanitized = sanitizeReleaseNotes(multilingualNotes);

      const rtlRelease: ReleaseInfo = {
        ...validBaseRelease,
        releaseNotesRaw: multilingualNotes,
        sanitizedNotesHtml: sanitized,
      };

      const cardHtml = renderToStaticMarkup(
        <AppInfoCard latestRelease={rtlRelease} status="success" />
      );
      const historyHtml = renderToStaticMarkup(
        <VersionHistory releases={[rtlRelease]} status="success" />
      );

      // Verify RTL and multilingual characters are preserved safely
      expect(cardHtml).toContain('تحديث جديد للنظام');
      expect(cardHtml).toContain('کولڈ ڈرنک ایجنسی');
      expect(cardHtml).toContain('קירור');
      expect(cardHtml).toContain('日本語サポート');
      expect(cardHtml).toContain('🥤');
      expect(historyHtml).toContain('تحديث جديد للنظام');
    });

    it('CHAL-UI-03: Missing fields across all properties (all nulls) render gracefully with "Not provided"', () => {
      const completelyNullRelease: ReleaseInfo = {
        id: 0,
        versionTag: '',
        title: '',
        releaseDate: '',
        formattedDate: '',
        releaseNotesRaw: '',
        sanitizedNotesHtml: '',
        githubReleaseUrl: '',
        isPrerelease: false,
        apkAsset: null,
        sha256Checksum: null,
        compatibility: {
          minAndroidVersion: null,
          targetSdkVersion: null,
          packageName: null,
        },
      };

      // Header with null release
      const headerHtml = renderToStaticMarkup(
        <Header latestRelease={completelyNullRelease} status="empty" />
      );
      expect(headerHtml).toContain('Agency Logo');

      // Hero with null release
      const heroHtml = renderToStaticMarkup(
        <Hero latestRelease={completelyNullRelease} status="empty" />
      );
      expect(heroHtml).toContain('Your Cold Drink Agency App – Download Now');
      expect(heroHtml).toContain('Download Unavailable');

      // AppInfoCard with null release
      const cardHtml = renderToStaticMarkup(
        <AppInfoCard latestRelease={completelyNullRelease} status="empty" />
      );
      // Should show truthful "Not provided" fallbacks across fields
      expect(cardHtml).toContain('Not provided');
      expect(cardHtml).not.toContain('Copy Checksum'); // Button omitted when hash is null

      // VersionHistory with null release
      const historyHtml = renderToStaticMarkup(
        <VersionHistory releases={[completelyNullRelease]} status="empty" />
      );
      expect(historyHtml).toContain('Version History &amp; Past Releases');

      // Full WebsiteApp with null release
      const fullAppHtml = renderToStaticMarkup(<WebsiteApp />);
      expect(fullAppHtml).toContain('Your Cold Drink Agency App – Download Now');
      expect(fullAppHtml).toContain('Official Distribution Highlights');
    });

    it('CHAL-UI-04: Checksum rendering: valid 64-hex SHA-256 vs null vs invalid lengths', () => {
      const validSha = '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069';

      // 1. Valid 64-hex SHA-256
      const validShaRelease: ReleaseInfo = {
        ...validBaseRelease,
        sha256Checksum: validSha,
      };
      const validCardHtml = renderToStaticMarkup(
        <AppInfoCard latestRelease={validShaRelease} status="success" />
      );
      expect(validCardHtml).toContain(validSha);
      expect(validCardHtml).toContain('SHA-256 Verified');
      expect(validCardHtml).toContain('Copy Checksum');

      // 2. Null SHA-256
      const nullShaRelease: ReleaseInfo = {
        ...validBaseRelease,
        sha256Checksum: null,
      };
      const nullCardHtml = renderToStaticMarkup(
        <AppInfoCard latestRelease={nullShaRelease} status="success" />
      );
      expect(nullCardHtml).toContain('Not provided');
      expect(nullCardHtml).not.toContain('Copy Checksum');
      expect(nullCardHtml).not.toContain('SHA-256 Verified');

      // 3. Invalid lengths rejected by extractSha256Checksum
      expect(extractSha256Checksum('MD5: d41d8cd98f00b204e9800998ecf8427e')).toBeNull(); // 32 hex
      expect(extractSha256Checksum('SHA-1: da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBeNull(); // 40 hex
      expect(extractSha256Checksum('Short: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d906')).toBeNull(); // 63 hex
      expect(extractSha256Checksum('Long: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069a')).toBeNull(); // 65 hex
      expect(extractSha256Checksum('Non-hex: zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBeNull();

      // 4. If invalid string is forced into sha256Checksum field, AppInfoCard displays it safely without crashing
      const malformedShaRelease: ReleaseInfo = {
        ...validBaseRelease,
        sha256Checksum: 'INVALID_HEX_STRING_FOR_ADVERSARIAL_TEST',
      };
      const malformedCardHtml = renderToStaticMarkup(
        <AppInfoCard latestRelease={malformedShaRelease} status="success" />
      );
      expect(malformedCardHtml).toContain('INVALID_HEX_STRING_FOR_ADVERSARIAL_TEST');
      expect(malformedCardHtml).toContain('Copy Checksum');
    });

    it('CHAL-UI-05: Page anchor links: all 10 mandated section IDs exist in page markup', () => {
      const fullPageHtml = renderToStaticMarkup(<WebsiteApp />);

      const mandatedAnchors = [
        'id="home"',
        'id="hero"',
        'id="features"',
        'id="download"',
        'id="installation"',
        'id="troubleshooting"',
        'id="versions"',
        'id="history"',
        'id="contact"',
        'id="footer"',
      ];

      for (const anchor of mandatedAnchors) {
        expect(fullPageHtml).toContain(anchor);
      }
    });

    it('CHAL-UI-06: Individual section components render their dedicated IDs and semantic roles', () => {
      const featuresHtml = renderToStaticMarkup(<Features />);
      expect(featuresHtml).toContain('id="features"');
      expect(featuresHtml).toContain('id="features-heading"');

      const guideHtml = renderToStaticMarkup(<InstallationGuide />);
      expect(guideHtml).toContain('id="installation"');
      expect(guideHtml).toContain('id="guide-heading"');

      const troubleHtml = renderToStaticMarkup(<Troubleshooting />);
      expect(troubleHtml).toContain('id="troubleshooting"');
      expect(troubleHtml).toContain('id="trouble-heading"');

      const footerHtml = renderToStaticMarkup(<Footer />);
      expect(footerHtml).toContain('id="footer"');
      expect(footerHtml).toContain('role="contentinfo"');
      expect(footerHtml).toContain('id="contact"');
    });
  });
});
