/**
 * Tier 4: 02_admin_update_journey.test.js - Agency Admin Update Audit Journeys
 * Covers: SCEN-05 to SCEN-07 (3 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertIsValidSha256,
  assertTextEquals,
  assertTextContains,
} = require('../helpers/assertions.js');

describe('Tier 4: Agency Admin Update Audit Journeys', () => {
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

  it('T4-SCEN-05: Agency administrator performs update audit comparing installed version with portal', async () => {
    await engine.loadLatestRelease();
    const currentDeviceVersion = 'v1.1.0';
    const card = engine.renderAppInfoCard();

    assert.notStrictEqual(currentDeviceVersion, card.version);
    assertTextEquals(card.version, 'v1.2.0');
    assertTextContains(card.releaseNotesHtml, 'High-speed order synchronization');
  });

  it('T4-SCEN-06: Administrator copies cryptographic SHA-256 digest for MDM whitelist deployment', async () => {
    await engine.loadLatestRelease();
    const card = engine.renderAppInfoCard();

    assertIsValidSha256(card.checksum);
    assert.strictEqual(card.hasCopyButton, true);

    const action = card.copyChecksumAction();
    assert.strictEqual(action.success, true);
    assert.strictEqual(action.text, 'Copied!');
    assert.strictEqual(engine.state.clipboard, card.checksum);
  });

  it('T4-SCEN-07: Direct GitHub release inspection opens official repository release page in isolated tab', async () => {
    await engine.loadLatestRelease();
    const card = engine.renderAppInfoCard();

    assert.strictEqual(card.sourceLink.target, '_blank');
    assert.strictEqual(card.sourceLink.rel, 'noopener noreferrer');
    assert.ok(card.sourceLink.href.includes('/tag/v1.2.0'));
  });
});
