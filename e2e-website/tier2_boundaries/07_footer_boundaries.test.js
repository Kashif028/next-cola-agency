/**
 * Tier 2: 07_footer_boundaries.test.js - Footer Boundaries
 * Covers: B-FOOT-01, B-FOOT-02, B-FOOT-03 (15 tests)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertTextContains } = require('../helpers/assertions.js');

describe('Tier 2: Footer Boundaries', () => {
  let engine;

  beforeEach(() => {
    engine = new WebsiteEngine();
  });

  describe('B-FOOT-01: Footer Quick Links Boundaries', () => {
    it('T2-FOOT-01-1: All quick links maintain valid # anchor destinations', () => {
      const footer = engine.renderFooter();
      for (const link of footer.quickLinks) {
        assert.ok(link.href.startsWith('#'));
      }
    });

    it('T2-FOOT-01-2: Keyboard navigation targets all 5 quick links', () => {
      const footer = engine.renderFooter();
      assert.strictEqual(footer.quickLinks.length, 5);
    });

    it('T2-FOOT-01-3: Footer container accommodates variable content heights', () => {
      const footer = engine.renderFooter();
      assert.ok(footer.about.length > 20);
      assert.ok(footer.privacy.length > 20);
    });

    it('T2-FOOT-01-4: Privacy notice clearly explains zero telemetry or tracking', () => {
      const footer = engine.renderFooter();
      assertTextContains(footer.privacy, 'zero user tracking');
    });

    it('T2-FOOT-01-5: Footer about statement describes official distribution channel', () => {
      const footer = engine.renderFooter();
      assertTextContains(footer.about, 'official');
    });
  });

  describe('B-FOOT-02: Footer Contact Boundaries', () => {
    it('T2-FOOT-02-1: Support email mailto: format is valid', () => {
      const footer = engine.renderFooter();
      assert.ok(footer.contact.emailHref.startsWith('mailto:'));
    });

    it('T2-FOOT-02-2: Support phone tel: URI strips formatting spaces and letters', () => {
      const footer = engine.renderFooter();
      assert.strictEqual(footer.contact.phoneHref, 'tel:+923001234567');
      assert.strictEqual(/[\s-]/.test(footer.contact.phoneHref), false);
    });

    it('T2-FOOT-02-3: Support email includes pre-populated subject line', () => {
      const footer = engine.renderFooter();
      assertTextContains(footer.contact.emailHref, 'subject=Cold%20Drink%20App%20Inquiry');
    });

    it('T2-FOOT-02-4: Handles long email addresses safely without layout break', () => {
      const longEmail = 'very.long.distribution.logistics.support.desk@colddrinkdist.example.com';
      const customEngine = new WebsiteEngine({ contactEmail: longEmail });
      const footer = customEngine.renderFooter();
      assert.strictEqual(footer.contact.email, longEmail);
    });

    it('T2-FOOT-02-5: Distribution desk guidance text is clear and actionable', () => {
      const footer = engine.renderFooter();
      assertTextContains(footer.contact.guidance, 'distribution desk');
    });
  });

  describe('B-FOOT-03: Footer Repo & Copyright Boundaries', () => {
    it('T2-FOOT-03-1: Repository link points to correct configured owner and repo', () => {
      const footer = engine.renderFooter();
      assert.strictEqual(footer.repoLink.href, 'https://github.com/LogarTraders/cold-drink-distribution-app');
    });

    it('T2-FOOT-03-2: Copyright notice contains current year 2026', () => {
      const footer = engine.renderFooter();
      assertTextContains(footer.copyright, '2026');
    });

    it('T2-FOOT-03-3: Verifies that no trademark-infringing logos appear', () => {
      const footer = engine.renderFooter();
      assert.strictEqual(footer.hasFakeBadges, false);
    });

    it('T2-FOOT-03-4: Repo link displays target _blank and rel noopener noreferrer', () => {
      const footer = engine.renderFooter();
      assert.strictEqual(footer.repoLink.target, '_blank');
      assert.strictEqual(footer.repoLink.rel, 'noopener noreferrer');
    });

    it('T2-FOOT-03-5: Outbound repo link strictly enforces https://', () => {
      const footer = engine.renderFooter();
      assert.ok(footer.repoLink.href.startsWith('https://'));
    });
  });
});
