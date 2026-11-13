/**
 * Tier 3: 05_state_transition_interaction.test.js - UI State Machine Lifecycle Transitions
 * Covers: INT-21 to INT-25 (5 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertStateStatus, assertTextContains } = require('../helpers/assertions.js');

describe('Tier 3: UI State Machine Transitions', () => {
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

  it('T3-INT-21: Full lifecycle recovery: IDLE -> LOADING -> ERROR_RATE_LIMITED -> retry -> SUCCESS', async () => {
    assertStateStatus(engine.state, 'idle');

    mockServer.simulateRateLimit(10);
    await engine.loadLatestRelease(true);
    assertStateStatus(engine.state, 'error');
    assert.strictEqual(engine.state.error.code, 'RATE_LIMITED');

    mockServer.reset();
    await engine.loadLatestRelease(true);
    assertStateStatus(engine.state, 'success');
    assert.strictEqual(engine.state.latestRelease.versionTag, 'v1.2.0');
  });

  it('T3-INT-22: Network offline to online recovery: IDLE -> LOADING -> ERROR_NETWORK -> online -> retry -> SUCCESS', async () => {
    assertStateStatus(engine.state, 'idle');

    mockServer.simulateNetworkFailure();
    await engine.loadLatestRelease(true);
    assertStateStatus(engine.state, 'error');
    assert.strictEqual(engine.state.error.code, 'NETWORK_ERROR');

    mockServer.clearNetworkFailure();
    await engine.loadLatestRelease(true);
    assertStateStatus(engine.state, 'success');
  });

  it('T3-INT-23: Empty repository handling: IDLE -> LOADING -> EMPTY_NO_RELEASE -> CTAs disabled, GitHub link active', async () => {
    mockServer.simulate404();
    await engine.loadLatestRelease(true);
    assertStateStatus(engine.state, 'empty');
    assert.strictEqual(engine.state.emptyReason, 'REPO_404');

    const heroCTA = engine.renderHeroCTA();
    assert.strictEqual(heroCTA.disabled, true);

    const card = engine.renderAppInfoCard();
    assert.ok(card.sourceLink.href.startsWith('https://github.com/'));
  });

  it('T3-INT-24: Release with No APK handling: IDLE -> LOADING -> EMPTY_NO_APK -> CTA warns and directs to GitHub', async () => {
    mockServer.setLatestResponse(mockServer.fixtures.latestNoApk);
    await engine.loadLatestRelease(true);
    assertStateStatus(engine.state, 'empty');
    assert.strictEqual(engine.state.emptyReason, 'NO_APK');

    const heroCTA = engine.renderHeroCTA();
    assert.strictEqual(heroCTA.disabled, true);
    assertTextContains(heroCTA.text, 'No APK');
  });

  it('T3-INT-25: Synchronized state distribution: State machine coordinates Header, Hero, Card, History simultaneously', async () => {
    await engine.loadLatestRelease();
    await engine.loadReleaseHistory();

    const header = engine.renderHeader();
    const hero = engine.renderHero();
    const card = engine.renderAppInfoCard();
    const history = engine.renderVersionHistory();

    assert.strictEqual(header.cta.disabled, false);
    assert.strictEqual(hero.primaryCTA.disabled, false);
    assert.strictEqual(card.version, 'v1.2.0');
    assert.strictEqual(history.releases[0].tag, 'v1.2.0');
  });
});
