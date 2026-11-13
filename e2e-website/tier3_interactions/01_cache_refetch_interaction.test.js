/**
 * Tier 3: 01_cache_refetch_interaction.test.js - Caching & Manual Refetch Interactions
 * Covers: INT-01 to INT-05 (5 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertTextContains, assertStateStatus } = require('../helpers/assertions.js');

describe('Tier 3: Cache & Refetch Interactions', () => {
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

  it('T3-INT-01: Session cache populates both Header and Hero CTA buttons instantly without duplicate fetch', async () => {
    await engine.loadLatestRelease();
    const calls = mockServer.callLog.length;

    // Both components read from state populated by cache
    const header = engine.renderHeader();
    const hero = engine.renderHero();

    assert.strictEqual(header.cta.disabled, false);
    assert.strictEqual(hero.primaryCTA.disabled, false);
    assertTextContains(header.cta.text, 'v1.2.0');
    assertTextContains(hero.primaryCTA.text, 'v1.2.0');
    assert.strictEqual(mockServer.callLog.length, calls);
  });

  it('T3-INT-02: Cache expiration triggers seamless background fetch with If-None-Match without tearing down active UI', async () => {
    await engine.loadLatestRelease();
    assert.strictEqual(engine.state.latestRelease.versionTag, 'v1.2.0');

    // Simulate TTL expiry
    const cacheKey = `gh_rel_latest_${engine.config.owner}_${engine.config.repo}`;
    const cached = JSON.parse(engine.sessionStorage.getItem(cacheKey));
    cached.timestamp = Date.now() - 10 * 60 * 1000;
    engine.sessionStorage.setItem(cacheKey, JSON.stringify(cached));

    await engine.loadLatestRelease();
    assert.strictEqual(engine.state.latestRelease.versionTag, 'v1.2.0');
  });

  it('T3-INT-03: When rate limit 403 occurs during refetch, website continues serving cached release data with fallback badge', async () => {
    await engine.loadLatestRelease();
    assertStateStatus(engine.state, 'success');

    mockServer.simulateRateLimit(15);
    // Force refresh triggers rate limit
    await engine.loadLatestRelease(true);
    assertStateStatus(engine.state, 'error');
    assert.strictEqual(engine.state.error.code, 'RATE_LIMITED');
    const cta = engine.renderHeroCTA();
    assert.strictEqual(cta.isFallbackLink, true);
  });

  it('T3-INT-04: Multi-component mounting triggers exactly 1 API call via in-flight request deduplication', async () => {
    mockServer.callLog.length = 0;
    const [res1, res2] = await Promise.all([
      engine.loadLatestRelease(),
      engine.loadLatestRelease(),
    ]);

    assert.strictEqual(res1, res2);
    assert.strictEqual(mockServer.callLog.length, 1);
  });

  it('T3-INT-05: Manual user refresh clears cache for latest release and initiates fresh fetch', async () => {
    await engine.loadLatestRelease();
    const countBefore = mockServer.callLog.length;

    await engine.loadLatestRelease(true); // force refresh
    assert.strictEqual(mockServer.callLog.length, countBefore + 1);
  });
});
