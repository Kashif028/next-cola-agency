/**
 * Custom Assertion Helpers for Website E2E Testing
 * Built on node:assert for strict verification.
 */

const assert = require('node:assert');

function assertTextEquals(actual, expected, message) {
  assert.strictEqual(
    String(actual).trim(),
    String(expected).trim(),
    message || `Expected text "${expected}", got "${actual}"`
  );
}

function assertTextContains(actual, substring, message) {
  assert.ok(
    String(actual).toLowerCase().includes(String(substring).toLowerCase()),
    message || `Expected "${actual}" to contain "${substring}"`
  );
}

function assertIsDirectDownloadUrl(url, message) {
  assert.ok(typeof url === 'string', message || 'Download URL must be a string');
  assert.ok(url.startsWith('https://'), message || `URL must start with https://, got: ${url}`);
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    assert.ok(pathname.endsWith('.apk'), message || `URL pathname must end with .apk, got: ${pathname}`);
    assert.strictEqual(/\.(zip|tar\.gz|tgz)$/i.test(pathname), false, message || 'URL must not point to source archive');
  } catch (err) {
    if (err.name === 'AssertionError') throw err;
    assert.ok(url.toLowerCase().includes('.apk'), message || `URL must contain .apk, got: ${url}`);
  }
}

function assertIsXssClean(html, message) {
  assert.strictEqual(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i.test(html),
    false,
    (message || 'XSS Check') + ': Contains <script> tag'
  );
  assert.strictEqual(
    /\son[a-zA-Z]+\s*=/i.test(html),
    false,
    (message || 'XSS Check') + ': Contains inline on* event handler'
  );
  assert.strictEqual(
    /href\s*=\s*["']?\s*javascript:/i.test(html),
    false,
    (message || 'XSS Check') + ': Contains javascript: pseudo-protocol'
  );
  assert.strictEqual(
    /<iframe\b/i.test(html),
    false,
    (message || 'XSS Check') + ': Contains <iframe> element'
  );
}

function assertIsValidSha256(hash, message) {
  assert.ok(typeof hash === 'string', message || 'SHA-256 must be a string');
  assert.strictEqual(
    /^[a-fA-F0-9]{64}$/.test(hash),
    true,
    (message || 'SHA-256 Check') + `: Value "${hash}" is not a valid 64-character hex string`
  );
}

function assertStateStatus(state, expectedStatus, message) {
  assert.strictEqual(
    state.status,
    expectedStatus,
    message || `Expected state status "${expectedStatus}", got "${state.status}"`
  );
}

function assertIsHttps(url, message) {
  assert.ok(
    typeof url === 'string' && url.startsWith('https://'),
    message || `URL must strictly enforce https://, got: ${url}`
  );
}

function assertNoPatTokens(text, message) {
  assert.strictEqual(
    /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})/i.test(text),
    false,
    message || 'Security violation: Detected potential GitHub Personal Access Token in text'
  );
}

module.exports = {
  assertTextEquals,
  assertTextContains,
  assertIsDirectDownloadUrl,
  assertIsXssClean,
  assertIsValidSha256,
  assertStateStatus,
  assertIsHttps,
  assertNoPatTokens,
};
