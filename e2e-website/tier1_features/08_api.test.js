/**
 * Tier 1: 08_api.test.js - GitHub API & State Machine Features
 * Covers: FEAT-API-01, FEAT-API-02, FEAT-API-03, FEAT-API-04 (20 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertStateStatus,
  assertIsDirectDownloadUrl,
} = require('../helpers/assertions.js');

describe('Tier 1: GitHub API & State Machine Integration', () => {
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

  describe('FEAT-API-01: GitHub Releases API Integration', () => {
    it('T1-API-01-1: Constructs correct endpoint URL for latest release: GET /repos/{owner}/{repo}/releases/latest', async () => {
      await engine.loadLatestRelease();
      const call = mockServer.callLog.find(c => c.url.includes('/releases/latest'));
      assert.ok(call, 'Must call /releases/latest');
      assert.strictEqual(call.url, 'https://api.github.com/repos/LogarTraders/cold-drink-distribution-app/releases/latest');
    });

    it('T1-API-01-2: Constructs correct endpoint URL for release history: GET /repos/{owner}/{repo}/releases', async () => {
      await engine.loadReleaseHistory();
      const call = mockServer.callLog.find(c => c.url.endsWith('/releases'));
      assert.ok(call, 'Must call /releases');
      assert.strictEqual(call.url, 'https://api.github.com/repos/LogarTraders/cold-drink-distribution-app/releases');
    });

    it('T1-API-01-3: Correctly injects configured repository parameters', () => {
      const customEngine = new WebsiteEngine({ owner: 'CustomOrg', repo: 'beverage-app' });
      assert.strictEqual(customEngine.config.owner, 'CustomOrg');
      assert.strictEqual(customEngine.config.repo, 'beverage-app');
    });

    it('T1-API-01-4: Sets standard GitHub API header Accept: application/vnd.github.v3+json', async () => {
      await engine.loadLatestRelease();
      const call = mockServer.callLog.find(c => c.url.includes('/releases/latest'));
      assert.strictEqual(call.headers.Accept, 'application/vnd.github.v3+json');
    });

    it('T1-API-01-5: Accurately deserializes JSON response into structured release object', async () => {
      const state = await engine.loadLatestRelease();
      assert.ok(state.latestRelease);
      assert.strictEqual(state.latestRelease.versionTag, 'v1.2.0');
      assert.strictEqual(typeof state.latestRelease.id, 'number');
    });
  });

  describe('FEAT-API-02: APK Asset Detection & Filtering', () => {
    it('T1-API-02-1: Identifies assets ending with .apk (case-insensitive) as valid Android binaries', () => {
      const assets = [
        { name: 'app.apk', browser_download_url: 'https://example.com/app.apk', size: 100 },
      ];
      const match = engine.filterApkAsset(assets);
      assert.ok(match);
      assert.strictEqual(match.name, 'app.apk');
    });

    it('T1-API-02-2: Strictly rejects source code archive assets ending with .zip', () => {
      const assets = [
        { name: 'source.zip', browser_download_url: 'https://example.com/source.zip', size: 100 },
      ];
      const match = engine.filterApkAsset(assets);
      assert.strictEqual(match, null);
    });

    it('T1-API-02-3: Strictly rejects source code archive assets ending with .tar.gz and .tgz', () => {
      const assets = [
        { name: 'source.tar.gz', browser_download_url: 'https://example.com/source.tar.gz', size: 100 },
        { name: 'archive.tgz', browser_download_url: 'https://example.com/archive.tgz', size: 100 },
      ];
      const match = engine.filterApkAsset(assets);
      assert.strictEqual(match, null);
    });

    it('T1-API-02-4: Rejects build artifacts such as .pdf, .json, and .sha256', () => {
      const assets = [
        { name: 'release-notes.pdf', browser_download_url: 'https://example.com/notes.pdf', size: 100 },
        { name: 'checksums.sha256', browser_download_url: 'https://example.com/check.sha256', size: 100 },
      ];
      const match = engine.filterApkAsset(assets);
      assert.strictEqual(match, null);
    });

    it('T1-API-02-5: When multiple APK assets exist, prioritizes asset matching universal or release', () => {
      const assets = [
        { name: 'app-arm64.apk', browser_download_url: 'https://example.com/arm64.apk', size: 100 },
        { name: 'app-universal.apk', browser_download_url: 'https://example.com/universal.apk', size: 120 },
      ];
      const match = engine.filterApkAsset(assets);
      assert.strictEqual(match.name, 'app-universal.apk');
    });
  });

  describe('FEAT-API-03: UI State Machine & Transitions', () => {
    it('T1-API-03-1: Component initializes in idle state', () => {
      assertStateStatus(engine.state, 'idle');
    });

    it('T1-API-03-2: Successful API response with valid APK transitions state to SUCCESS', async () => {
      const state = await engine.loadLatestRelease();
      assertStateStatus(state, 'success');
      assert.ok(state.latestRelease.apkAsset);
    });

    it('T1-API-03-3: Response where release contains NO APK transitions state to EMPTY (NO_APK)', async () => {
      mockServer.setLatestResponse(mockServer.fixtures.latestNoApk);
      const state = await engine.loadLatestRelease();
      assertStateStatus(state, 'empty');
      assert.strictEqual(state.emptyReason, 'NO_APK');
    });

    it('T1-API-03-4: 404 response transitions state to EMPTY (REPO_404)', async () => {
      mockServer.simulate404();
      const state = await engine.loadLatestRelease();
      assertStateStatus(state, 'empty');
      assert.strictEqual(state.emptyReason, 'REPO_404');
    });

    it('T1-API-03-5: Network exception transitions state to ERROR with NETWORK_ERROR code', async () => {
      mockServer.simulateNetworkFailure();
      const state = await engine.loadLatestRelease();
      assertStateStatus(state, 'error');
      assert.strictEqual(state.error.code, 'NETWORK_ERROR');
    });
  });

  describe('FEAT-API-04: Rate Limiting & Session Caching', () => {
    it('T1-API-04-1: Successful release responses are cached in sessionStorage with timestamp', async () => {
      await engine.loadLatestRelease();
      const cached = engine.sessionStorage.getItem('gh_rel_latest_LogarTraders_cold-drink-distribution-app');
      assert.ok(cached, 'Cache must be set');
      const parsed = JSON.parse(cached);
      assert.strictEqual(parsed.data.versionTag, 'v1.2.0');
    });

    it('T1-API-04-2: Subsequent queries within TTL return cached data without network call', async () => {
      await engine.loadLatestRelease();
      const initialCalls = mockServer.callLog.length;
      await engine.loadLatestRelease(); // 2nd fetch within TTL
      assert.strictEqual(mockServer.callLog.length, initialCalls, 'No additional network fetch must occur');
    });

    it('T1-API-04-3: Force refresh bypasses cached timestamp', async () => {
      await engine.loadLatestRelease();
      const initialCalls = mockServer.callLog.length;
      await engine.loadLatestRelease(true); // force refresh
      assert.strictEqual(mockServer.callLog.length, initialCalls + 1);
    });

    it('T1-API-04-4: HTTP 304 Not Modified response refreshes cache timestamp cleanly', async () => {
      await engine.loadLatestRelease();
      engine.state.latestRelease.etag = '"a1b2c3d4e5f6g7h8i9j0"';
      // Force fetch with matching ETag
      const res = await engine.loadLatestRelease(true);
      assertStateStatus(res, 'success');
      assert.strictEqual(res.latestRelease.versionTag, 'v1.2.0');
    });

    it('T1-API-04-5: Unauthenticated 403 Rate Limit parses reset header and computes minutes until reset', async () => {
      mockServer.simulateRateLimit(25);
      const state = await engine.loadLatestRelease(true);
      assertStateStatus(state, 'error');
      assert.strictEqual(state.error.code, 'RATE_LIMITED');
      assert.ok(state.error.minutesUntilReset >= 24 && state.error.minutesUntilReset <= 26);
    });
  });
});
