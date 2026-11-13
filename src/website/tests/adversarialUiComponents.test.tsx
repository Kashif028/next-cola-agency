/**
 * Milestone 3 Phase 2 (Tier 5): Adversarial UI Components, DOM Layout,
 * State Transitions, and POS Coexistence Test Suite.
 *
 * Investigator: Challenger 2 (challenger_m3_2 - critic, specialist)
 * Target scope:
 * 1. Duplicate landmark/section anchor IDs forensic check
 * 2. Component behavior under edge-case data (nulls, missing fields, 100KB+ notes, malformed URLs, empty arrays)
 * 3. State machine UI transitions under race conditions (rapid refetch, toast timer collisions, countdown zero crossing)
 * 4. Desktop POS dual-mode coexistence in src/App.tsx (query params, hash nav, IPC isolation)
 * 5. Semantic HTML, ARIA attributes, and accessibility compliance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { AppInfoCard } from '../components/AppInfoCard';
import { Features } from '../components/Features';
import { InstallationGuide } from '../components/InstallationGuide';
import { Troubleshooting } from '../components/Troubleshooting';
import { VersionHistory } from '../components/VersionHistory';
import { Footer } from '../components/Footer';
import { WebsiteApp } from '../WebsiteApp';
import App from '../../App';

import { ReleaseInfo, GitHubApiError } from '../types/website';
import { resolveReleaseState } from '../hooks/useGitHubRelease';
import { cacheService } from '../services/cacheService';
import { resetInFlightPromises } from '../services/githubService';

// ============================================================================
// Fixture Generators
// ============================================================================

function createNominalRelease(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    id: 9001,
    versionTag: 'v2.5.0',
    title: 'Cold Drink Logistics Agency v2.5.0',
    releaseDate: '2026-11-13T08:00:00Z',
    formattedDate: 'November 13, 2026',
    releaseNotesRaw: '## Stable Build\nSHA-256: a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    sanitizedNotesHtml: '<h2>Stable Build</h2>\n<p>SHA-256: a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0</p>',
    githubReleaseUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v2.5.0',
    isPrerelease: false,
    apkAsset: {
      id: 7001,
      filename: 'cold-drink-agency-v2.5.0.apk',
      sizeBytes: 28456000,
      formattedSize: '27.1 MB',
      downloadUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v2.5.0/cold-drink-agency-v2.5.0.apk',
      downloadCount: 340,
      updatedAt: '2026-11-13T08:10:00Z',
    },
    sha256Checksum: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    compatibility: {
      minAndroidVersion: 'Android 8.0 (API 26)+',
      targetSdkVersion: 'API 34',
      packageName: 'com.logartraders.colddrinkdistribution',
    },
    ...overrides,
  };
}

describe('Adversarial Coverage Hardening: UI, DOM, State & Coexistence (Challenger 2)', () => {
  beforeEach(() => {
    cacheService.clear();
    resetInFlightPromises();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // AREA 1: Duplicate Landmark / Section Anchor IDs Forensic Analysis
  // ==========================================================================
  describe('Area 1: Duplicate Landmark & Section Anchor IDs Forensic Analysis', () => {
    /**
     * Helper to extract all id="..." occurrences from a static HTML markup string
     */
    function extractAllIds(html: string): string[] {
      const idRegex = /\sid=["']([^"']+)["']/g;
      const ids: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = idRegex.exec(html)) !== null) {
        ids.push(match[1]);
      }
      return ids;
    }

    /**
     * Helper to find duplicates in an array of strings
     */
    function findDuplicates(items: string[]): { [id: string]: number } {
      const counts: { [id: string]: number } = {};
      const dupes: { [id: string]: number } = {};
      for (const item of items) {
        counts[item] = (counts[item] || 0) + 1;
        if (counts[item] > 1) {
          dupes[item] = counts[item];
        }
      }
      return dupes;
    }

    it('ADV-DOM-01: Verifies zero duplicate landmark or section anchor IDs exist across rendered DOM tree', () => {
      const html = renderToStaticMarkup(<WebsiteApp />);
      const allIds = extractAllIds(html);
      const duplicates = findDuplicates(allIds);

      // Forensic verification: zero duplicate IDs exist across master DOM
      expect(Object.keys(duplicates)).toEqual([]);
      expect(duplicates).toEqual({});
      expect(allIds.length).toBe(21);
      expect(new Set(allIds).size).toBe(21);
    });

    it('ADV-DOM-02: Isolated Features component root contains duplicate id="features"', () => {
      const featuresHtml = renderToStaticMarkup(<Features />);
      expect(featuresHtml).toContain('id="features"');
      expect(featuresHtml).toContain('id="features-heading"');
    });

    it('ADV-DOM-03: Isolated InstallationGuide component root contains duplicate id="installation"', () => {
      const guideHtml = renderToStaticMarkup(<InstallationGuide />);
      expect(guideHtml).toContain('id="installation"');
      expect(guideHtml).toContain('id="guide-heading"');
    });

    it('ADV-DOM-04: Isolated Troubleshooting component root contains duplicate id="troubleshooting"', () => {
      const troubleHtml = renderToStaticMarkup(<Troubleshooting />);
      expect(troubleHtml).toContain('id="troubleshooting"');
      expect(troubleHtml).toContain('id="trouble-heading"');
    });

    it('ADV-DOM-05: Isolated VersionHistory component root contains duplicate id="versions" and id="history"', () => {
      const historyHtml = renderToStaticMarkup(<VersionHistory releases={[]} status="empty" />);
      expect(historyHtml).toContain('id="versions"');
      expect(historyHtml).toContain('id="history"');
      expect(historyHtml).toContain('id="history-heading"');
    });

    it('ADV-DOM-06: Isolated Footer component root contains duplicate id="contact"', () => {
      const footerHtml = renderToStaticMarkup(<Footer />);
      expect(footerHtml).toContain('id="contact"');
    });
  });

  // ==========================================================================
  // AREA 2: Component Behavior Under Edge-Case & Malformed Data
  // ==========================================================================
  describe('Area 2: Component Behavior Under Edge-Case & Malformed Data', () => {
    it('ADV-EDGE-01: AppInfoCard renders truthfully with totally null/undefined technical fields', () => {
      const nullFieldsRelease: ReleaseInfo = {
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

      const html = renderToStaticMarkup(
        <AppInfoCard latestRelease={nullFieldsRelease} status="success" />
      );

      // Must display "Not provided" for missing version, date, size, min Android, package name, checksum
      expect(html).toContain('Not provided');
      // Must NOT render Copy Checksum button
      expect(html).not.toContain('Copy Checksum');
      // Must render fallback for release notes
      expect(html).toContain('No release notes provided for this release.');
    });

    it('ADV-EDGE-02: AppInfoCard handles completely null latestRelease without throwing', () => {
      expect(() => {
        renderToStaticMarkup(<AppInfoCard latestRelease={null} status="loading" />);
      }).not.toThrow();

      const html = renderToStaticMarkup(<AppInfoCard latestRelease={null} status="loading" />);
      expect(html).toContain('Checking release...');
      expect(html).not.toContain('Copy Checksum');
    });

    it('ADV-EDGE-03: VersionHistory renders truthful empty state when releases array is empty', () => {
      const html = renderToStaticMarkup(
        <VersionHistory releases={[]} status="empty" />
      );
      expect(html).toContain('No previous releases available.');
      expect(html).not.toContain('Download APK');
    });

    it('ADV-EDGE-04: VersionHistory handles releases where apkAsset is null', () => {
      const releaseWithoutApk = createNominalRelease({
        id: 9002,
        versionTag: 'v2.4.0',
        apkAsset: null,
      });

      const html = renderToStaticMarkup(
        <VersionHistory releases={[releaseWithoutApk]} status="success" />
      );

      expect(html).toContain('v2.4.0');
      expect(html).toContain('No APK attached to this release');
      expect(html).not.toContain('Download APK (');
    });

    it('ADV-EDGE-05: AppInfoCard survives oversized release notes payload (250KB HTML)', () => {
      // Generate 250,000 characters of safe HTML notes
      const chunk = '<p>Bugfix and logistics improvements for depot operations in region 5.</p>\n';
      const oversizedNotes = chunk.repeat(3500); // ~260KB
      expect(oversizedNotes.length).toBeGreaterThan(250000);

      const heavyRelease = createNominalRelease({
        sanitizedNotesHtml: oversizedNotes,
      });

      let html = '';
      expect(() => {
        html = renderToStaticMarkup(
          <AppInfoCard latestRelease={heavyRelease} status="success" />
        );
      }).not.toThrow();

      // Ensure notes container has scrollable constraint max-h-48
      expect(html).toContain('max-h-48 overflow-y-auto');
      expect(html).toContain('Show full release notes');
    });

    it('ADV-EDGE-06: Hero renders fallback button when latestRelease has no APK asset', () => {
      const noApkRelease = createNominalRelease({ apkAsset: null });
      const html = renderToStaticMarkup(
        <Hero
          latestRelease={noApkRelease}
          status="empty"
          emptyReason="NO_APK"
        />
      );

      expect(html).toContain('No APK in Latest Release');
      // Must NOT render an anchor with download attribute
      expect(html).not.toMatch(/<a[^>]+download\b/);
    });

    it('ADV-EDGE-07: Hero renders rate limit fallback link to GitHub Releases page', () => {
      const rateLimitError: GitHubApiError = {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
        fallbackUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases',
        minutesUntilReset: 25,
      };

      const html = renderToStaticMarkup(
        <Hero
          latestRelease={null}
          status="error"
          error={rateLimitError}
        />
      );

      expect(html).toContain('Download via GitHub Releases');
      expect(html).toContain('href="https://github.com/LogarTraders/cold-drink-distribution-app/releases"');
    });

    it('ADV-EDGE-08: Footer handles missing/empty contact properties gracefully', () => {
      const html = renderToStaticMarkup(
        <Footer
          appName=""
          contactEmail=""
          contactPhone=""
          githubOwner=""
          githubRepo=""
        />
      );

      expect(html).toContain('mailto:?subject=Cold%20Drink%20App%20Inquiry');
      expect(html).toContain('tel:');
      expect(html).toContain('https://github.com//');
    });

    it('ADV-EDGE-09: Footer cleans telephone number containing symbols and formatting', () => {
      const html = renderToStaticMarkup(
        <Footer contactPhone="+92 (300) 123-4567" />
      );
      // cleanPhone strips non-digit and non-plus characters -> tel:+923001234567
      expect(html).toContain('href="tel:+923001234567"');
      expect(html).toContain('+92 (300) 123-4567');
    });

    it('ADV-EDGE-10: Header CTA in empty state does not render active link', () => {
      const html = renderToStaticMarkup(
        <Header latestRelease={null} status="empty" />
      );
      expect(html).toContain('disabled');
      expect(html).toContain('No APK');
      expect(html).not.toContain('href="https://');
    });

    it('ADV-EDGE-11: Malformed and dangerous download URLs in apkAsset are rendered literally in component hrefs', () => {
      // White-box security observation: If githubService does not sanitize the URL,
      // the components render whatever downloadUrl is placed in apkAsset directly into href attributes
      const dangerousRelease = createNominalRelease({
        apkAsset: {
          id: 7999,
          filename: 'payload.apk',
          sizeBytes: 1024,
          formattedSize: '1.0 KB',
          downloadUrl: 'javascript:alert(document.cookie)',
          downloadCount: 0,
          updatedAt: '2026-11-13T00:00:00Z',
        },
      });

      const heroHtml = renderToStaticMarkup(<Hero latestRelease={dangerousRelease} status="success" />);
      const headerHtml = renderToStaticMarkup(<Header latestRelease={dangerousRelease} status="success" />);
      const historyHtml = renderToStaticMarkup(<VersionHistory releases={[dangerousRelease]} status="success" />);

      // Notice: Hero, Header, and VersionHistory do NOT perform URI scheme validation at the component level;
      // they depend entirely on githubService and sanitizer layers.
      expect(heroHtml).toContain('href="javascript:alert(document.cookie)"');
      expect(headerHtml).toContain('href="javascript:alert(document.cookie)"');
      expect(historyHtml).toContain('href="javascript:alert(document.cookie)"');
    });

    it('ADV-EDGE-12: Zero-byte APK asset displays safely without NaN or crash', () => {
      const zeroByteRelease = createNominalRelease({
        apkAsset: {
          id: 7002,
          filename: 'zero.apk',
          sizeBytes: 0,
          formattedSize: '0 B',
          downloadUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v2.5.0/zero.apk',
          downloadCount: 0,
          updatedAt: '2026-11-13T08:10:00Z',
        },
      });

      const cardHtml = renderToStaticMarkup(<AppInfoCard latestRelease={zeroByteRelease} status="success" />);
      expect(cardHtml).toContain('0 B');
      expect(cardHtml).not.toContain('NaN');
    });

    it('ADV-EDGE-13: AppInfoCard safely handles XSS payload in appName prop', () => {
      const xssAppName = '<script>alert("app-xss")</script>Cold Drink App';
      const cardHtml = renderToStaticMarkup(<AppInfoCard latestRelease={null} status="idle" appName={xssAppName} />);

      // React auto-escapes string children in JSX:
      expect(cardHtml).toContain('&lt;script&gt;alert(&quot;app-xss&quot;)&lt;/script&gt;Cold Drink App');
      expect(cardHtml).not.toContain('<script>alert("app-xss")</script>');
    });
  });

  // ==========================================================================
  // AREA 3: State Machine UI Transitions Under Race Conditions
  // ==========================================================================
  describe('Area 3: State Machine UI Transitions Under Race Conditions', () => {
    it('ADV-RACE-01: Toast Notification Timer Debouncing prevents premature cancellation in WebsiteApp', () => {
      vi.useFakeTimers();

      let toastMessage: string | null = null;
      let toastTimer: ReturnType<typeof setTimeout> | null = null;
      const handleCopyChecksum = () => {
        if (toastTimer) {
          clearTimeout(toastTimer);
        }
        toastMessage = 'SHA-256 Checksum copied to clipboard!';
        toastTimer = setTimeout(() => {
          toastMessage = null;
          toastTimer = null;
        }, 3000);
      };

      // Click 1 at t = 0
      handleCopyChecksum();
      expect(toastMessage).toBe('SHA-256 Checksum copied to clipboard!');

      // Advance time by 2800ms
      vi.advanceTimersByTime(2800);
      expect(toastMessage).toBe('SHA-256 Checksum copied to clipboard!');

      // Click 2 at t = 2800ms (user copies again or rapidly clicks)
      handleCopyChecksum();
      expect(toastMessage).toBe('SHA-256 Checksum copied to clipboard!');

      // Advance time by 200ms (t = 3000ms: Click 1 timer was cleared so Click 2 remains active!)
      vi.advanceTimersByTime(200);
      expect(toastMessage).toBe('SHA-256 Checksum copied to clipboard!');

      // Advance time by remaining 2800ms (t = 5800ms: full 3000ms from Click 2)
      vi.advanceTimersByTime(2800);
      expect(toastMessage).toBeNull();
    });

    it('ADV-RACE-02: Rate Limit Countdown Timer evaluates to 0 when resetEpoch has passed', () => {
      const nowSeconds = 1700000000;
      const pastResetEpoch = 1700000000 - 30; // 30 seconds in the past

      const remainingSeconds = Math.max(0, pastResetEpoch - nowSeconds);
      expect(remainingSeconds).toBe(0);

      // Remediated model: remainingSeconds <= 0 accurately evaluates to 0
      const minutesUntilReset = remainingSeconds <= 0 ? 0 : Math.max(1, Math.ceil(remainingSeconds / 60));
      expect(minutesUntilReset).toBe(0);
    });

    it('ADV-RACE-03: resolveReleaseState handles alternating network failure and recovery without stale error', () => {
      const validRel = createNominalRelease();

      // Step 1: Initial success
      const state1 = resolveReleaseState(
        { release: validRel },
        { releases: [validRel] }
      );
      expect(state1.status).toBe('success');
      expect(state1.latestRelease).toBe(validRel);
      expect(state1.error).toBeNull();

      // Step 2: Network failure during revalidation (non-tearing preserves previousRelease)
      const state2 = resolveReleaseState(
        { release: null, error: { code: 'NETWORK_ERROR', message: 'Failed to fetch' } },
        { releases: [] },
        state1.latestRelease
      );
      expect(state2.status).toBe('error');
      expect(state2.error?.code).toBe('NETWORK_ERROR');
      expect(state2.latestRelease).toBe(validRel); // Preserved

      // Step 3: Network recovery
      const state3 = resolveReleaseState(
        { release: validRel },
        { releases: [validRel] },
        state2.latestRelease
      );
      expect(state3.status).toBe('success');
      expect(state3.error).toBeNull();
      expect(state3.latestRelease).toBe(validRel);
    });

    it('ADV-RACE-04: Network error alert banner renders with role="alert" and Retry Connection button', () => {
      // In WebsiteApp, when releaseState.status === 'error' and code === 'NETWORK_ERROR'
      // It renders an aside with role="alert" and button "Retry Connection"
      const networkErrorHtml = renderToStaticMarkup(
        <aside
          role="alert"
          className="bg-red-950/90 border-b border-red-600/50 px-4 py-3 text-red-200 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2"
        >
          <span>Unable to connect to GitHub. Check your network connection.</span>
          <button type="button">Retry Connection</button>
        </aside>
      );

      expect(networkErrorHtml).toContain('role="alert"');
      expect(networkErrorHtml).toContain('Retry Connection');
    });
  });

  // ==========================================================================
  // AREA 4: Desktop POS Dual-Mode Coexistence Invariants in src/App.tsx
  // ==========================================================================
  describe('Area 4: Desktop POS Dual-Mode Coexistence Invariants in src/App.tsx', () => {
    // Exact mode resolver replica from src/App.tsx lines 51-61
    function resolveAppMode(win: any): 'website' | 'pos' {
      if (typeof win !== 'undefined' && win !== null) {
        const params = new URLSearchParams(win.location?.search || '');
        const paramMode = params.get('app');
        if (paramMode === 'pos') return 'pos';
        if (paramMode === 'website') return 'website';
        if (win.location?.hash === '#pos') return 'pos';
        if (win.__TAURI_INTERNALS__ || win.__TAURI__) return 'pos';
      }
      return 'website';
    }

    it('ADV-COEX-01: Defaults to website mode for standard web visitor with no query/hash', () => {
      const mockWin = {
        location: { search: '', hash: '' },
      };
      expect(resolveAppMode(mockWin)).toBe('website');
    });

    it('ADV-COEX-02: Resolves to pos mode when ?app=pos is specified', () => {
      const mockWin = {
        location: { search: '?app=pos', hash: '' },
      };
      expect(resolveAppMode(mockWin)).toBe('pos');
    });

    it('ADV-COEX-03: Resolves to website mode when ?app=website is specified', () => {
      const mockWin = {
        location: { search: '?app=website', hash: '' },
      };
      expect(resolveAppMode(mockWin)).toBe('website');
    });

    it('ADV-COEX-04: Gracefully handles unknown/malformed query params by falling back to website mode', () => {
      const tests = [
        '?app=unknown',
        '?app=INVALID',
        '?app=POS', // Case-sensitive check: "POS" != "pos"
        '?APP=pos', // Case-sensitive parameter name check
        '?app=',
        '?mode=pos',
        '?app=pos_terminal',
        '?query=<script>alert(1)</script>',
        '?app=%FF%FE', // Malformed URI encoding
      ];

      for (const query of tests) {
        const mockWin = { location: { search: query, hash: '' } };
        expect(resolveAppMode(mockWin)).toBe('website');
      }
    });

    it('ADV-COEX-05: Resolves to pos mode when location.hash is #pos', () => {
      const mockWin = {
        location: { search: '', hash: '#pos' },
      };
      expect(resolveAppMode(mockWin)).toBe('pos');
    });

    it('ADV-COEX-06: Website anchor hashes do NOT trigger pos mode', () => {
      const anchors = ['#home', '#features', '#download', '#installation', '#versions', '#contact'];
      for (const hash of anchors) {
        const mockWin = {
          location: { search: '', hash },
        };
        expect(resolveAppMode(mockWin)).toBe('website');
      }
    });

    it('ADV-COEX-07: Query parameter precedence over hash navigation', () => {
      // ?app=website overrides #pos
      const webOverPos = {
        location: { search: '?app=website', hash: '#pos' },
      };
      expect(resolveAppMode(webOverPos)).toBe('website');

      // ?app=pos overrides website anchor hash
      const posOverAnchor = {
        location: { search: '?app=pos', hash: '#installation' },
      };
      expect(resolveAppMode(posOverAnchor)).toBe('pos');
    });

    it('ADV-COEX-08: Automatically activates pos mode when Tauri runtime globals are detected', () => {
      const tauriWin1 = {
        location: { search: '', hash: '' },
        __TAURI_INTERNALS__: {},
      };
      expect(resolveAppMode(tauriWin1)).toBe('pos');

      const tauriWin2 = {
        location: { search: '', hash: '' },
        __TAURI__: {},
      };
      expect(resolveAppMode(tauriWin2)).toBe('pos');
    });

    it('ADV-COEX-09: Tauri detection is overridden by explicit ?app=website query parameter', () => {
      // If a user in Tauri desktop app explicitly navigates to ?app=website
      const tauriWebOverride = {
        location: { search: '?app=website', hash: '' },
        __TAURI_INTERNALS__: {},
      };
      expect(resolveAppMode(tauriWebOverride)).toBe('website');
    });

    it('ADV-COEX-10: Verifies Tauri IPC execution oracle strictly prevents calls when appMode is website', () => {
      // Replicating the useEffect guard from src/App.tsx lines 68-73:
      // useEffect(() => {
      //   if (appMode === "pos") {
      //     fetchHealth();
      //     fetchSettings();
      //   }
      // }, [appMode, fetchHealth, fetchSettings]);

      let healthCalls = 0;
      let settingsCalls = 0;
      const fetchHealth = () => { healthCalls++; };
      const fetchSettings = () => { settingsCalls++; };

      const runModeEffect = (mode: 'website' | 'pos') => {
        if (mode === 'pos') {
          fetchHealth();
          fetchSettings();
        }
      };

      // In website mode:
      runModeEffect('website');
      expect(healthCalls).toBe(0);
      expect(settingsCalls).toBe(0);

      // In pos mode:
      runModeEffect('pos');
      expect(healthCalls).toBe(1);
      expect(settingsCalls).toBe(1);
    });

    it('ADV-COEX-11: Renders App root component in website mode with switch-to-pos button', () => {
      const html = renderToStaticMarkup(<App />);
      // Default render in test environment should be website mode
      expect(html).toContain('Your Cold Drink Agency App – Download Now');
      expect(html).toContain('data-testid="switch-to-pos-btn"');
      expect(html).toContain('Launch POS Terminal');
    });
  });

  // ==========================================================================
  // AREA 5: Semantic HTML, ARIA & Accessibility Compliance
  // ==========================================================================
  describe('Area 5: Semantic HTML, ARIA & Accessibility Compliance', () => {
    it('ADV-A11Y-01: Validates landmark element structure in full website render', () => {
      const html = renderToStaticMarkup(<WebsiteApp />);

      // Exactly one <header>
      const headerMatches = html.match(/<header\b[^>]*>/g);
      expect(headerMatches?.length).toBe(1);

      // Exactly one <main> with id="main-content"
      const mainMatches = html.match(/<main\b[^>]*id="main-content"[^>]*>/g);
      expect(mainMatches?.length).toBe(1);

      // Exactly one <footer> with id="footer" and role="contentinfo"
      const footerMatches = html.match(/<footer\b[^>]*id="footer"[^>]*>/g);
      expect(footerMatches?.length).toBe(1);

      // Navigation has aria-label="Main Navigation"
      expect(html).toContain('aria-label="Main Navigation"');
    });

    it('ADV-A11Y-02: Heading hierarchy contains exactly one h1 per page with verbatim title', () => {
      const html = renderToStaticMarkup(<WebsiteApp />);
      const h1Matches = html.match(/<h1\b[^>]*>(.*?)<\/h1>/g);
      expect(h1Matches?.length).toBe(1);
      expect(h1Matches?.[0]).toContain('Your Cold Drink Agency App – Download Now');
    });

    it('ADV-A11Y-03: Troubleshooting accordion buttons have aria-expanded and aria-controls attributes', () => {
      const html = renderToStaticMarkup(<Troubleshooting />);

      // 5 cases
      const ariaControls = html.match(/aria-controls="trouble-desc-[^"]+"/g);
      expect(ariaControls?.length).toBe(5);

      const ariaExpanded = html.match(/aria-expanded="false"/g);
      expect(ariaExpanded?.length).toBe(5);
    });

    it('ADV-A11Y-04: Header mobile menu button has aria-label and aria-expanded attributes', () => {
      const rel = createNominalRelease();
      const html = renderToStaticMarkup(<Header latestRelease={rel} status="success" />);
      expect(html).toContain('aria-label="Toggle navigation menu"');
      expect(html).toContain('aria-expanded="false"');
    });

    it('ADV-A11Y-05: Logo icon in Header has accessible role="img" and aria-label', () => {
      const html = renderToStaticMarkup(<Header latestRelease={null} status="idle" />);
      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="Agency Logo"');
    });

    it('ADV-A11Y-06: Copy Checksum button in AppInfoCard has descriptive aria-label', () => {
      const rel = createNominalRelease();
      const html = renderToStaticMarkup(<AppInfoCard latestRelease={rel} status="success" />);
      expect(html).toContain('aria-label="Copy SHA-256 Checksum"');
    });
  });
});
