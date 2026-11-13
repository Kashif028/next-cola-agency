/**
 * Tier 4: 01_first_time_user_journey.test.js - First-Time Driver Experience Journey
 * Covers: SCEN-01 to SCEN-04 (4 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertIsDirectDownloadUrl,
  assertTextEquals,
  assertTextContains,
} = require('../helpers/assertions.js');

describe('Tier 4: First-Time User Experience Journeys', () => {
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

  it('T4-SCEN-01: First-time driver lands on portal, inspects hero, and downloads latest verified APK', async () => {
    // Step 1: User visits website; app loads latest release
    await engine.loadLatestRelease();

    // Step 2: Hero displays verbatim headline and verified build info
    const hero = engine.renderHero();
    assertTextEquals(hero.heading, 'Your Cold Drink Agency App – Download Now');
    assert.strictEqual(hero.primaryCTA.versionTag, 'v1.2.0');
    assert.strictEqual(hero.primaryCTA.formattedSize, '24.5 MB');

    // Step 3: User clicks primary CTA button
    assert.strictEqual(hero.primaryCTA.disabled, false);
    assertIsDirectDownloadUrl(hero.primaryCTA.href);
    assert.strictEqual(hero.primaryCTA.isDirectDownload, true);
  });

  it('T4-SCEN-02: Driver sideload onboarding workflow scrolls to 5-step Installation Guide', () => {
    // Step 1: Driver clicks "View Installation Guide"
    const hero = engine.renderHero();
    assert.strictEqual(hero.secondaryCTA.href, '#installation');

    // Step 2: Driver reviews the 5 steps
    const guide = engine.renderInstallationGuide();
    assert.strictEqual(guide.steps.length, 5);
    assertTextContains(guide.steps[0].title, 'Download');
    assertTextContains(guide.steps[1].title, 'Open');
    assertTextContains(guide.steps[2].title, 'Grant Permissions');
    assertTextContains(guide.steps[3].title, 'Confirm');
    assertTextContains(guide.steps[4].title, 'Launch');
  });

  it('T4-SCEN-03: Pre-installation verification workflow inspects App Info Card for honest metadata', async () => {
    await engine.loadLatestRelease();
    const card = engine.renderAppInfoCard();

    // Verifies application name, release date, and file size
    assertTextEquals(card.appName, 'Cold Drink Distribution Agency App');
    assertTextEquals(card.releaseDate, 'November 10, 2026');
    assertTextEquals(card.fileSize, '24.5 MB');

    // Truthful "Not provided" state for unverified manifest details
    assertTextEquals(card.minAndroidVersion, 'Not provided');
    assertTextEquals(card.packageName, 'Not provided');

    // Sanitized notes
    assertTextContains(card.releaseNotesHtml, 'High-speed order synchronization');
  });

  it('T4-SCEN-04: Mobile navigation & quick download journey operates cleanly through drawer', async () => {
    await engine.loadLatestRelease();
    const mobileNav = engine.renderMobileNav();

    // Step 1: Mobile drawer opens
    mobileNav.openDrawer();
    assert.strictEqual(engine.state.mobileMenuOpen, true);

    // Step 2: Driver taps mobile drawer "Download APK"
    assert.strictEqual(mobileNav.cta.disabled, false);
    assertIsDirectDownloadUrl(mobileNav.cta.href);

    // Step 3: Drawer closes
    mobileNav.closeDrawer();
    assert.strictEqual(engine.state.mobileMenuOpen, false);
  });
});
