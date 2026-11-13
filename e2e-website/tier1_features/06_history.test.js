/**
 * Tier 1: 06_history.test.js - Version History Features
 * Covers: FEAT-HIST-01, FEAT-HIST-02 (10 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertTextEquals,
  assertTextContains,
  assertIsDirectDownloadUrl,
} = require('../helpers/assertions.js');

describe('Tier 1: Version History Features', () => {
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

  describe('FEAT-HIST-01: Version History Release List', () => {
    it('T1-HIST-01-1: Fetches and renders list of past releases from GitHub /releases endpoint', async () => {
      const history = await engine.loadReleaseHistory();
      assert.ok(history.length >= 4, 'Must fetch past releases');
      const rendered = engine.renderVersionHistory();
      assert.strictEqual(rendered.empty, false);
      assert.strictEqual(rendered.id, 'versions');
    });

    it('T1-HIST-01-2: Releases are ordered in reverse chronological order', async () => {
      const history = await engine.loadReleaseHistory();
      assert.strictEqual(history[0].versionTag, 'v1.2.0');
      assert.strictEqual(history[1].versionTag, 'v1.1.0');
      assert.strictEqual(history[2].versionTag, 'v1.0.1');
    });

    it('T1-HIST-01-3: Each release card displays version tag name, title, and formatted release date', async () => {
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      const first = rendered.releases[0];
      assertTextEquals(first.tag, 'v1.2.0');
      assertTextContains(first.name, 'Release 1.2.0');
      assertTextEquals(first.date, 'November 10, 2026');
    });

    it('T1-HIST-01-4: Release notes excerpt is displayed for each past version with safe Markdown formatting', async () => {
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      for (const rel of rendered.releases) {
        assert.ok(typeof rel.notes === 'string', 'Notes must be string');
      }
    });

    it('T1-HIST-01-5: Top-most release is marked with isLatest flag', async () => {
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      assert.strictEqual(rendered.releases[0].isLatest, true);
      assert.strictEqual(rendered.releases[1].isLatest, false);
    });
  });

  describe('FEAT-HIST-02: Historical APK Download Links', () => {
    it('T1-HIST-02-1: Each historical release item with an APK asset includes an independent download button', async () => {
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      const rel = rendered.releases[0];
      assert.strictEqual(rel.hasApk, true);
      assert.ok(rel.downloadUrl);
    });

    it('T1-HIST-02-2: Historical download button links directly to that specific release APK asset', async () => {
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      const rel1 = rendered.releases[1]; // v1.1.0
      assertIsDirectDownloadUrl(rel1.downloadUrl);
      assertTextContains(rel1.downloadUrl, 'v1.1.0');
    });

    it('T1-HIST-02-3: Button displays file size for that specific historical APK build', async () => {
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      assert.ok(rendered.releases[0].apkSize);
      assertTextContains(rendered.releases[0].apkSize, 'MB');
    });

    it('T1-HIST-02-4: Source code archives (.zip and .tar.gz) are excluded from history downloads', async () => {
      await engine.loadReleaseHistory();
      const rendered = engine.renderVersionHistory();
      for (const rel of rendered.releases) {
        if (rel.downloadUrl) {
          assert.strictEqual(/\.(zip|tar\.gz)$/i.test(rel.downloadUrl), false);
        }
      }
    });

    it('T1-HIST-02-5: Releases without an APK asset display hasApk: false', () => {
      engine.state.historyReleases = [{
        id: 9999,
        versionTag: 'v0.1-docs',
        name: 'Documentation Only',
        releaseDate: '2026-01-01T00:00:00Z',
        sanitizedNotesHtml: 'No APK released.',
        githubReleaseUrl: 'https://github.com/test',
        apkAsset: null,
      }];
      const rendered = engine.renderVersionHistory();
      assert.strictEqual(rendered.releases[0].hasApk, false);
      assert.strictEqual(rendered.releases[0].downloadUrl, null);
    });
  });
});
