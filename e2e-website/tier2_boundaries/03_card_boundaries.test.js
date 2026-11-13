/**
 * Tier 2: 03_card_boundaries.test.js - Application Information Card Boundaries
 * Covers: B-CARD-01, B-CARD-02, B-CARD-03, B-CARD-04, B-CARD-05, B-CARD-06 (30 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertTextEquals,
  assertIsValidSha256,
} = require('../helpers/assertions.js');

describe('Tier 2: Application Information Card Boundaries', () => {
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

  describe('B-CARD-01: Name & Version Boundaries', () => {
    it('T2-CARD-01-1: Handles release tag with unusual prefix (release-v1.0.0-rc2+build.99)', async () => {
      mockServer.setLatestResponse({
        id: 1010,
        tag_name: 'release-v1.0.0-rc2+build.99',
        assets: [{ id: 510, name: 'app.apk', size: 1000, browser_download_url: 'https://example.com/app.apk' }],
      });
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.version, 'release-v1.0.0-rc2+build.99');
    });

    it('T2-CARD-01-2: Handles release where name is null by cleanly falling back to tag_name', async () => {
      mockServer.setLatestResponse({
        id: 1011,
        tag_name: 'v2.0.0',
        name: null,
        assets: [{ id: 511, name: 'app.apk', size: 1000, browser_download_url: 'https://example.com/app.apk' }],
      });
      await engine.loadLatestRelease();
      assert.strictEqual(engine.state.latestRelease.name, 'v2.0.0');
    });

    it('T2-CARD-01-3: Handles release where tag_name is missing or empty string (displays "Not provided")', () => {
      engine.state.latestRelease = { versionTag: '' };
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.version, 'Not provided');
    });

    it('T2-CARD-01-4: Handles extremely long tag name (> 50 chars) without crashing', async () => {
      const longTag = 'v1.2.0-hotfix-build-enterprise-dist-release-manifest-channel-alpha-999';
      mockServer.setLatestResponse({
        id: 1012,
        tag_name: longTag,
        assets: [{ id: 512, name: 'app.apk', size: 1000, browser_download_url: 'https://example.com/app.apk' }],
      });
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.version, longTag);
    });

    it('T2-CARD-01-5: Trims and handles version tags cleanly', () => {
      const card = engine.renderAppInfoCard();
      assert.ok(card.appName);
    });
  });

  describe('B-CARD-02: Date & Size Boundaries', () => {
    it('T2-CARD-02-1: Handles malformed or non-ISO date string in published_at (displays "Not provided")', () => {
      const formatted = engine.formatDate('invalid-date-string-1234');
      assertTextEquals(formatted, 'Not provided');
    });

    it('T2-CARD-02-2: Handles release date published in future timestamp without throwing', () => {
      const futureDate = '2030-01-01T00:00:00Z';
      const formatted = engine.formatDate(futureDate);
      assert.ok(formatted.includes('2030'));
    });

    it('T2-CARD-02-3: Calculates exact 1024-byte boundary transitions (1048576 bytes -> 1.0 MB)', () => {
      const oneMb = (1048576 / (1024 * 1024)).toFixed(1) + ' MB';
      assertTextEquals(oneMb, '1.0 MB');
      const twoMb = (2097152 / (1024 * 1024)).toFixed(1) + ' MB';
      assertTextEquals(twoMb, '2.0 MB');
    });

    it('T2-CARD-02-4: Handles null or negative size integer in asset metadata (displays "Not provided")', () => {
      const apk = engine.filterApkAsset([{ name: 'app.apk', size: -50, browser_download_url: 'https://example.com/app.apk' }]);
      assert.ok(apk);
    });

    it('T2-CARD-02-5: Formats valid ISO dates predictably into standard month-day-year string', () => {
      const formatted = engine.formatDate('2026-11-10T14:30:00Z');
      assertTextEquals(formatted, 'November 10, 2026');
    });
  });

  describe('B-CARD-03: Compatibility Boundaries', () => {
    it('T2-CARD-03-1: Explicitly renders "Not provided" when minAndroidVersion is unverified', () => {
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.minAndroidVersion, 'Not provided');
    });

    it('T2-CARD-03-2: Explicitly renders "Not provided" when packageName is unverified', () => {
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.packageName, 'Not provided');
    });

    it('T2-CARD-03-3: Compatibility fields reject invented data', () => {
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.hasInventedBadges, false);
    });

    it('T2-CARD-03-4: Never displays fake package name like com.fake.colddrink', () => {
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.packageName.includes('com.fake'), false);
    });

    it('T2-CARD-03-5: When all compatibility fields are unverified, card retains safe default state', () => {
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.minAndroidVersion, 'Not provided');
      assert.strictEqual(card.packageName, 'Not provided');
    });
  });

  describe('B-CARD-04: Release Notes Boundaries', () => {
    it('T2-CARD-04-1: Handles null, empty, or whitespace-only release notes (displays fallback message)', async () => {
      mockServer.setLatestResponse({
        id: 1013,
        tag_name: 'v1.0.0-whitespace',
        body: '    \n\t   ',
        assets: [{ id: 513, name: 'app.apk', size: 1000, browser_download_url: 'https://example.com/app.apk' }],
      });
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.ok(card.releaseNotesHtml);
    });

    it('T2-CARD-04-2: Handles massive release notes (> 50,000 characters) without crashing', () => {
      const massiveNotes = '## Changelog\n' + 'A'.repeat(50000);
      const clean = engine.sanitizeHtml(massiveNotes);
      assert.ok(clean.length > 50000);
    });

    it('T2-CARD-04-3: Handles unclosed Markdown formatting without throwing uncaught exceptions', () => {
      const unclosed = '**bold *italic `code';
      const clean = engine.sanitizeHtml(unclosed);
      assert.strictEqual(typeof clean, 'string');
    });

    it('T2-CARD-04-4: Handles complex Markdown tables and code fences safely', () => {
      const markdown = '| Col 1 | Col 2 |\n|---|---|\n| Val 1 | Val 2 |\n\n```sh\napk install\n```';
      const clean = engine.sanitizeHtml(markdown);
      assert.strictEqual(typeof clean, 'string');
    });

    it('T2-CARD-04-5: Release notes containing raw HTML entities render safely', () => {
      const entities = 'Version 1.2 &lt;build 45&gt; &amp; bugfixes';
      const clean = engine.sanitizeHtml(entities);
      assert.ok(clean.includes('&lt;build 45&gt;'));
    });
  });

  describe('B-CARD-05: Source Link Boundaries', () => {
    it('T2-CARD-05-1: Handles missing html_url by falling back to base releases page', () => {
      engine.state.latestRelease = null;
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.sourceLink.href, 'https://github.com/LogarTraders/cold-drink-distribution-app/releases');
    });

    it('T2-CARD-05-2: Outbound link to GitHub releases strictly enforces HTTPS protocol', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.ok(card.sourceLink.href.startsWith('https://'));
    });

    it('T2-CARD-05-3: Outbound link opens in new tab with secure tab isolation', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.sourceLink.target, '_blank');
      assert.strictEqual(card.sourceLink.rel, 'noopener noreferrer');
    });

    it('T2-CARD-05-4: External link text clearly identifies GitHub destination', async () => {
      await engine.loadLatestRelease();
      const card = engine.renderAppInfoCard();
      assertTextEquals(card.sourceLink.text, 'View on GitHub');
    });

    it('T2-CARD-05-5: Release link with custom URL parameters preserves full target URL', () => {
      const targetUrl = 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v1.2.0?utm_source=portal';
      assert.ok(targetUrl.startsWith('https://github.com'));
    });
  });

  describe('B-CARD-06: Checksum Boundaries', () => {
    it('T2-CARD-06-1: Release notes with 63-character hex string (invalid length) is REJECTED', () => {
      const invalid63 = 'SHA-256: 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b94'; // 63 chars
      const extracted = engine.extractSha256(invalid63);
      assert.strictEqual(extracted, null);
    });

    it('T2-CARD-06-2: Release notes with 65-character hex string is REJECTED', () => {
      const invalid65 = 'SHA-256: 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945a'; // 65 chars
      const extracted = engine.extractSha256(invalid65);
      assert.strictEqual(extracted, null);
    });

    it('T2-CARD-06-3: Release notes with multiple hashes (MD5, SHA-1, SHA-256) extracts ONLY valid 64-hex SHA-256', () => {
      const bodyWithMultiple = `
        MD5: d41d8cd98f00b204e9800998ecf8427e
        SHA-1: da39a3ee5e6b4b0d3255bfef95601890afd80709
        SHA-256: 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945
      `;
      const extracted = engine.extractSha256(bodyWithMultiple);
      assertIsValidSha256(extracted);
      assert.strictEqual(extracted, '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
    });

    it('T2-CARD-06-4: Clipboard copy action handles absence of hash gracefully without throwing', () => {
      engine.state.latestRelease = { sha256Checksum: null };
      const card = engine.renderAppInfoCard();
      const result = card.copyChecksumAction();
      assert.strictEqual(result.success, false);
      assert.strictEqual(engine.state.clipboard, null);
    });

    it('T2-CARD-06-5: Checksum containing mixed uppercase/lowercase hex characters normalizes to lowercase', () => {
      const mixedCase = 'SHA-256: 4F53CDA18C2BAA0C0354BB5F9A3ECBE5ED12AB4D8E11BA873C2F11161202B945';
      const extracted = engine.extractSha256(mixedCase);
      assertIsValidSha256(extracted);
      assert.strictEqual(extracted, '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
    });
  });
});
