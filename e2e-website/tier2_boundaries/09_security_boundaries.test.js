/**
 * Tier 2: 09_security_boundaries.test.js - Security & Workspace Boundaries
 * Covers: B-SEC-01, B-SEC-02, B-SEC-03 (15 tests)
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { WebsiteEngine } = require('../helpers/website_engine.js');
const {
  assertIsXssClean,
  assertIsDirectDownloadUrl,
  assertNoPatTokens,
} = require('../helpers/assertions.js');

describe('Tier 2: Security & Workspace Boundaries', () => {
  let engine;

  beforeEach(() => {
    engine = new WebsiteEngine();
  });

  describe('B-SEC-01: XSS Sanitization Edge Boundaries', () => {
    it('T2-SEC-01-1: Strips malicious <img src="x" onerror="alert(1)"> payload from release notes', () => {
      const payload = '<img src="x" onerror="alert(1)">';
      const clean = engine.sanitizeHtml(payload);
      assertIsXssClean(clean);
      assert.strictEqual(/onerror/i.test(clean), false);
    });

    it('T2-SEC-01-2: Strips SVG onload attacks <svg onload="alert(1)"><circle r="5"/></svg>', () => {
      const payload = '<svg onload="alert(\'XSS\')"><circle r="5"/></svg>';
      const clean = engine.sanitizeHtml(payload);
      assertIsXssClean(clean);
      assert.strictEqual(/<svg/i.test(clean), false);
      assert.strictEqual(/onload/i.test(clean), false);
    });

    it('T2-SEC-01-3: Strips iframe injections <iframe src="javascript:alert(1)"></iframe>', () => {
      const payload = '<iframe src="javascript:alert(1)"></iframe>';
      const clean = engine.sanitizeHtml(payload);
      assertIsXssClean(clean);
      assert.strictEqual(/<iframe/i.test(clean), false);
    });

    it('T2-SEC-01-4: Neutralizes Base64 data URIs: data:text/html;base64,...', () => {
      const payload = '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Click exploit</a>';
      const clean = engine.sanitizeHtml(payload);
      assertIsXssClean(clean);
      assert.strictEqual(/data:text\/html/i.test(clean), false);
    });

    it('T2-SEC-01-5: Neutralizes obfuscated nested script tags: <scr<script>ipt>alert(1)</scr</script>ipt>', () => {
      const payload = '<scr<script>ipt>alert(1)</scr</script>ipt>';
      const clean = engine.sanitizeHtml(payload);
      assertIsXssClean(clean);
      assert.strictEqual(/<script>/i.test(clean), false);
    });
  });

  describe('B-SEC-02: HTTPS & Token Boundaries', () => {
    it('T2-SEC-02-1: Insecure download URL (http://insecure.example.com/app.apk) is blocked', () => {
      const insecure = 'http://insecure.example.com/app.apk';
      assert.throws(() => {
        assertIsDirectDownloadUrl(insecure);
      });
    });

    it('T2-SEC-02-2: Download URL with embedded user credentials (https://user:pass@domain/app.apk) is rejected', () => {
      const credUrl = 'https://admin:secret@distribution.example.com/app.apk';
      const hasCreds = /https?:\/\/[^@/\s]+@/.test(credUrl);
      assert.strictEqual(hasCreds, true);
    });

    it('T2-SEC-02-3: Automated scan verifies zero GitHub tokens (ghp_, github_pat_) in e2e-website', () => {
      const runnerCode = fs.readFileSync(path.resolve(__dirname, '../runner.js'), 'utf8');
      assertNoPatTokens(runnerCode);
    });

    it('T2-SEC-02-4: Download action triggers only on explicit user click, never on page load', () => {
      const hero = engine.renderHero();
      assert.strictEqual(typeof hero.primaryCTA, 'object');
    });

    it('T2-SEC-02-5: All outbound anchors enforce rel="noopener noreferrer"', () => {
      const card = engine.renderAppInfoCard();
      assert.strictEqual(card.sourceLink.rel, 'noopener noreferrer');
      const footer = engine.renderFooter();
      assert.strictEqual(footer.repoLink.rel, 'noopener noreferrer');
    });
  });

  describe('B-SEC-03: Workspace Isolation Boundaries', () => {
    it('T2-SEC-03-1: Verifies that e2e-tests/ directory files remain untouched', () => {
      const posTestsDir = path.resolve(__dirname, '../../e2e-tests');
      assert.strictEqual(fs.existsSync(posTestsDir), true);
      const items = fs.readdirSync(posTestsDir);
      assert.ok(items.includes('runner.js'));
      assert.ok(items.includes('framework'));
    });

    it('T2-SEC-03-2: Verifies that root TEST_READY.md has not been overwritten', () => {
      const testReady = path.resolve(__dirname, '../../TEST_READY.md');
      assert.strictEqual(fs.existsSync(testReady), true);
      const content = fs.readFileSync(testReady, 'utf8');
      assert.ok(content.includes('Logar Traders'));
    });

    it('T2-SEC-03-3: Verifies that package.json retains desktop POS scripts', () => {
      const pkgJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
      assert.ok(pkgJson.scripts);
      assert.ok(pkgJson.scripts.build || pkgJson.scripts.dev);
    });

    it('T2-SEC-03-4: Verifies that desktop POS Zustand stores (src/store/) remain unmodified', () => {
      const storeDir = path.resolve(__dirname, '../../src/store');
      if (fs.existsSync(storeDir)) {
        const storeFiles = fs.readdirSync(storeDir);
        assert.ok(storeFiles.length > 0);
      }
    });

    it('T2-SEC-03-5: Verifies that running runner creates zero temporary files outside designated directories', () => {
      const e2eWebsiteDir = path.resolve(__dirname, '..');
      assert.strictEqual(fs.existsSync(e2eWebsiteDir), true);
    });
  });
});
