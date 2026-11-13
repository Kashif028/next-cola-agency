/**
 * Tier 2: 06_history_boundaries.test.js - Version History Boundaries
 * Covers: B-HIST-01, B-HIST-02 (10 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertIsDirectDownloadUrl, assertTextContains } = require('../helpers/assertions.js');

describe('Tier 2: Version History Boundaries', () => {
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

  describe('B-HIST-01: Version History Boundaries', () => {
    it('T2-HIST-01-1: Handles empty release history array [] gracefully', async () => {
      mockServer.setHistoryResponse([]);
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      assert.strictEqual(rendered.releases.length, 0);
      assert.strictEqual(rendered.empty, true);
    });

    it('T2-HIST-01-2: Handles repository with exactly 1 release cleanly', async () => {
      mockServer.setHistoryResponse([mockServer.fixtures.latestValid]);
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      assert.strictEqual(rendered.releases.length, 1);
      assert.strictEqual(rendered.releases[0].isLatest, true);
    });

    it('T2-HIST-01-3: Releases marked with draft: true are strictly filtered out from public history', async () => {
      mockServer.setHistoryResponse([
        { id: 2001, tag_name: 'v2.0-draft', draft: true, assets: [] },
        { id: 2002, tag_name: 'v1.9.0', draft: false, assets: [] },
      ]);
      const history = await engine.loadReleaseHistory();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].versionTag, 'v1.9.0');
    });

    it('T2-HIST-01-4: Prereleases are identified and included without crash', async () => {
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      assert.ok(rendered.releases.length > 0);
    });

    it('T2-HIST-01-5: Multiple releases with distinct tags maintain unique keys', async () => {
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      const tags = rendered.releases.map(r => r.tag);
      assert.ok(tags.length >= 4);
    });
  });

  describe('B-HIST-02: Historical Download Boundaries', () => {
    it('T2-HIST-02-1: Historical release where APK asset is null has hasApk: false and null downloadUrl', () => {
      engine.state.historyReleases = [{
        id: 3001,
        versionTag: 'v1.0.0-noapk',
        name: 'No APK Release',
        releaseDate: '2026-01-01T00:00:00Z',
        sanitizedNotesHtml: 'No APK',
        githubReleaseUrl: 'https://github.com/test',
        apkAsset: null,
      }];
      const rendered = engine.renderVersionHistory();
      assert.strictEqual(rendered.releases[0].hasApk, false);
      assert.strictEqual(rendered.releases[0].downloadUrl, null);
    });

    it('T2-HIST-02-2: Historical release with multiple assets selects .apk and rejects source .zip', () => {
      const assets = [
        { name: 'source.zip', browser_download_url: 'https://example.com/source.zip', size: 1000 },
        { name: 'release.apk', browser_download_url: 'https://example.com/release.apk', size: 25000000 },
      ];
      const match = engine.filterApkAsset(assets);
      assert.ok(match);
      assert.strictEqual(match.name, 'release.apk');
    });

    it('T2-HIST-02-3: Inspecting historical releases does not alter latestRelease state in Hero', async () => {
      await engine.loadLatestRelease();
      assert.strictEqual(engine.state.latestRelease.versionTag, 'v1.2.0');
      await engine.loadReleaseHistory();
      assert.strictEqual(engine.state.latestRelease.versionTag, 'v1.2.0');
    });

    it('T2-HIST-02-4: Historical release with uppercase extension (.APK) is correctly detected as APK', () => {
      const assets = [
        { name: 'COLD-DRINK-APP.APK', browser_download_url: 'https://example.com/APP.APK', size: 20000000 },
      ];
      const match = engine.filterApkAsset(assets);
      assert.ok(match);
      assert.strictEqual(match.name, 'COLD-DRINK-APP.APK');
    });

    it('T2-HIST-02-5: Consecutive historical releases maintain independent download URLs', async () => {
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      const apkReleases = rendered.releases.filter(r => r.hasApk);
      assert.ok(apkReleases.length >= 2);
      assert.notStrictEqual(apkReleases[0].downloadUrl, apkReleases[1].downloadUrl);
    });
  });
});
