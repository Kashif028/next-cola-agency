/**
 * Tier 1: 05_guide.test.js - Installation Guide & Troubleshooting Features
 * Covers: FEAT-GUIDE-01, FEAT-GUIDE-02 (10 tests)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertTextEquals, assertTextContains } = require('../helpers/assertions.js');

describe('Tier 1: Installation Guide & Troubleshooting Features', () => {
  let engine;

  beforeEach(() => {
    engine = new WebsiteEngine();
  });

  describe('FEAT-GUIDE-01: 5-Step Android Installation Guide', () => {
    it('T1-GUIDE-01-1: Renders Step 1: Download the APK', () => {
      const guide = engine.renderInstallationGuide();
      const step1 = guide.steps.find(s => s.step === 1);
      assert.ok(step1, 'Step 1 must exist');
      assertTextContains(step1.title, 'Download APK');
      assertTextContains(step1.desc, 'notification bar');
    });

    it('T1-GUIDE-01-2: Renders Step 2: Open Downloaded File', () => {
      const guide = engine.renderInstallationGuide();
      const step2 = guide.steps.find(s => s.step === 2);
      assert.ok(step2, 'Step 2 must exist');
      assertTextContains(step2.title, 'Open Downloaded File');
      assertTextContains(step2.desc, 'Downloads folder');
    });

    it('T1-GUIDE-01-3: Renders Step 3: Grant Unknown Apps Permission', () => {
      const guide = engine.renderInstallationGuide();
      const step3 = guide.steps.find(s => s.step === 3);
      assert.ok(step3, 'Step 3 must exist');
      assertTextContains(step3.title, 'Grant Permissions');
      assertTextContains(step3.desc, 'Allow from this source');
    });

    it('T1-GUIDE-01-4: Renders Step 4: Confirm Installation', () => {
      const guide = engine.renderInstallationGuide();
      const step4 = guide.steps.find(s => s.step === 4);
      assert.ok(step4, 'Step 4 must exist');
      assertTextContains(step4.title, 'Confirm Installation');
      assertTextContains(step4.desc, 'Package Installer');
    });

    it('T1-GUIDE-01-5: Renders Step 5: Launch Application', () => {
      const guide = engine.renderInstallationGuide();
      const step5 = guide.steps.find(s => s.step === 5);
      assert.ok(step5, 'Step 5 must exist');
      assertTextContains(step5.title, 'Launch Application');
      assertTextContains(step5.desc, 'Open');
    });
  });

  describe('FEAT-GUIDE-02: Troubleshooting Matrix', () => {
    it('T1-GUIDE-02-1: Covers Scenario 1: Incomplete Downloads with cause and resolution', () => {
      const tb = engine.renderTroubleshooting();
      const c1 = tb.scenarios.find(s => s.case === 1);
      assert.ok(c1, 'Case 1 must exist');
      assertTextContains(c1.title, 'Incomplete Downloads');
      assertTextContains(c1.solution, '.crdownload');
    });

    it('T1-GUIDE-02-2: Covers Scenario 2: Unsupported Android Version with OS check steps', () => {
      const tb = engine.renderTroubleshooting();
      const c2 = tb.scenarios.find(s => s.case === 2);
      assert.ok(c2, 'Case 2 must exist');
      assertTextContains(c2.title, 'Unsupported Android Version');
      assertTextContains(c2.solution, 'Settings > About Phone');
    });

    it('T1-GUIDE-02-3: Covers Scenario 3: Insufficient Storage Space with 150MB-300MB instructions', () => {
      const tb = engine.renderTroubleshooting();
      const c3 = tb.scenarios.find(s => s.case === 3);
      assert.ok(c3, 'Case 3 must exist');
      assertTextContains(c3.title, 'Insufficient Storage Space');
      assertTextContains(c3.solution, '150MB-300MB');
    });

    it('T1-GUIDE-02-4: Covers Scenario 4: Permission Issues (Install Unknown Apps)', () => {
      const tb = engine.renderTroubleshooting();
      const c4 = tb.scenarios.find(s => s.case === 4);
      assert.ok(c4, 'Case 4 must exist');
      assertTextContains(c4.title, 'Permission Issues');
      assertTextContains(c4.solution, 'Special App Access');
    });

    it('T1-GUIDE-02-5: Covers Scenario 5: Signature Conflicts / App Not Installed', () => {
      const tb = engine.renderTroubleshooting();
      const c5 = tb.scenarios.find(s => s.case === 5);
      assert.ok(c5, 'Case 5 must exist');
      assertTextContains(c5.title, 'Signature Conflicts');
      assertTextContains(c5.solution, 'uninstall');
    });
  });
});
