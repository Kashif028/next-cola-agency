/**
 * Tier 3: 04_sha_card_interaction.test.js - SHA-256 Extraction & Card Display Interactions
 * Covers: INT-16 to INT-20 (5 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertIsValidSha256,
  assertTextEquals,
  assertIsXssClean,
  assertTextContains,
} = require('../helpers/assertions.js');

describe('Tier 3: SHA Checksum & Card Interactions', () => {
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

  it('T3-INT-16: Extracts genuine SHA-256 digest from release notes and binds it to card with copy action', async () => {
    await engine.loadLatestRelease();
    const card = engine.renderAppInfoCard();
    assertIsValidSha256(card.checksum);
    assert.strictEqual(card.hasCopyButton, true);
    const result = card.copyChecksumAction();
    assert.strictEqual(result.success, true);
    assert.strictEqual(engine.state.clipboard, card.checksum);
  });

  it('T3-INT-17: When release notes contain no hash, card displays "Not provided" and disables copy button', async () => {
    mockServer.setLatestResponse(mockServer.fixtures.latestNoSha);
    await engine.loadLatestRelease();
    const card = engine.renderAppInfoCard();
    assertTextEquals(card.checksum, 'Not provided');
    assert.strictEqual(card.hasCopyButton, false);
  });

  it('T3-INT-18: Troubleshooting step 5 references checksum verification', () => {
    const tb = engine.renderTroubleshooting();
    const step5 = tb.scenarios.find(s => s.case === 5);
    assertTextContains(step5.title, 'Signature Conflicts');
  });

  it('T3-INT-19: Release body containing malicious script AND valid SHA-256 neutralizes script while extracting hash', () => {
    const maliciousWithSha = `
      <script>window.pwned = true;</script>
      Official Build Release
      SHA-256: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
    `;
    const cleanNotes = engine.sanitizeHtml(maliciousWithSha);
    assertIsXssClean(cleanNotes);

    const hash = engine.extractSha256(maliciousWithSha);
    assertIsValidSha256(hash);
    assert.strictEqual(hash, '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069');
  });

  it('T3-INT-20: Dynamic refetch with updated build digest re-renders checksum and updates clipboard', async () => {
    await engine.loadLatestRelease();
    const oldChecksum = engine.state.latestRelease.sha256Checksum;

    const newSha = 'a'.repeat(64);
    mockServer.setLatestResponse({
      id: 1020,
      tag_name: 'v1.3.0',
      body: `Release with updated hash\nSHA-256: ${newSha}`,
      assets: [{ id: 520, name: 'app-v1.3.0.apk', size: 25000000, browser_download_url: 'https://example.com/app.apk' }],
    }, '"etag-updated-sha"');

    await engine.loadLatestRelease(true);
    const card = engine.renderAppInfoCard();
    assert.strictEqual(card.checksum, newSha);
    assert.notStrictEqual(card.checksum, oldChecksum);
    card.copyChecksumAction();
    assert.strictEqual(engine.state.clipboard, newSha);
  });
});
