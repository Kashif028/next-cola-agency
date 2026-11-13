/**
 * Tier 4: 05_historical_rollback_journey.test.js - Historical Rollback Journeys
 * Covers: SCEN-14 to SCEN-16 (3 tests)
 */

const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { MockGitHubServer } = require('../helpers/mock_github.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const { assertIsDirectDownloadUrl, assertTextEquals } = require('../helpers/assertions.js');

describe('Tier 4: Historical Version Rollback Journeys', () => {
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

  it('T4-SCEN-14: Legacy device user navigates to Version History to locate compatible prior release', async () => {
    await engine.loadLatestRelease();
    await engine.loadReleaseHistory();

    const rendered = engine.renderVersionHistory();
    assert.strictEqual(rendered.id, 'versions');
    assert.ok(rendered.releases.length >= 4);

    const targetPriorRelease = rendered.releases.find(r => r.tag === 'v1.1.0');
    assert.ok(targetPriorRelease, 'Prior release v1.1.0 must be available in history');
    assertTextEquals(targetPriorRelease.tag, 'v1.1.0');
  });

  it('T4-SCEN-15: Driver reviews release notes for v1.1.0 and verifies that genuine APK binary exists', async () => {
    await engine.loadReleaseHistory();
    const rendered = engine.renderVersionHistory();
    const prior = rendered.releases.find(r => r.tag === 'v1.1.0');

    assert.ok(prior.notes.length > 0);
    assert.strictEqual(prior.hasApk, true);
    assert.ok(prior.apkSize);
  });

  it('T4-SCEN-16: Driver downloads historical APK without altering active latest release presentation', async () => {
    await engine.loadLatestRelease();
    await engine.loadReleaseHistory();

    const rendered = engine.renderVersionHistory();
    const prior = rendered.releases.find(r => r.tag === 'v1.1.0');

    // Historical download initiates
    assertIsDirectDownloadUrl(prior.downloadUrl);
    assert.ok(prior.downloadUrl.includes('v1.1.0'));

    // Hero latest release remains unaffected
    const hero = engine.renderHero();
    assert.strictEqual(hero.primaryCTA.versionTag, 'v1.2.0');
    assert.strictEqual(engine.state.latestRelease.versionTag, 'v1.2.0');
  });
});
