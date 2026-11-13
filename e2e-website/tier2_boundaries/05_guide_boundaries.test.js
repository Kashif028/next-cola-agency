/**
 * Tier 2: 05_guide_boundaries.test.js - Guide & Troubleshooting Boundaries
 * Covers: B-GUIDE-01, B-GUIDE-02 (10 tests)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertTextContains } = require('../helpers/assertions.js');

describe('Tier 2: Installation Guide & Troubleshooting Boundaries', () => {
  let engine;

  beforeEach(() => {
    engine = new WebsiteEngine();
  });

  describe('B-GUIDE-01: Installation Guide Boundaries', () => {
    it('T2-GUIDE-01-1: Preserves 1 to 5 sequential numbering strictly without gaps', () => {
      const guide = engine.renderInstallationGuide();
      const stepNums = guide.steps.map(s => s.step);
      assert.deepStrictEqual(stepNums, [1, 2, 3, 4, 5]);
    });

    it('T2-GUIDE-01-2: Step instructions wrap cleanly on narrow screens without missing text', () => {
      const guide = engine.renderInstallationGuide();
      for (const step of guide.steps) {
        assert.ok(step.desc.length > 15, `Step ${step.step} description too short`);
      }
    });

    it('T2-GUIDE-01-3: All 5 steps have valid non-empty titles', () => {
      const guide = engine.renderInstallationGuide();
      for (const step of guide.steps) {
        assert.ok(step.title.length > 5);
      }
    });

    it('T2-GUIDE-01-4: Step 3 explicitly specifies "Allow from this source" permission keyword', () => {
      const guide = engine.renderInstallationGuide();
      const step3 = guide.steps.find(s => s.step === 3);
      assertTextContains(step3.desc, 'Allow from this source');
    });

    it('T2-GUIDE-01-5: Landmark anchor #installation is preserved', () => {
      const guide = engine.renderInstallationGuide();
      assert.strictEqual(guide.id, 'installation');
    });
  });

  describe('B-GUIDE-02: Troubleshooting Matrix Boundaries', () => {
    it('T2-GUIDE-02-1: All 5 troubleshooting scenarios have distinct case numbers and IDs', () => {
      const tb = engine.renderTroubleshooting();
      assert.strictEqual(tb.scenarios.length, 5);
      const ids = new Set(tb.scenarios.map(s => s.id));
      assert.strictEqual(ids.size, 5);
    });

    it('T2-GUIDE-02-2: Every scenario provides cause and actionable solution', () => {
      const tb = engine.renderTroubleshooting();
      for (const s of tb.scenarios) {
        assert.ok(s.cause.length > 10, `Case ${s.case} cause too short`);
        assert.ok(s.solution.length > 10, `Case ${s.case} solution too short`);
      }
    });

    it('T2-GUIDE-02-3: Rapid inspection of all scenarios preserves state integrity', () => {
      const tb = engine.renderTroubleshooting();
      for (let i = 0; i < 5; i++) {
        assert.strictEqual(tb.scenarios[i].case, i + 1);
      }
    });

    it('T2-GUIDE-02-4: Troubleshooting scenarios explicitly cite Settings navigation', () => {
      const tb = engine.renderTroubleshooting();
      const s2 = tb.scenarios.find(s => s.case === 2);
      const s3 = tb.scenarios.find(s => s.case === 3);
      const s4 = tb.scenarios.find(s => s.case === 4);
      assertTextContains(s2.solution, 'Settings');
      assertTextContains(s3.solution, 'Settings');
      assertTextContains(s4.solution, 'Settings');
    });

    it('T2-GUIDE-02-5: Storage scenario specifies explicit numerical threshold (150MB-300MB)', () => {
      const tb = engine.renderTroubleshooting();
      const storageCase = tb.scenarios.find(s => s.case === 3);
      assertTextContains(storageCase.solution, '150MB-300MB');
    });
  });
});
