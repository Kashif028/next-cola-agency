/**
 * Tier 2: 04_features_boundaries.test.js - Features Section Boundaries
 * Covers: B-FEAT-01 (5 tests)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');

describe('Tier 2: Features Section Boundaries', () => {
  let engine;

  beforeEach(() => {
    engine = new WebsiteEngine();
  });

  describe('B-FEAT-01: Features Section Boundaries', () => {
    it('T2-FEAT-01-1: All 4 feature cards have non-empty unique titles and identifiers', () => {
      const feat = engine.renderFeatures();
      assert.strictEqual(feat.items.length, 4);
      const ids = new Set(feat.items.map(i => i.id));
      assert.strictEqual(ids.size, 4);
      for (const item of feat.items) {
        assert.ok(item.title.length > 0);
        assert.ok(item.description.length > 10);
      }
    });

    it('T2-FEAT-01-2: Vector icon indicators are defined for all feature cards', () => {
      const feat = engine.renderFeatures();
      for (const item of feat.items) {
        assert.ok(item.icon, `Feature ${item.title} must have vector icon identifier`);
      }
    });

    it('T2-FEAT-01-3: Features descriptions accommodate variable text lengths without error', () => {
      const feat = engine.renderFeatures();
      const lengths = feat.items.map(i => i.description.length);
      assert.ok(Math.min(...lengths) > 20);
      assert.ok(Math.max(...lengths) < 200);
    });

    it('T2-FEAT-01-4: Reading order is logical and deterministic', () => {
      const feat = engine.renderFeatures();
      assert.strictEqual(feat.items[0].id, 'feat-direct');
      assert.strictEqual(feat.items[1].id, 'feat-sync');
      assert.strictEqual(feat.items[2].id, 'feat-integrity');
      assert.strictEqual(feat.items[3].id, 'feat-field');
    });

    it('T2-FEAT-01-5: Features section retains clean id="features" landmark anchor', () => {
      const feat = engine.renderFeatures();
      assert.strictEqual(feat.id, 'features');
    });
  });
});
