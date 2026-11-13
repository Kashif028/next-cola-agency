/**
 * Tier 1: 07_footer.test.js - Footer Features
 * Covers: FEAT-FOOT-01, FEAT-FOOT-02, FEAT-FOOT-03 (15 tests)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertTextEquals, assertTextContains } = require('../helpers/assertions.js');

describe('Tier 1: Footer Features', () => {
  let engine;

  beforeEach(() => {
    engine = new WebsiteEngine();
  });

  describe('FEAT-FOOT-01: Footer Info & Quick Links', () => {
    it('T1-FOOT-01-1: Renders About description stating website is official distribution portal', () => {
      const footer = engine.renderFooter();
      assertTextContains(footer.about, 'distribution portal');
    });

    it('T1-FOOT-01-2: Renders quick navigation shortcuts', () => {
      const footer = engine.renderFooter();
      const labels = footer.quickLinks.map(l => l.label);
      assert.ok(labels.includes('Home'));
      assert.ok(labels.includes('Features'));
      assert.ok(labels.includes('Download App'));
      assert.ok(labels.includes('Installation Guide'));
      assert.ok(labels.includes('Version History'));
    });

    it('T1-FOOT-01-3: Renders explicit Privacy Information notice stating zero telemetry', () => {
      const footer = engine.renderFooter();
      assertTextContains(footer.privacy, 'zero user tracking');
    });

    it('T1-FOOT-01-4: Quick links have valid anchor href destinations', () => {
      const footer = engine.renderFooter();
      for (const link of footer.quickLinks) {
        assert.ok(link.href.startsWith('#'), `Footer link ${link.label} must start with #`);
      }
    });

    it('T1-FOOT-01-5: Footer semantic role is contentinfo', () => {
      const footer = engine.renderFooter();
      assert.strictEqual(footer.role, 'contentinfo');
    });
  });

  describe('FEAT-FOOT-02: Footer Contact & Support', () => {
    it('T1-FOOT-02-1: Displays configured real agency support email address', () => {
      const footer = engine.renderFooter();
      assertTextEquals(footer.contact.email, 'support@colddrinkdist.example.com');
    });

    it('T1-FOOT-02-2: Support email is wrapped in valid mailto: hyperlink with subject', () => {
      const footer = engine.renderFooter();
      assert.ok(footer.contact.emailHref.startsWith('mailto:support@colddrinkdist.example.com'));
      assertTextContains(footer.contact.emailHref, 'subject=');
    });

    it('T1-FOOT-02-3: Displays configured real agency support phone number', () => {
      const footer = engine.renderFooter();
      assertTextEquals(footer.contact.phone, '+92 300 1234567');
    });

    it('T1-FOOT-02-4: Support phone is wrapped in valid tel: hyperlink', () => {
      const footer = engine.renderFooter();
      assertTextEquals(footer.contact.phoneHref, 'tel:+923001234567');
    });

    it('T1-FOOT-02-5: Displays operational guidance for distribution desk assistance', () => {
      const footer = engine.renderFooter();
      assertTextContains(footer.contact.guidance, 'distribution desk');
    });
  });

  describe('FEAT-FOOT-03: Footer GitHub Repo & Copyright', () => {
    it('T1-FOOT-03-1: Displays direct hyperlink to official GitHub repository', () => {
      const footer = engine.renderFooter();
      assert.strictEqual(footer.repoLink.href, 'https://github.com/LogarTraders/cold-drink-distribution-app');
    });

    it('T1-FOOT-03-2: Repository link enforces target="_blank" and rel="noopener noreferrer"', () => {
      const footer = engine.renderFooter();
      assert.strictEqual(footer.repoLink.target, '_blank');
      assert.strictEqual(footer.repoLink.rel, 'noopener noreferrer');
    });

    it('T1-FOOT-03-3: Truthful copyright statement: "© 2026 Cold Drink Distribution Agency. All rights reserved."', () => {
      const footer = engine.renderFooter();
      assertTextEquals(footer.copyright, '© 2026 Cold Drink Distribution Agency. All rights reserved.');
    });

    it('T1-FOOT-03-4: Verified absence of fake third-party security seal badges', () => {
      const footer = engine.renderFooter();
      assert.strictEqual(footer.hasFakeBadges, false);
    });

    it('T1-FOOT-03-5: Outbound repository URL enforces https scheme', () => {
      const footer = engine.renderFooter();
      assert.ok(footer.repoLink.href.startsWith('https://'));
    });
  });
});
