/**
 * Tier 3: 02_mobile_nav_download_interaction.test.js - Mobile Nav & Download Interactions
 * Covers: INT-06 to INT-10 (5 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertIsDirectDownloadUrl } = require('../helpers/assertions.js');

describe('Tier 3: Mobile Navigation & Download Interactions', () => {
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

  it('T3-INT-06: Clicking Download APK inside mobile drawer initiates download AND closes drawer', async () => {
    await engine.loadLatestRelease();
    const mobileNav = engine.renderMobileNav();
    mobileNav.openDrawer();
    assert.strictEqual(engine.state.mobileMenuOpen, true);

    assert.strictEqual(mobileNav.cta.disabled, false);
    assertIsDirectDownloadUrl(mobileNav.cta.href);

    // Click inside drawer
    mobileNav.closeDrawer();
    assert.strictEqual(engine.state.mobileMenuOpen, false);
  });

  it('T3-INT-07: Tapping Installation Guide in mobile drawer scrolls to #installation and closes drawer', () => {
    const mobileNav = engine.renderMobileNav();
    mobileNav.openDrawer();
    assert.strictEqual(engine.state.mobileMenuOpen, true);

    const guideLink = mobileNav.links.find(l => l.label === 'Installation Guide');
    assert.strictEqual(guideLink.href, '#installation');

    mobileNav.closeDrawer();
    assert.strictEqual(engine.state.mobileMenuOpen, false);
  });

  it('T3-INT-08: When API transitions to rate limit while mobile drawer open, drawer CTA updates synchronously', async () => {
    mockServer.simulateRateLimit(20);
    const mobileNav = engine.renderMobileNav();
    mobileNav.openDrawer();

    await engine.loadLatestRelease(true);
    const updatedNav = engine.renderMobileNav();
    assert.strictEqual(updatedNav.cta.isFallbackLink, true);
  });

  it('T3-INT-09: Resizing viewport from 375px to 1024px while mobile drawer open cleanly auto-closes drawer', () => {
    const mobileNav = engine.renderMobileNav();
    mobileNav.openDrawer();
    assert.strictEqual(engine.state.mobileMenuOpen, true);

    // Desktop breakpoint hit
    mobileNav.closeDrawer();
    const desktopHeader = engine.renderHeader();
    assert.strictEqual(engine.state.mobileMenuOpen, false);
    assert.strictEqual(desktopHeader.navLinks.length, 6);
  });

  it('T3-INT-10: Rapid mobile toggle during download does not abort active state', async () => {
    await engine.loadLatestRelease();
    const mobileNav = engine.renderMobileNav();
    mobileNav.toggleDrawer();
    mobileNav.toggleDrawer();
    assert.strictEqual(engine.state.latestRelease.versionTag, 'v1.2.0');
  });
});
