/**
 * Tier 3: 03_history_filtering_interaction.test.js - Version History & Asset Filtering Interactions
 * Covers: INT-11 to INT-15 (5 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertIsDirectDownloadUrl, assertTextEquals, assertIsXssClean } = require('../helpers/assertions.js');

describe('Tier 3: History & Asset Filtering Interactions', () => {
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

  it('T3-INT-11: Asset filtering runs across historical releases, extracting .apk and excluding .zip/.tar.gz', async () => {
    const history = await engine.loadReleaseHistory();
    for (const rel of history) {
      if (rel.apkAsset) {
        assertIsDirectDownloadUrl(rel.apkAsset.downloadUrl);
        assert.strictEqual(/\.(zip|tar\.gz)$/i.test(rel.apkAsset.downloadUrl), false);
      }
    }
  });

  it('T3-INT-12: The latest release in Version History perfectly matches version tag, date, and size in App Info Card', async () => {
    await engine.loadLatestRelease();
    await engine.loadReleaseHistory();

    const card = engine.renderAppInfoCard();
    const history = engine.renderVersionHistory();

    const topHist = history.releases[0];
    assertTextEquals(card.version, topHist.tag);
    assertTextEquals(card.releaseDate, topHist.date);
    assertTextEquals(card.fileSize, topHist.apkSize);
  });

  it('T3-INT-13: Historical release containing both universal and arm64 APKs prioritizes universal APK', () => {
    const assets = [
      { name: 'app-arm64-v8a.apk', size: 22000000, browser_download_url: 'https://example.com/arm64.apk' },
      { name: 'app-universal.apk', size: 28000000, browser_download_url: 'https://example.com/universal.apk' },
      { name: 'app-armeabi-v7a.apk', size: 20000000, browser_download_url: 'https://example.com/v7a.apk' },
    ];
    const match = engine.filterApkAsset(assets);
    assert.strictEqual(match.name, 'app-universal.apk');
  });

  it('T3-INT-14: Historical release notes containing raw markdown/HTML pass through identical XSS pipeline', () => {
    const dirtyHistoryNotes = 'Release v1.0.0 with <script>alert("hack")</script> and normal changelog.';
    const clean = engine.sanitizeHtml(dirtyHistoryNotes);
    assertIsXssClean(clean);
    assert.strictEqual(clean.includes('normal changelog'), true);
  });

  it('T3-INT-15: Downloading older release initiates download of that asset without modifying latestRelease state', async () => {
    await engine.loadLatestRelease();
    await engine.loadReleaseHistory();

    const rendered = engine.renderVersionHistory();
    const olderRelease = rendered.releases.find(r => r.tag === 'v1.1.0');

    assert.ok(olderRelease);
    assert.strictEqual(olderRelease.isLatest, false);
    assert.ok(olderRelease.downloadUrl.includes('v1.1.0'));
    // Latest release state remains v1.2.0
    assert.strictEqual(engine.state.latestRelease.versionTag, 'v1.2.0');
  });
});
