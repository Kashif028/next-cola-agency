/**
 * Tier 4: 03_sideload_troubleshooting_journey.test.js - Sideload Troubleshooting Journeys
 * Covers: SCEN-08 to SCEN-10 (3 tests)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertTextContains } = require('../helpers/assertions.js');

describe('Tier 4: Sideload Troubleshooting Journeys', () => {
  let engine;

  beforeEach(() => {
    engine = new WebsiteEngine();
  });

  it('T4-SCEN-08: Driver encounters "Install Unknown Apps" security notice and resolves via scenario 4', () => {
    const tb = engine.renderTroubleshooting();
    const scenario4 = tb.scenarios.find(s => s.case === 4);

    assert.ok(scenario4);
    assertTextContains(scenario4.title, 'Permission Issues');
    assertTextContains(scenario4.solution, 'Settings > Apps > Special App Access > Install Unknown Apps');
  });

  it('T4-SCEN-09: Driver encounters package signature conflict and resolves via clean uninstall guidance', () => {
    const tb = engine.renderTroubleshooting();
    const scenario5 = tb.scenarios.find(s => s.case === 5);

    assert.ok(scenario5);
    assertTextContains(scenario5.title, 'Signature Conflicts');
    assertTextContains(scenario5.solution, 'completely uninstall the previous app version');
  });

  it('T4-SCEN-10: Driver encounters incomplete download on cellular data and follows scenario 1 cleanup', () => {
    const tb = engine.renderTroubleshooting();
    const scenario1 = tb.scenarios.find(s => s.case === 1);

    assert.ok(scenario1);
    assertTextContains(scenario1.title, 'Incomplete Downloads');
    assertTextContains(scenario1.solution, 'Delete the partial .crdownload file');
  });
});
