/**
 * Tier 1: 04_features.test.js - Neutral Features Section
 * Covers: FEAT-FEAT-01 (5 tests)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertTextEquals, assertTextContains } = require('../helpers/assertions.js');

describe('Tier 1: Features Section', () => {
  let engine;

  beforeEach(() => {
    engine = new WebsiteEngine();
  });

  describe('FEAT-FEAT-01: Neutral Features Section', () => {
    it('T1-FEAT-01-1: Renders neutral section heading introducing distribution capabilities', () => {
      const feat = engine.renderFeatures();
      assertTextEquals(feat.heading, 'Official Distribution Highlights');
      assert.strictEqual(feat.id, 'features');
    });

    it('T1-FEAT-01-2: Renders Feature 1: Direct Distribution', () => {
      const feat = engine.renderFeatures();
      const item = feat.items.find(i => i.title === 'Direct Distribution');
      assert.ok(item, 'Direct Distribution feature must exist');
      assertTextContains(item.description, 'Official direct download');
    });

    it('T1-FEAT-01-3: Renders Feature 2: Automated Releases Sync', () => {
      const feat = engine.renderFeatures();
      const item = feat.items.find(i => i.title === 'Automated Releases Sync');
      assert.ok(item, 'Automated Releases Sync feature must exist');
      assertTextContains(item.description, 'GitHub Releases');
    });

    it('T1-FEAT-01-4: Renders Feature 3: Cryptographic Integrity First', () => {
      const feat = engine.renderFeatures();
      const item = feat.items.find(i => i.title === 'Cryptographic Integrity');
      assert.ok(item, 'Cryptographic Integrity feature must exist');
      assertTextContains(item.description, 'SHA-256');
    });

    it('T1-FEAT-01-5: Section strictly contains NO invented POS, inventory, or billing claims', () => {
      const feat = engine.renderFeatures();
      assert.strictEqual(feat.hasInventedPOSClaims, false);
      for (const item of feat.items) {
        assert.strictEqual(/(\bPOS\b|\bbilling\b|\binventory ledger\b|\bkhata\b)/i.test(item.description), false);
      }
    });
  });
});
