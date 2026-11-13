/**
 * Tier 4: 04_offline_recovery_journey.test.js - Offline & Rate Limit Recovery Journeys
 * Covers: SCEN-11 to SCEN-13 (3 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertStateStatus, assertTextContains } = require('../helpers/assertions.js');

describe('Tier 4: Offline & Error Recovery Journeys', () => {
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

  it('T4-SCEN-11: Portal handles network outage gracefully with friendly offline error state', async () => {
    mockServer.simulateNetworkFailure();
    const state = await engine.loadLatestRelease();

    assertStateStatus(state, 'error');
    assert.strictEqual(state.error.code, 'NETWORK_ERROR');
    assertTextContains(state.error.message, 'Network connectivity failure');

    const hero = engine.renderHero();
    assert.strictEqual(hero.primaryCTA.disabled, true);
  });

  it('T4-SCEN-12: Seamless reconnection restores live release details and re-enables download button', async () => {
    // Phase 1: Outage
    mockServer.simulateNetworkFailure();
    await engine.loadLatestRelease();
    assertStateStatus(engine.state, 'error');

    // Phase 2: Depot Wi-Fi connected
    mockServer.clearNetworkFailure();
    const recovered = await engine.loadLatestRelease(true);

    assertStateStatus(recovered, 'success');
    assert.strictEqual(recovered.latestRelease.versionTag, 'v1.2.0');

    const hero = engine.renderHero();
    assert.strictEqual(hero.primaryCTA.disabled, false);
    assertTextContains(hero.primaryCTA.text, 'v1.2.0');
  });

  it('T4-SCEN-13: GitHub 403 Rate Limit provides clear countdown and direct GitHub fallback link', async () => {
    mockServer.simulateRateLimit(20);
    const state = await engine.loadLatestRelease(true);

    assertStateStatus(state, 'error');
    assert.strictEqual(state.error.code, 'RATE_LIMITED');
    assert.ok(state.error.minutesUntilReset >= 19);

    const cta = engine.renderHeroCTA();
    assert.strictEqual(cta.isFallbackLink, true);
    assertTextContains(cta.text, 'GitHub Releases');
    assert.ok(cta.href.includes('/releases'));
  });
});
