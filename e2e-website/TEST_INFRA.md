# E2E Test Infrastructure Reference Manual
## Android Cold Drink Distribution Agency APK Downloader Website (`e2e-website/`)

This document provides a comprehensive technical reference for the standalone End-to-End (E2E) testing framework designed for the **Android Cold Drink Distribution Agency APK Downloader Website**.

---

## 1. Architectural Philosophy & Invariants

1. **Zero External Runtime Dependencies**:
   The entire test runner, mock HTTP server, storage layer, and test harness run entirely on native Node.js built-in modules (`node:assert`, `node:fs`, `node:path`, `node:perf_hooks`). No external NPM packages (no Jest, Mocha, Playwright, or Cypress) are installed or needed.

2. **100% Offline & Pure Execution**:
   Live network calls are blocked by an internal **Offline Safety Lock**. All GitHub REST API v3 responses are served in-memory from high-fidelity JSON fixtures, enabling instantaneous execution (~500ms for 335 tests) without API rate limit exhaustion or socket permissions.

3. **Workspace Preservation (R1)**:
   The workspace hosts an existing desktop POS application with 329 passing E2E tests in `e2e-tests/` and a root `TEST_READY.md`. The website E2E test suite lives strictly inside `e2e-website/` and reports its results to root `TEST_READY_WEBSITE.md`. Files in `e2e-tests/` and root `TEST_READY.md` remain strictly unmodified.

4. **Deterministic Exit Codes**:
   - `0`: All executed tests passed with zero failures.
   - `1`: One or more assertion failures or uncaught errors occurred.

---

## 2. Directory Structure Manifest

```
e2e-website/
├── package.json                         # CommonJS scope declaration ("type": "commonjs")
├── runner.js                            # Master CLI test runner & reporter
├── TEST_INFRA.md                        # Test infrastructure documentation (this document)
├── framework/
│   └── harness.js                       # BDD describe/it/hooks/duration reporting engine
├── helpers/
│   ├── mock_github.js                   # In-memory GitHub REST API mock fetch dispatcher
│   ├── session_storage_mock.js          # In-memory Web Storage API implementation
│   ├── website_engine.js                # Opaque-box UI state machine & component DOM simulator
│   └── assertions.js                    # Custom DOM, XSS, and HTTPS assertion helpers
├── fixtures/
│   ├── release_latest_valid.json        # Valid latest release with APK asset and SHA-256
│   ├── release_latest_no_apk.json       # Valid release containing only ZIP/TAR archives (no APK)
│   ├── release_latest_no_sha.json       # Valid release with APK but no SHA-256 in release notes
│   ├── release_multi_apk.json           # Release with multiple APK architectures (arm64, v7a, universal)
│   ├── releases_history.json            # Array of 5 past releases for Version History testing
│   ├── releases_empty.json              # Empty releases array [] for zero-release state
│   ├── error_403_rate_limit.json        # 403 Forbidden with rate limit headers and reset epoch
│   ├── error_404_not_found.json         # 404 Not Found response
│   └── payload_xss_notes.json           # Adversarial release notes containing script/event XSS vectors
├── tier1_features/                      # Tier 1: 29 Features x 5 Tests = 145 Tests
│   ├── 01_nav.test.js                   # FEAT-NAV-01 to FEAT-NAV-04 (20 tests)
│   ├── 02_hero.test.js                  # FEAT-HERO-01 to FEAT-HERO-04 (20 tests)
│   ├── 03_card.test.js                  # FEAT-CARD-01 to FEAT-CARD-06 (30 tests)
│   ├── 04_features.test.js              # FEAT-FEAT-01 (5 tests)
│   ├── 05_guide.test.js                 # FEAT-GUIDE-01 to FEAT-GUIDE-02 (10 tests)
│   ├── 06_history.test.js               # FEAT-HIST-01 to FEAT-HIST-02 (10 tests)
│   ├── 07_footer.test.js                # FEAT-FOOT-01 to FEAT-FOOT-03 (15 tests)
│   ├── 08_api.test.js                   # FEAT-API-01 to FEAT-API-04 (20 tests)
│   └── 09_security.test.js              # FEAT-SEC-01 to FEAT-SEC-03 (15 tests)
├── tier2_boundaries/                    # Tier 2: 29 Features x 5 Tests = 145 Tests
│   ├── 01_nav_boundaries.test.js        # B-NAV-01 to B-NAV-04 (20 tests)
│   ├── 02_hero_boundaries.test.js       # B-HERO-01 to B-HERO-04 (20 tests)
│   ├── 03_card_boundaries.test.js       # B-CARD-01 to B-CARD-06 (30 tests)
│   ├── 04_features_boundaries.test.js   # B-FEAT-01 (5 tests)
│   ├── 05_guide_boundaries.test.js      # B-GUIDE-01 to B-GUIDE-02 (10 tests)
│   ├── 06_history_boundaries.test.js    # B-HIST-01 to B-HIST-02 (10 tests)
│   ├── 07_footer_boundaries.test.js     # B-FOOT-01 to B-FOOT-03 (15 tests)
│   ├── 08_api_boundaries.test.js        # B-API-01 to B-API-04 (20 tests)
│   └── 09_security_boundaries.test.js   # B-SEC-01 to B-SEC-03 (15 tests)
├── tier3_interactions/                  # Tier 3: Cross-Feature Interactions = 29 Tests
│   ├── 01_cache_refetch_interaction.test.js       # INT-01 to INT-05 (5 tests)
│   ├── 02_mobile_nav_download_interaction.test.js # INT-06 to INT-10 (5 tests)
│   ├── 03_history_filtering_interaction.test.js   # INT-11 to INT-15 (5 tests)
│   ├── 04_sha_card_interaction.test.js            # INT-16 to INT-20 (5 tests)
│   ├── 05_state_transition_interaction.test.js    # INT-21 to INT-25 (5 tests)
│   └── 06_security_transport_interaction.test.js  # INT-26 to INT-29 (4 tests)
└── tier4_scenarios/                     # Tier 4: Real-World Scenarios = 16 Tests
    ├── 01_first_time_user_journey.test.js         # SCEN-01 to SCEN-04 (4 tests)
    ├── 02_admin_update_journey.test.js            # SCEN-05 to SCEN-07 (3 tests)
    ├── 03_sideload_troubleshooting_journey.test.js# SCEN-08 to SCEN-10 (3 tests)
    ├── 04_offline_recovery_journey.test.js        # SCEN-11 to SCEN-13 (3 tests)
    └── 05_historical_rollback_journey.test.js     # SCEN-14 to SCEN-16 (3 tests)
```

