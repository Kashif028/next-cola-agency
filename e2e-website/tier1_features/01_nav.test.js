/**
 * Tier 1: 01_nav.test.js - Navigation & Header Features
 * Covers: FEAT-NAV-01, FEAT-NAV-02, FEAT-NAV-03, FEAT-NAV-04 (20 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertTextEquals,
  assertTextContains,
  assertIsDirectDownloadUrl,
} = require('../helpers/assertions.js');

describe('Tier 1: Header & Navigation Features', () => {
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

  describe('FEAT-NAV-01: Header Logo & Branding', () => {
    it('T1-NAV-01-1: Renders official agency logo mark or placeholder with proper accessibility attributes', () => {
      const header = engine.renderHeader();
      assert.ok(header.logo, 'Header logo element must exist');
      assert.strictEqual(header.logo.role, 'img');
      assert.strictEqual(header.logo.ariaLabel, 'Agency Logo');
    });

    it('T1-NAV-01-2: Displays official Cold Drink Distribution Agency application title', () => {
      const header = engine.renderHeader();
      assertTextContains(header.title, 'Cold Drink Distribution Agency');
    });

    it('T1-NAV-01-3: Displays official distribution subtitle badge', () => {
      const header = engine.renderHeader();
      assertTextEquals(header.subtitle, 'Official APK Distribution');
    });

    it('T1-NAV-01-4: Branding container anchors to top of page (#home)', () => {
      const header = engine.renderHeader();
      assert.strictEqual(header.logo.href, '#home');
    });

    it('T1-NAV-01-5: Header branding maintains beverage-themed visual accents', () => {
      const header = engine.renderHeader();
      assert.ok(Array.isArray(header.themeAccents), 'Theme accents must be present');
      assert.ok(header.themeAccents.includes('text-red-600'), 'Must contain ruby red accent');
      assert.ok(header.themeAccents.includes('bg-blue-600'), 'Must contain cobalt blue accent');
    });
  });

  describe('FEAT-NAV-02: Navigation Bar Links', () => {
    it('T1-NAV-02-1: Renders all 6 required desktop navigation links', () => {
      const header = engine.renderHeader();
      const labels = header.navLinks.map(l => l.label);
      assert.deepStrictEqual(labels, [
        'Home',
        'Features',
        'Download App',
        'Installation Guide',
        'Version History',
        'Contact',
      ]);
    });

    it('T1-NAV-02-2: Each navigation link contains valid non-empty anchor href matching designated target sections', () => {
      const header = engine.renderHeader();
      for (const link of header.navLinks) {
        assert.ok(link.href && link.href.startsWith('#'), `Link ${link.label} must have valid # anchor, got ${link.href}`);
      }
    });

    it('T1-NAV-02-3: Navigation link for Features points strictly to #features', () => {
      const header = engine.renderHeader();
      const featLink = header.navLinks.find(l => l.label === 'Features');
      assert.ok(featLink, 'Features link must exist');
      assert.strictEqual(featLink.href, '#features');
    });

    it('T1-NAV-02-4: Navigation links for Guide and History point to #installation and #versions', () => {
      const header = engine.renderHeader();
      const guideLink = header.navLinks.find(l => l.label === 'Installation Guide');
      const histLink = header.navLinks.find(l => l.label === 'Version History');
      assert.strictEqual(guideLink.href, '#installation');
      assert.strictEqual(histLink.href, '#versions');
    });

    it('T1-NAV-02-5: Navigation links for Download and Contact point to #download and #contact', () => {
      const header = engine.renderHeader();
      const dlLink = header.navLinks.find(l => l.label === 'Download App');
      const contactLink = header.navLinks.find(l => l.label === 'Contact');
      assert.strictEqual(dlLink.href, '#download');
      assert.strictEqual(contactLink.href, '#contact');
    });
  });

  describe('FEAT-NAV-03: Header Download CTA Button', () => {
    it('T1-NAV-03-1: Desktop header contains prominent high-contrast Download APK button', () => {
      const header = engine.renderHeader();
      assert.ok(header.cta, 'Header CTA must exist');
      assert.ok(header.cta.text.includes('Download APK'));
    });

    it('T1-NAV-03-2: Clicking header download button triggers direct download of latest verified APK asset', async () => {
      await engine.loadLatestRelease();
      const header = engine.renderHeader();
      assert.strictEqual(header.cta.disabled, false);
      assertIsDirectDownloadUrl(header.cta.href);
    });

    it('T1-NAV-03-3: Header CTA dynamically displays latest version tag indicator', async () => {
      await engine.loadLatestRelease();
      const header = engine.renderHeader();
      assertTextContains(header.cta.text, 'v1.2.0');
    });

    it('T1-NAV-03-4: Header CTA displays disabled/loading state during initial API fetch', () => {
      engine.state.status = 'loading';
      const cta = engine.renderHeaderCTA();
      assert.strictEqual(cta.disabled, true);
      assertTextEquals(cta.text, 'Loading...');
    });

    it('T1-NAV-03-5: In empty or error state, header CTA displays disabled fallback state', () => {
      engine.state.status = 'empty';
      const cta = engine.renderHeaderCTA();
      assert.strictEqual(cta.disabled, true);
      assertTextEquals(cta.text, 'No APK');
    });
  });

  describe('FEAT-NAV-04: Responsive Mobile Navigation', () => {
    it('T1-NAV-04-1: Renders accessible mobile hamburger toggle button on viewport width < 768px', () => {
      const header = engine.renderHeader();
      assert.ok(header.mobileToggle, 'Mobile toggle button must be defined');
      assert.strictEqual(header.mobileToggle.role, 'button');
    });

    it('T1-NAV-04-2: Hamburger button manages aria-expanded and aria-label="Toggle navigation menu"', () => {
      const header = engine.renderHeader();
      assert.strictEqual(header.mobileToggle.ariaLabel, 'Toggle navigation menu');
      assert.strictEqual(header.mobileToggle.ariaExpanded, 'false');
    });

    it('T1-NAV-04-3: Clicking hamburger button expands mobile navigation drawer containing navigation links', () => {
      const mobileNav = engine.renderMobileNav();
      assert.strictEqual(mobileNav.isOpen, false);
      mobileNav.openDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, true);
      assert.strictEqual(mobileNav.links.length, 6);
    });

    it('T1-NAV-04-4: Clicking any navigation link inside mobile drawer automatically closes the drawer', () => {
      engine.state.mobileMenuOpen = true;
      const mobileNav = engine.renderMobileNav();
      assert.strictEqual(mobileNav.isOpen, true);
      mobileNav.closeDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, false);
    });

    it('T1-NAV-04-5: Toggle action flips mobile drawer state deterministically', () => {
      const mobileNav = engine.renderMobileNav();
      mobileNav.toggleDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, true);
      mobileNav.toggleDrawer();
      assert.strictEqual(engine.state.mobileMenuOpen, false);
    });
  });
});
