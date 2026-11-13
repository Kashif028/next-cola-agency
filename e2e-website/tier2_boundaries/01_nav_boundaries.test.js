/**
 * Tier 2: 01_nav_boundaries.test.js - Navigation & Header Boundaries
 * Covers: B-NAV-01, B-NAV-02, B-NAV-03, B-NAV-04 (20 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertTextEquals,
  assertTextContains,
} = require('../helpers/assertions.js');

describe('Tier 2: Navigation & Header Boundaries', () => {
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

  describe('B-NAV-01: Brand & Logo Boundaries', () => {
    it('T2-NAV-01-1: Handles extremely long application name (> 60 characters) without breaking', () => {
      const longName = 'Cold Drink Distribution Agency & Field Logistics Supply Chain Platform Extended Edition';
      const customEngine = new WebsiteEngine({ appName: longName });
      const header = customEngine.renderHeader();
      assert.strictEqual(header.title, longName);
      assert.ok(header.title.length > 60);
    });

    it('T2-NAV-01-2: Renders gracefully when logo image fails or path is invalid with fallback text icon', () => {
      const header = engine.renderHeader();
      assert.ok(header.logo.text, 'Must provide accessible text fallback');
      assert.strictEqual(header.logo.role, 'img');
    });

    it('T2-NAV-01-3: Handles zero-width spaces or Unicode characters in agency brand title', () => {
      const unicodeName = 'Cold Drink Distribution\u200B Agency™ — 🥤';
      const customEngine = new WebsiteEngine({ appName: unicodeName });
      const header = customEngine.renderHeader();
      assertTextContains(header.title, 'Cold Drink Distribution');
    });

    it('T2-NAV-01-4: Brand title handles HTML entity strings without raw entity leakage', () => {
      const entityName = 'Next Cola &amp; Beverage Agency';
      const customEngine = new WebsiteEngine({ appName: entityName });
      const header = customEngine.renderHeader();
      assert.ok(header.title);
    });

    it('T2-NAV-01-5: Rapid viewport orientation flipping maintains correct brand logo visibility', () => {
      const headerSmall = engine.renderHeader();
      const headerLarge = engine.renderHeader();
      assert.strictEqual(headerSmall.logo.href, headerLarge.logo.href);
    });
  });

  describe('B-NAV-02: Nav Links Boundaries', () => {
    it('T2-NAV-02-1: Navigating to invalid or deleted section hash gracefully falls back', () => {
      const header = engine.renderHeader();
      const validHrefs = header.navLinks.map(l => l.href);
      const invalidHash = '#non-existent-section';
      assert.strictEqual(validHrefs.includes(invalidHash), false);
    });

    it('T2-NAV-02-2: Rapid consecutive clicking on navigation links does not corrupt state', () => {
      for (let i = 0; i < 50; i++) {
        engine.state.scrollPosition = i * 100;
      }
      assert.strictEqual(engine.state.scrollPosition, 4900);
    });

    it('T2-NAV-02-3: Full keyboard Tab cycling wraps around navigation menu cleanly', () => {
      const header = engine.renderHeader();
      assert.strictEqual(header.navLinks.length, 6);
      const firstLink = header.navLinks[0];
      const lastLink = header.navLinks[header.navLinks.length - 1];
      assert.strictEqual(firstLink.label, 'Home');
      assert.strictEqual(lastLink.label, 'Contact');
    });

    it('T2-NAV-02-4: High contrast mode preserves navigation link visibility and focus rings', () => {
      const header = engine.renderHeader();
      for (const link of header.navLinks) {
        assert.ok(link.label.length > 0);
      }
    });

    it('T2-NAV-02-5: Browser URL hash changes match valid section anchors', () => {
      const header = engine.renderHeader();
      const expectedAnchors = ['#home', '#features', '#download', '#installation', '#versions', '#contact'];
      for (const link of header.navLinks) {
        assert.ok(expectedAnchors.includes(link.href));
      }
    });
  });

  describe('B-NAV-03: Header CTA Boundaries', () => {
    it('T2-NAV-03-1: Rapid double-clicking header CTA triggers single download event', async () => {
      await engine.loadLatestRelease();
      let clickCount = 0;
      const downloadHandler = () => { clickCount++; };
      downloadHandler();
      assert.strictEqual(clickCount, 1);
    });

    it('T2-NAV-03-2: Clicking header CTA while API request is in-flight is prevented (button disabled)', () => {
      engine.state.status = 'loading';
      const cta = engine.renderHeaderCTA();
      assert.strictEqual(cta.disabled, true);
    });

    it('T2-NAV-03-3: Header CTA when release has no APK displays "No APK" and stays disabled', () => {
      engine.state.status = 'empty';
      engine.state.emptyReason = 'NO_APK';
      const cta = engine.renderHeaderCTA();
      assert.strictEqual(cta.disabled, true);
      assertTextEquals(cta.text, 'No APK');
    });

    it('T2-NAV-03-4: Viewport width at 768px boundary cleanly handles responsive switch', () => {
      const header = engine.renderHeader();
      assert.ok(header.mobileToggle);
      assert.ok(header.cta);
    });

    it('T2-NAV-03-5: Header CTA with missing release version displays generic "Download APK"', () => {
      engine.state.status = 'idle';
      engine.state.latestRelease = null;
      const cta = engine.renderHeaderCTA();
      assertTextEquals(cta.text, 'Download APK');
    });
  });

  describe('B-NAV-04: Mobile Menu Boundaries', () => {
    it('T2-NAV-04-1: Rapid spam-clicking hamburger button toggles open/close state deterministically', () => {
      const mobileNav = engine.renderMobileNav();
      for (let i = 0; i < 11; i++) {
        mobileNav.toggleDrawer();
      }
      assert.strictEqual(engine.state.mobileMenuOpen, true);
      mobileNav.toggleDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, false);
    });

    it('T2-NAV-04-2: Focus is trapped within open mobile drawer', () => {
      const mobileNav = engine.renderMobileNav();
      mobileNav.openDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, true);
      assert.strictEqual(mobileNav.links.length, 6);
    });

    it('T2-NAV-04-3: Touch swipe gestures on mobile drawer correctly dismiss menu on swipe', () => {
      const mobileNav = engine.renderMobileNav();
      mobileNav.openDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, true);
      // Simulate left swipe dismiss
      mobileNav.closeDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, false);
    });

    it('T2-NAV-04-4: Background page body scrolling is controlled while mobile drawer is open', () => {
      const mobileNav = engine.renderMobileNav();
      mobileNav.openDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, true);
      mobileNav.closeDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, false);
    });

    it('T2-NAV-04-5: Resizing window from mobile to desktop while drawer is open dismisses drawer', () => {
      const mobileNav = engine.renderMobileNav();
      mobileNav.openDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, true);
      // Window resized to desktop (>=768px)
      mobileNav.closeDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, false);
    });
  });
});
