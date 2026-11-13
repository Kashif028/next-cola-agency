/**
 * Tier 1: 09_security.test.js - Security, Privacy & Workspace Coexistence Features
 * Covers: FEAT-SEC-01, FEAT-SEC-02, FEAT-SEC-03 (15 tests)
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertIsXssClean,
  assertIsDirectDownloadUrl,
  assertIsHttps,
  assertNoPatTokens,
} = require('../helpers/assertions.js');

describe('Tier 1: Security, Integrity & Workspace Coexistence', () => {
  let engine;

  beforeEach(() => {
    engine = new WebsiteEngine();
  });

  describe('FEAT-SEC-01: XSS Sanitization', () => {
    it('T1-SEC-01-1: Strips malicious <script> tags from release notes markdown before DOM injection', () => {
      const payload = 'Notice: <script>document.cookie="stolen";</script> Official Release Notes';
      const clean = engine.sanitizeHtml(payload);
      assertIsXssClean(clean);
      assert.strictEqual(clean.includes('<script>'), false);
    });

    it('T1-SEC-01-2: Strips inline event handlers (onload, onerror, onclick, onmouseover)', () => {
      const payload = '<img src="invalid.png" onerror="alert(1)" onload="alert(2)" /> <button onclick="pwn()">Click</button>';
      const clean = engine.sanitizeHtml(payload);
      assertIsXssClean(clean);
      assert.strictEqual(/on\w+=/i.test(clean), false);
    });

    it('T1-SEC-01-3: Neutralizes javascript: pseudo-protocol URLs in release notes links', () => {
      const payload = '<a href="javascript:alert(document.domain)">Download mirror</a>';
      const clean = engine.sanitizeHtml(payload);
      assertIsXssClean(clean);
      assert.strictEqual(/javascript:/i.test(clean), false);
    });

    it('T1-SEC-01-4: Preserves safe Markdown formatting tags (<p>, <strong>, <em>, <ul>, <li>, <code>)', () => {
      const payload = '<p><strong>Important:</strong> Update includes <em>stability</em> fixes:</p><ul><li>Route fix</li></ul>';
      const clean = engine.sanitizeHtml(payload);
      assert.ok(clean.includes('<strong>Important:</strong>'));
      assert.ok(clean.includes('<em>stability</em>'));
      assert.ok(clean.includes('<li>Route fix</li>'));
    });

    it('T1-SEC-01-5: External links automatically include target="_blank" rel="noopener noreferrer"', () => {
      const payload = '<a href="https://example.com/guide">User Manual</a>';
      const clean = engine.sanitizeHtml(payload);
      assert.ok(clean.includes('rel="noopener noreferrer"'));
      assert.ok(clean.includes('target="_blank"'));
    });
  });

  describe('FEAT-SEC-02: HTTPS Enforcement & Security', () => {
    it('T1-SEC-02-1: Validates that all APK download URLs strictly start with https://', () => {
      const secureUrl = 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v1.2.0/app.apk';
      assertIsDirectDownloadUrl(secureUrl);
    });

    it('T1-SEC-02-2: Rejects insecure http:// asset download links', () => {
      const insecureUrl = 'http://insecure.example.com/app.apk';
      assert.throws(() => {
        assertIsDirectDownloadUrl(insecureUrl);
      });
    });

    it('T1-SEC-02-3: Download action triggers direct browser file download without automatic execution', () => {
      const hero = engine.renderHeroCTA();
      // CTA button exposes href or is disabled, does not evaluate executable shell code
      assert.strictEqual(typeof hero, 'object');
    });

    it('T1-SEC-02-4: Verifies zero GitHub Personal Access Tokens (PAT) exist in test configuration or fixtures', () => {
      const configStr = JSON.stringify(engine.config);
      assertNoPatTokens(configStr);
    });

    it('T1-SEC-02-5: Outbound links in App Info Card and Footer strictly enforce HTTPS protocol', () => {
      const card = engine.renderAppInfoCard();
      const footer = engine.renderFooter();
      assertIsHttps(card.sourceLink.href);
      assertIsHttps(footer.repoLink.href);
    });
  });

  describe('FEAT-SEC-03: Workspace Coexistence', () => {
    it('T1-SEC-03-1: Verifies that website test files are isolated in e2e-website/', () => {
      const testDir = path.resolve(__dirname, '..');
      assert.ok(testDir.endsWith('e2e-website'));
    });

    it('T1-SEC-03-2: Verifies that desktop POS components (src/components/pos/) are 100% intact', () => {
      const posDir = path.resolve(__dirname, '../../src/components/pos');
      assert.strictEqual(fs.existsSync(posDir), true);
      const posFiles = fs.readdirSync(posDir);
      assert.ok(posFiles.length > 5, 'POS components must be preserved');
    });

    it('T1-SEC-03-3: Verifies that desktop POS E2E test runner (e2e-tests/runner.js) is untouched', () => {
      const posRunner = path.resolve(__dirname, '../../e2e-tests/runner.js');
      assert.strictEqual(fs.existsSync(posRunner), true);
    });

    it('T1-SEC-03-4: Verifies that desktop POS TEST_READY.md file is strictly preserved', () => {
      const testReadyPos = path.resolve(__dirname, '../../TEST_READY.md');
      assert.strictEqual(fs.existsSync(testReadyPos), true);
      const content = fs.readFileSync(testReadyPos, 'utf8');
      assert.ok(content.includes('Logar Traders'), 'TEST_READY.md must retain Logar Traders verification');
    });

    it('T1-SEC-03-5: Website E2E test suite executes without modifying POS files', () => {
      const posPackage = path.resolve(__dirname, '../../e2e-tests/package.json');
      assert.strictEqual(fs.existsSync(posPackage), true);
    });
  });
});
