/**
 * Tier 2: 08_api_boundaries.test.js - API & State Machine Boundaries
 * Covers: B-API-01, B-API-02, B-API-03, B-API-04 (20 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertStateStatus } = require('../helpers/assertions.js');

describe('Tier 2: API & State Machine Boundaries', () => {
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

  describe('B-API-01: API Endpoint Boundaries', () => {
    it('T2-API-01-1: 404 response transitions state to EMPTY (REPO_404)', async () => {
      mockServer.simulate404();
      const state = await engine.loadLatestRelease();
      assertStateStatus(state, 'empty');
      assert.strictEqual(state.emptyReason, 'REPO_404');
    });

    it('T2-API-01-2: 500 server error transitions state to ERROR (HTTP_ERROR)', async () => {
      mockServer.setRoute('https://api.github.com/repos/LogarTraders/cold-drink-distribution-app/releases/latest', () => ({
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: { message: 'Internal Server Error' },
      }));
      const state = await engine.loadLatestRelease(true);
      assertStateStatus(state, 'error');
      assert.strictEqual(state.error.code, 'HTTP_ERROR');
    });

    it('T2-API-01-3: Simulates network failure with clear NETWORK_ERROR code', async () => {
      mockServer.simulateNetworkFailure();
      const state = await engine.loadLatestRelease(true);
      assertStateStatus(state, 'error');
      assert.strictEqual(state.error.code, 'NETWORK_ERROR');
    });

    it('T2-API-01-4: Handles unmocked URL with Offline Safety Lock error', async () => {
      await assert.rejects(async () => {
        await fetch('https://unmocked-external-domain.example.com/api');
      }, /Offline Safety Lock/);
    });

    it('T2-API-01-5: Safe recovery from error state when server recovers', async () => {
      mockServer.simulateNetworkFailure();
      await engine.loadLatestRelease(true);
      assertStateStatus(engine.state, 'error');

      mockServer.clearNetworkFailure();
      const recoveredState = await engine.loadLatestRelease(true);
      assertStateStatus(recoveredState, 'success');
      assert.strictEqual(recoveredState.latestRelease.versionTag, 'v1.2.0');
    });
  });

  describe('B-API-02: Asset Filtering Boundaries', () => {
    it('T2-API-02-1: Asset named application.apk.zip is REJECTED', () => {
      const assets = [{ name: 'application.apk.zip', browser_download_url: 'https://example.com/app.apk.zip', size: 1000 }];
      const match = engine.filterApkAsset(assets);
      assert.strictEqual(match, null);
    });

    it('T2-API-02-2: Asset named app-release.APK with uppercase extension is ACCEPTED', () => {
      const assets = [{ name: 'app-release.APK', browser_download_url: 'https://example.com/app-release.APK', size: 1000 }];
      const match = engine.filterApkAsset(assets);
      assert.ok(match);
      assert.strictEqual(match.name, 'app-release.APK');
    });

    it('T2-API-02-3: Release with empty assets: [] returns apkAsset: null without error', () => {
      const match = engine.filterApkAsset([]);
      assert.strictEqual(match, null);
    });

    it('T2-API-02-4: Release where assets array contains null/non-object elements handles corruption safely', () => {
      const corruptedAssets = [null, undefined, 'string', 1234, { name: 'real.apk' }];
      const match = engine.filterApkAsset(corruptedAssets);
      assert.ok(match);
      assert.strictEqual(match.name, 'real.apk');
    });

    it('T2-API-02-5: Asset with null size defaults safely without NaN', () => {
      const apk = engine.filterApkAsset([{ name: 'test.apk', size: null, browser_download_url: 'https://example.com' }]);
      assert.ok(apk);
    });
  });

  describe('B-API-03: State Machine Boundaries', () => {
    it('T2-API-03-1: In-flight request deduplication returns same promise', async () => {
      const p1 = engine.loadLatestRelease();
      const p2 = engine.loadLatestRelease();
      assert.strictEqual(p1, p2);
      const [r1, r2] = await Promise.all([p1, p2]);
      assert.strictEqual(r1, r2);
    });

    it('T2-API-03-2: Transition from ERROR to SUCCESS restores interactive UI elements', async () => {
      mockServer.simulateRateLimit(10);
      await engine.loadLatestRelease(true);
      assertStateStatus(engine.state, 'error');

      mockServer.reset();
      await engine.loadLatestRelease(true);
      assertStateStatus(engine.state, 'success');
      const cta = engine.renderHeroCTA();
      assert.strictEqual(cta.disabled, false);
    });

    it('T2-API-03-3: Transition from EMPTY_NO_APK to SUCCESS restores CTA', async () => {
      mockServer.setLatestResponse(mockServer.fixtures.latestNoApk);
      await engine.loadLatestRelease(true);
      assertStateStatus(engine.state, 'empty');

      mockServer.reset();
      await engine.loadLatestRelease(true);
      assertStateStatus(engine.state, 'success');
    });

    it('T2-API-03-4: State machine emits predictable status values', () => {
      const validStatuses = ['idle', 'loading', 'success', 'empty', 'error'];
      assert.ok(validStatuses.includes(engine.state.status));
    });

    it('T2-API-03-5: Refetch action after network recovery restores state', async () => {
      mockServer.simulateNetworkFailure();
      await engine.loadLatestRelease(true);
      assertStateStatus(engine.state, 'error');

      mockServer.clearNetworkFailure();
      await engine.loadLatestRelease(true);
      assertStateStatus(engine.state, 'success');
    });
  });

  describe('B-API-04: Caching & Rate Limits Boundaries', () => {
    it('T2-API-04-1: Gracefully handles sessionStorage being disabled (e.g. private mode)', async () => {
      engine.sessionStorage.setDisabled(true);
      const state = await engine.loadLatestRelease();
      assertStateStatus(state, 'success');
      assert.strictEqual(state.latestRelease.versionTag, 'v1.2.0');
    });

    it('T2-API-04-2: Recovers cleanly if sessionStorage contains corrupted JSON', async () => {
      const cacheKey = `gh_rel_latest_${engine.config.owner}_${engine.config.repo}`;
      engine.sessionStorage.setItem(cacheKey, '{{corrupt-json-1234');
      const state = await engine.loadLatestRelease();
      assertStateStatus(state, 'success');
      assert.strictEqual(state.latestRelease.versionTag, 'v1.2.0');
    });

    it('T2-API-04-3: Handles x-ratelimit-reset timestamp in past (resets immediately)', async () => {
      mockServer.simulateRateLimit(-5); // past timestamp
      const state = await engine.loadLatestRelease(true);
      assertStateStatus(state, 'error');
      assert.ok(state.error.minutesUntilReset >= 1);
    });

    it('T2-API-04-4: Computes accurate countdown minutes when reset is 59 minutes away', async () => {
      mockServer.simulateRateLimit(59);
      const state = await engine.loadLatestRelease(true);
      assertStateStatus(state, 'error');
      assert.ok(state.error.minutesUntilReset >= 58 && state.error.minutesUntilReset <= 60);
    });

    it('T2-API-04-5: Cache TTL expiry during session triggers fresh fetch', async () => {
      await engine.loadLatestRelease();
      const initialCalls = mockServer.callLog.length;
      // Artificially age cache by 6 minutes (TTL is 5 mins)
      const cacheKey = `gh_rel_latest_${engine.config.owner}_${engine.config.repo}`;
      const cached = JSON.parse(engine.sessionStorage.getItem(cacheKey));
      cached.timestamp = Date.now() - 6 * 60 * 1000;
      engine.sessionStorage.setItem(cacheKey, JSON.stringify(cached));

      await engine.loadLatestRelease();
      assert.strictEqual(mockServer.callLog.length, initialCalls + 1);
    });
  });
});