---

## 3. CLI Execution & Runner Flags

```bash
# Execute the complete 335-test suite across all 4 tiers
node e2e-website/runner.js

# Execute individual tiers
node e2e-website/runner.js --tier=1      # Tier 1 only (145 tests)
node e2e-website/runner.js --tier=2      # Tier 2 only (145 tests)
node e2e-website/runner.js --tier=3      # Tier 3 only (29 tests)
node e2e-website/runner.js --tier=4      # Tier 4 only (16 tests)

# Filter by feature ID or suite name
node e2e-website/runner.js --filter="FEAT-CARD"
node e2e-website/runner.js --filter="SHA"
node e2e-website/runner.js --filter="XSS"
```

---

## 4. Test Harness API Guide (`framework/harness.js`)

The harness provides standard BDD primitives:
- `describe(title, fn)`: Defines a test suite container (supports nesting).
- `it(title, fn)`: Defines a test case with execution duration tracking.
- `beforeEach(fn)` / `afterEach(fn)`: Lifecycle hooks for test isolation.
- `beforeAll(fn)` / `afterAll(fn)`: Suite setup and teardown.

### Custom Assertion Methods
```javascript
const { assert } = require('../framework/harness.js');

// Verifies HTML does not contain <script>, on* handlers, or javascript: schemes
assert.isXssClean(htmlString);

// Verifies URL begins with https://, ends with .apk, and is not a source archive
assert.isDirectDownloadUrl(downloadUrl);

// Verifies 64-character hexadecimal SHA-256 hash
assert.isValidSha256(hashString);

// Verifies deterministic state machine transitions
assert.statusEqual(actualStatus, expectedStatus);
```

---

## 5. Mock GitHub API Server Mechanics (`helpers/mock_github.js`)

`MockGitHubServer` intercepts `globalThis.fetch` to simulate official GitHub Releases REST API behavior:
- **Routes Dispatched**:
  - `GET /repos/{owner}/{repo}/releases/latest`
  - `GET /repos/{owner}/{repo}/releases`
- **Conditional HTTP Caching**: Evaluates `If-None-Match` request headers against response `ETag`; returns HTTP 304 Not Modified when matching.
- **Rate Limit Simulation**: `mockServer.simulateRateLimit(minutes)` returns HTTP 403 with `x-ratelimit-remaining: 0` and future `x-ratelimit-reset` epoch timestamp.
- **Network Failure Simulation**: `mockServer.simulateNetworkFailure()` throws a `TypeError: Failed to fetch`.
- **Offline Safety Lock**: Rejects unmocked external URLs to guarantee zero unintended internet calls.

---

## 6. Opaque-Box Website Engine (`helpers/website_engine.js`)

`WebsiteEngine` simulates client-side state, asset filtering, and UI rendering without requiring heavy headless browsers:
- **State Machine**: Transitions predictably between `idle`, `loading`, `success`, `empty` (`NO_APK`, `REPO_404`), and `error` (`RATE_LIMITED`, `NETWORK_ERROR`).
- **Asset Filtering**: Case-insensitive `.apk` matching that prioritizes `universal` or `release` builds while rejecting `.zip`, `.tar.gz`, `.exe`, `.sha256`.
- **SHA-256 Extraction**: Extracts genuine 64-hex strings from release notes while rejecting dummy MD5 or SHA-1 hashes.
- **XSS Sanitizer**: Strips nested `<script>` tags, inline event attributes (`onerror=`, `onload=`), and dangerous pseudo-protocols (`javascript:`, `data:`).
- **Session Caching**: 5-minute TTL storage in an in-memory `SessionStorageMock` conforming to the Web Storage API.
