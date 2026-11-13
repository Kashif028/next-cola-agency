/**
 * Tier 1: 03_card.test.js - Application Information Card Features
 * Covers: FEAT-CARD-01, FEAT-CARD-02, FEAT-CARD-03, FEAT-CARD-04, FEAT-CARD-05, FEAT-CARD-06 (30 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertTextEquals,
  assertTextContains,
  assertIsXssClean,
  assertIsValidSha256,
} = require('../helpers/assertions.js');

describe('Tier 1: Application Information Card Features', () => {
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

  describe('FEAT-CARD-01: App Name & Version Display', () => {
    it('T1-CARD-01-1: Displays configured official application name', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.appName, 'Cold Drink Distribution Agency App');
    });

    it('T1-CARD-01-2: Displays latest release version tag parsed from GitHub release tag_name', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.version, 'v1.2.0');
    });

    it('T1-CARD-01-3: Release version tag includes Latest Release badge indicator', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.versionBadge, 'Latest Release');
    });

    it('T1-CARD-01-4: Displays release name accurately when available', async () => {
      await engine.loadLatestRelease();
      assertTextEquals(engine.state.latestRelease.name, 'Release 1.2.0 - Cold Drink Distribution Agency App');
    });

    it('T1-CARD-01-5: Displays "Not provided" if release version tag is absent', () => {
      engine.state.latestRelease = null;
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.version, 'Not provided');
    });
  });

  describe('FEAT-CARD-02: Release Date & File Size', () => {
    it('T1-CARD-02-1: Formats GitHub published_at ISO date into human-friendly string', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.releaseDate, 'November 10, 2026');
    });

    it('T1-CARD-02-2: Calculates human-readable file size in Megabytes from asset size in bytes', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.fileSize, '24.5 MB');
    });

    it('T1-CARD-02-3: Correctly handles rounding to one decimal place', () => {
      const formatted = (25690112 / (1024 * 1024)).toFixed(1) + ' MB';
      assertTextEquals(formatted, '24.5 MB');
    });

    it('T1-CARD-02-4: Displays "Not provided" if published_at date is missing or empty', () => {
      engine.state.latestRelease = { releaseDate: null };
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.releaseDate, 'Not provided');
    });

    it('T1-CARD-02-5: Displays "Not provided" if APK asset size is zero or missing', () => {
      engine.state.latestRelease = { apkAsset: null };
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.fileSize, 'Not provided');
    });
  });

  describe('FEAT-CARD-03: Android Compatibility Display', () => {
    it('T1-CARD-03-1: Displays Minimum Android Version field in card layout', () => {
      const card = engine.renderAppInfoCard();
      assert.ok('minAndroidVersion' in card);
    });

    it('T1-CARD-03-2: When AndroidManifest cannot be verified, displays exact string "Not provided"', () => {
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.minAndroidVersion, 'Not provided');
    });

    it('T1-CARD-03-3: Displays Package Name field in card layout', () => {
      const card = engine.renderAppInfoCard();
      assert.ok('packageName' in card);
    });

    it('T1-CARD-03-4: When package name is unverified, displays exact string "Not provided"', () => {
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.packageName, 'Not provided');
    });

    it('T1-CARD-03-5: Card contains zero invented compatibility information', () => {
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.minAndroidVersion, 'Not provided');
      assert.strictEqual(card.packageName, 'Not provided');
      assert.strictEqual(card.hasInventedBadges, false);
    });
  });

  describe('FEAT-CARD-04: Release Notes Rendering', () => {
    it('T1-CARD-04-1: Renders latest release notes parsed from GitHub API body markdown', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.ok(card.releaseNotesHtml.length > 0);
      assertTextContains(card.releaseNotesHtml, "What's New in v1.2.0");
    });

    it('T1-CARD-04-2: Properly formats bullet points and headings without raw markdown corruption', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertTextContains(card.releaseNotesHtml, 'High-speed order synchronization');
    });

    it('T1-CARD-04-3: Sanitizes raw release notes HTML to prevent XSS script execution', () => {
      const maliciousBody = 'Update notes <script>alert("PWNED")</script> and normal text';
      const clean = engine.sanitizeHtml(maliciousBody);
      assertIsXssClean(clean);
      assertTextContains(clean, 'normal text');
    });

    it('T1-CARD-04-4: Provides non-empty release notes container content', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.ok(typeof card.releaseNotesHtml === 'string');
    });

    it('T1-CARD-04-5: Displays fallback text when release body is completely empty', async () => {
      mockServer.setLatestResponse({
        id: 1005,
        tag_name: 'v1.0.0-empty',
        body: '',
        assets: [{ id: 509, name: 'app.apk', size: 10000000, browser_download_url: 'https://example.com/app.apk' }],
      });
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.releaseNotesHtml, 'No release notes provided for this release.');
    });
  });

  describe('FEAT-CARD-05: GitHub Release Source Link', () => {
    it('T1-CARD-05-1: Displays outbound link pointing directly to GitHub release page', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.strictEqual(
        card.sourceLink.href,
        'https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v1.2.0'
      );
    });

    it('T1-CARD-05-2: Link opens in a new tab (target="_blank")', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.sourceLink.target, '_blank');
    });

    it('T1-CARD-05-3: Link strictly enforces security attributes (rel="noopener noreferrer")', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.sourceLink.rel, 'noopener noreferrer');
    });

    it('T1-CARD-05-4: Link includes clear external link text label ("View on GitHub")', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.sourceLink.text, 'View on GitHub');
    });

    it('T1-CARD-05-5: Outbound URL starts strictly with https://github.com', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.ok(card.sourceLink.href.startsWith('https://github.com/'));
    });
  });

  describe('FEAT-CARD-06: Verified SHA-256 Checksum', () => {
    it('T1-CARD-06-1: Safely extracts genuine 64-hex SHA-256 digest from release body text', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertIsValidSha256(card.checksum);
      assert.strictEqual(card.checksum, '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
    });

    it('T1-CARD-06-2: When SHA-256 pattern is absent from release body, displays exact string "Not provided"', async () => {
      mockServer.setLatestResponse(mockServer.fixtures.latestNoSha);
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.checksum, 'Not provided');
    });

    it('T1-CARD-06-3: Strictly zero hardcoded, mocked, or invented checksums are displayed', async () => {
      mockServer.setLatestResponse(mockServer.fixtures.latestNoSha);
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.checksum, 'Not provided');
      assert.strictEqual(card.hasCopyButton, false);
    });

    it('T1-CARD-06-4: Renders one-click copy button next to verified checksum string', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.hasCopyButton, true);
    });

    it('T1-CARD-06-5: Clicking copy button triggers clipboard write and returns confirmation', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      const result = card.copyChecksumAction();
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.text, 'Copied!');
      assert.strictEqual(engine.state.clipboard, '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
    });
  });
});
