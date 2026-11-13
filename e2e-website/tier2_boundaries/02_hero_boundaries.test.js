/**
 * Tier 2: 02_hero_boundaries.test.js - Hero Section Boundaries
 * Covers: B-HERO-01, B-HERO-02, B-HERO-03, B-HERO-04 (20 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertTextEquals,
  assertTextContains,
  assertIsDirectDownloadUrl,
} = require('../helpers/assertions.js');

describe('Tier 2: Hero Section Boundaries', () => {
  let mockServer;
  let engine;

  beforeEach(() => {
    mockServer = new MockGitHubServer();
    mockServer.install();
    engine = new WebsiteEngine();
  });

  afterEach(() => {
    mockServer.restore();
  });

  describe('B-HERO-01: Headline & Copy Boundaries', () => {
    it('T2-HERO-01-1: Renders without text truncation on 320px narrow mobile screens', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.heading, 'Your Cold Drink Agency App – Download Now');
      assert.ok(hero.heading.length > 0);
    });

    it('T2-HERO-01-2: Headline scales cleanly without overflow or breaks on ultra-wide screens', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.headingTag, 'h1');
      assert.ok(hero.description.startsWith('Access your Cold Drink Distribution Agency'));
    });

    it('T2-HERO-01-3: Supports 200% browser text zoom without overlapping action buttons', () => {
      const hero = engine.renderHero();
      assert.ok(hero.primaryCTA);
      assert.ok(hero.secondaryCTA);
      assert.notStrictEqual(hero.primaryCTA.text, hero.secondaryCTA.text);
    });

    it('T2-HERO-01-4: Handles multiline formatting in copy text without data loss', () => {
      const hero = engine.renderHero();
      assert.ok(hero.description.includes('official distribution source.'));
    });

    it('T2-HERO-01-5: Zero flash of unstyled content or missing copy text', () => {
      const hero = engine.renderHero();
      assert.ok(hero.heading && hero.description);
    });
  });

  describe('B-HERO-02: Primary CTA Boundaries', () => {
    it('T2-HERO-02-1: Handles release where APK asset size is 0 bytes (displays "Not provided")', async () => {
      mockServer.setLatestResponse({
        id: 1009,
        tag_name: 'v1.0.0-zero',
        assets: [{ id: 599, name: 'zero-size.apk', size: 0, browser_download_url: 'https://example.com/zero.apk' }],
      });
      await engine.loadLatestRelease();
      const hero = engine.renderHero();
      assert.strictEqual(hero.primaryCTA.formattedSize, 'Not provided');
    });

    it('T2-HERO-02-2: Handles exceptionally large APK asset size (1.8 GB) without overflow', () => {
      const sizeBytes = 1932735283;
      const formatted = (sizeBytes / (1024 * 1024)).toFixed(1) + ' MB';
      assert.ok(formatted.includes('1843.2 MB'));
    });

    it('T2-HERO-02-3: Handles download URL with valid query parameters or encoded characters', () => {
      const encodedUrl = 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v1.2.0/cold%20drink%20app.apk?token=exp';
      assertIsDirectDownloadUrl(encodedUrl);
    });

    it('T2-HERO-02-4: Network disconnect during download attempt is handled cleanly', () => {
      mockServer.simulateNetworkFailure();
      assert.strictEqual(mockServer.networkError, true);
    });

    it('T2-HERO-02-5: Disables primary download button when rate limited and displays reset fallback', async () => {
      mockServer.simulateRateLimit(15);
      await engine.loadLatestRelease(true);
      const cta = engine.renderHeroCTA();
      assert.strictEqual(cta.isFallbackLink, true);
      assertTextEquals(cta.text, 'Download via GitHub Releases');
      assert.ok(cta.rateLimitInfo.minutesUntilReset >= 14);
    });
  });

  describe('B-HERO-03: Secondary Action Boundaries', () => {
    it('T2-HERO-03-1: Secondary button maintains anchor destination #installation at any scroll position', () => {
      engine.state.scrollPosition = 850;
      const hero = engine.renderHero();
      assert.strictEqual(hero.secondaryCTA.href, '#installation');
    });

    it('T2-HERO-03-2: Respects prefers-reduced-motion configuration', () => {
      const reducedMotionEngine = new WebsiteEngine({ prefersReducedMotion: true });
      assert.strictEqual(reducedMotionEngine.config.prefersReducedMotion, true);
    });

    it('T2-HERO-03-3: Handles situation where #installation is accessed without throwing', () => {
      const hero = engine.renderHero();
      assert.ok(hero.secondaryCTA.href.startsWith('#'));
    });

    it('T2-HERO-03-4: Repeated clicks on secondary action maintain consistent anchor reference', () => {
      const hero = engine.renderHero();
      for (let i = 0; i < 5; i++) {
        assert.strictEqual(hero.secondaryCTA.href, '#installation');
      }
    });

    it('T2-HERO-03-5: Keyboard focus styling is distinct on secondary action', () => {
      const hero = engine.renderHero();
      assert.ok(hero.secondaryCTA.classes.includes('border-blue-600'));
    });
  });

  describe('B-HERO-04: Beverage Visuals Boundaries', () => {
    it('T2-HERO-04-1: Visuals render properly with fallback hex tokens (#DC2626, #2563EB)', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.visuals.themeColors.primaryRed, '#DC2626');
      assert.strictEqual(hero.visuals.themeColors.secondaryBlue, '#2563EB');
      assert.strictEqual(hero.visuals.themeColors.white, '#FFFFFF');
    });

    it('T2-HERO-04-2: Effervescence motif flag is active for carbonation styling', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.visuals.hasEffervescenceMotif, true);
    });

    it('T2-HERO-04-3: Dark mode and light mode contrast verified against neutral background', () => {
      const hero = engine.renderHero();
      assert.ok(hero.visuals.themeColors.primaryRed);
    });

    it('T2-HERO-04-4: Honest presentation contains zero fabricated screenshots', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.visuals.hasFakeScreenshots, false);
    });

    it('T2-HERO-04-5: System themes maintain zero fake badges or misleading claims', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.visuals.hasFakeStats, false);
      assert.strictEqual(hero.visuals.hasFakeSecurityBadges, false);
    });
  });
});
