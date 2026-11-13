/**
 * Tier 3: 06_security_transport_interaction.test.js - Security & Transport Interactions
 * Covers: INT-26 to INT-29 (4 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertIsDirectDownloadUrl,
  assertIsXssClean,
  assertNoPatTokens,
} = require('../helpers/assertions.js');

describe('Tier 3: Security & Transport Interactions', () => {
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

  it('T3-INT-26: Primary CTA and historical download links strictly validate that download URLs point to https://', async () => {
    await engine.loadLatestRelease();
    await engine.loadReleaseHistory();

    const hero = engine.renderHero();
    assertIsDirectDownloadUrl(hero.primaryCTA.href);

    const history = engine.renderVersionHistory();
    for (const rel of history.releases) {
      if (rel.downloadUrl) {
        assertIsDirectDownloadUrl(rel.downloadUrl);
      }
    }
  });

  it('T3-INT-27: Release notes containing markdown links with javascript: inside blockquotes are neutralized', () => {
    const malicious = '> Important note:\n> [Click here](javascript:alert("XSS")) to verify';
    const clean = engine.sanitizeHtml(malicious);
    assertIsXssClean(clean);
    assert.strictEqual(/javascript:/i.test(clean), false);
  });

  it('T3-INT-28: Every outbound link to GitHub consistently includes target="_blank" and rel="noopener noreferrer"', async () => {
    await engine.loadLatestRelease();
    const card = engine.renderAppInfoCard();
    const footer = engine.renderFooter();

    assert.strictEqual(card.sourceLink.target, '_blank');
    assert.strictEqual(card.sourceLink.rel, 'noopener noreferrer');
    assert.strictEqual(footer.repoLink.target, '_blank');
    assert.strictEqual(footer.repoLink.rel, 'noopener noreferrer');
  });

  it('T3-INT-29: Outbound HTTP requests to GitHub REST API include zero authentication tokens', async () => {
    await engine.loadLatestRelease();
    for (const call of mockServer.callLog) {
      assert.strictEqual('Authorization' in call.headers, false);
      assert.strictEqual('authorization' in call.headers, false);
      assertNoPatTokens(JSON.stringify(call.headers));
    }
  });
});
