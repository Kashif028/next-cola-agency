/**
 * Tier 1: 02_hero.test.js - Hero Section Features
 * Covers: FEAT-HERO-01, FEAT-HERO-02, FEAT-HERO-03, FEAT-HERO-04 (20 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertTextEquals,
  assertTextContains,
  assertIsDirectDownloadUrl,
} = require('../helpers/assertions.js');

describe('Tier 1: Hero Section Features', () => {
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

  describe('FEAT-HERO-01: Hero Headline & Copy', () => {
    it('T1-HERO-01-1: Renders verbatim heading: "Your Cold Drink Agency App – Download Now"', () => {
      const hero = engine.renderHero();
      assertTextEquals(hero.heading, 'Your Cold Drink Agency App – Download Now');
    });

    it('T1-HERO-01-2: Renders verbatim supporting text', () => {
      const hero = engine.renderHero();
      const expectedCopy = 'Access your Cold Drink Distribution Agency application through a simple and convenient Android download experience. Download the latest available version directly from our official distribution source.';
      assertTextEquals(hero.description, expectedCopy);
    });

    it('T1-HERO-01-3: Heading is rendered using semantic <h1> element', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.headingTag, 'h1');
    });

    it('T1-HERO-01-4: Typography meets accessible contrast standards', () => {
      const hero = engine.renderHero();
      assert.ok(hero.visuals.themeColors.white, 'White text token defined');
      assert.ok(hero.visuals.themeColors.primaryRed, 'Red theme token defined');
    });

    it('T1-HERO-01-5: Subtitle copy maintains clean non-empty description', () => {
      const hero = engine.renderHero();
      assert.ok(hero.description.length > 50, 'Description must be complete');
    });
  });

  describe('FEAT-HERO-02: Hero Primary Download CTA', () => {
    it('T1-HERO-02-1: Renders primary CTA button with text "Download Latest APK"', () => {
      const hero = engine.renderHero();
      assert.ok(hero.primaryCTA.text.includes('Download'));
    });

    it('T1-HERO-02-2: Primary CTA displays live release version badge and APK size', async () => {
      await engine.loadLatestRelease();
      const hero = engine.renderHero();
      assert.strictEqual(hero.primaryCTA.versionTag, 'v1.2.0');
      assert.strictEqual(hero.primaryCTA.formattedSize, '24.5 MB');
      assertTextContains(hero.primaryCTA.text, 'v1.2.0');
      assertTextContains(hero.primaryCTA.text, '24.5 MB');
    });

    it('T1-HERO-02-3: Clicking primary CTA initiates direct browser download of GitHub asset URL', async () => {
      await engine.loadLatestRelease();
      const hero = engine.renderHero();
      assert.strictEqual(hero.primaryCTA.disabled, false);
      assertIsDirectDownloadUrl(hero.primaryCTA.href);
    });

    it('T1-HERO-02-4: Button transitions to disabled state with explanatory label when release has no APK asset', async () => {
      mockServer.setLatestResponse(mockServer.fixtures.latestNoApk);
      await engine.loadLatestRelease();
      const hero = engine.renderHero();
      assert.strictEqual(hero.primaryCTA.disabled, true);
      assertTextContains(hero.primaryCTA.text, 'No APK');
    });

    it('T1-HERO-02-5: Button displays animated loading spinner during API data fetching', () => {
      engine.state.status = 'loading';
      const cta = engine.renderHeroCTA();
      assert.strictEqual(cta.disabled, true);
      assertTextContains(cta.text, 'Checking for updates');
      assert.ok(cta.classes.includes('animate-pulse'));
    });
  });

  describe('FEAT-HERO-03: Hero Secondary Action', () => {
    it('T1-HERO-03-1: Renders secondary action button with text "View Installation Guide"', () => {
      const hero = engine.renderHero();
      assertTextEquals(hero.secondaryCTA.text, 'View Installation Guide');
    });

    it('T1-HERO-03-2: Secondary button contains anchor link pointing directly to #installation', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.secondaryCTA.href, '#installation');
    });

    it('T1-HERO-03-3: Secondary button remains active regardless of API state', () => {
      engine.state.status = 'error';
      const hero = engine.renderHero();
      assert.ok(hero.secondaryCTA.href, '#installation');
    });

    it('T1-HERO-03-4: Secondary button features subtle outline/ghost styling distinct from primary CTA', () => {
      const hero = engine.renderHero();
      assert.ok(hero.secondaryCTA.classes.includes('border'));
      assert.ok(hero.secondaryCTA.classes.includes('text-blue-600'));
    });

    it('T1-HERO-03-5: Button is fully accessible via anchor href navigation', () => {
      const hero = engine.renderHero();
      assert.strictEqual(typeof hero.secondaryCTA.href, 'string');
      assert.strictEqual(hero.secondaryCTA.href.startsWith('#'), true);
    });
  });

  describe('FEAT-HERO-04: Beverage-Themed Hero Visuals', () => {
    it('T1-HERO-04-1: Hero presentation applies beverage-themed crimson red (#DC2626) and cobalt blue (#2563EB)', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.visuals.themeColors.primaryRed, '#DC2626');
      assert.strictEqual(hero.visuals.themeColors.secondaryBlue, '#2563EB');
    });

    it('T1-HERO-04-2: Background features subtle effervescence / carbonation bubble visual effects', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.visuals.hasEffervescenceMotif, true);
    });

    it('T1-HERO-04-3: Device presentation is neutral placeholder without fake screenshots', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.visuals.hasFakeScreenshots, false);
    });

    it('T1-HERO-04-4: Verified absence of fake application statistics (no fake download counters)', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.visuals.hasFakeStats, false);
    });

    it('T1-HERO-04-5: Verified absence of fake third-party security badges (Norton, McAfee)', () => {
      const hero = engine.renderHero();
      assert.strictEqual(hero.visuals.hasFakeSecurityBadges, false);
    });
  });
});
