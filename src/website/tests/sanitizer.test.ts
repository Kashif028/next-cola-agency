import { describe, it, expect } from 'vitest';
import {
  sanitizeReleaseNotes,
  sanitizeHtml,
  renderSafeMarkdown,
  extractSha256Checksum,
  extractAndroidCompatibility,
  escapeHtml,
} from '../services/sanitizer';

describe('sanitizer & security', () => {
  it('T5.1: completely removes <script> tags and their contents', () => {
    const malicious = '<script>window.__pwned = true; alert("xss");</script>Clean release notes.';
    const result = sanitizeReleaseNotes(malicious);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('window.__pwned');
    expect(result).not.toContain('alert');
    expect(result).toContain('Clean release notes.');
  });

  it('T5.2: strips inline on* event handlers (onerror, onload, onclick)', () => {
    const malicious = '<img src="https://example.com/pic.png" onerror="alert(1)" onload="evil()" />';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onload');
    expect(result).not.toContain('alert');
    expect(result).toContain('<img src="https://example.com/pic.png" />');
  });

  it('T5.3: blocks dangerous URI schemes (javascript:, data:, vbscript:)', () => {
    const malicious1 = '<a href="javascript:alert(1)">Click Me</a>';
    const malicious2 = '<a href="JAVASCRIPT:alert(2)">Click Me</a>';
    const malicious3 = '<a href="data:text/html;base64,PHNjcmlwdD4=">Click Me</a>';
    const malicious4 = '<a href="vbscript:msgbox(1)">Click Me</a>';

    expect(sanitizeHtml(malicious1)).toContain('href="#"');
    expect(sanitizeHtml(malicious2)).toContain('href="#"');
    expect(sanitizeHtml(malicious3)).toContain('href="#"');
    expect(sanitizeHtml(malicious4)).toContain('href="#"');
  });

  it('T5.4: detects obfuscated javascript: schemes with HTML entities and percent-encoding', () => {
    const obfuscated1 = '<a href="&#106;avascript:alert(1)">Click</a>';
    const obfuscated2 = '<a href="%6aavascript:alert(2)">Click 2</a>';
    expect(sanitizeHtml(obfuscated1)).toContain('href="#"');
    expect(sanitizeHtml(obfuscated2)).toContain('href="#"');
  });

  it('T5.5: strips dangerous tags (iframe, object, embed, form, input, style)', () => {
    const tags = [
      '<iframe src="https://evil.com"></iframe>',
      '<object data="evil.swf"></object>',
      '<embed src="evil.swf">',
      '<form action="/steal"><input type="text" /></form>',
      '<style>body { display: none; }</style>',
    ];
    for (const t of tags) {
      const sanitized = sanitizeHtml(t);
      expect(sanitized).not.toContain('<iframe');
      expect(sanitized).not.toContain('<object');
      expect(sanitized).not.toContain('<embed');
      expect(sanitized).not.toContain('<form');
      expect(sanitized).not.toContain('<input');
      expect(sanitized).not.toContain('<style');
    }
  });

  it('T5.6: enforces target="_blank" rel="noopener noreferrer" on links', () => {
    const input = '<a href="https://github.com/LogarTraders">Official Repo</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('href="https://github.com/LogarTraders"');
  });

  it('T5.7: renders safe Markdown headings, lists, bold, italics, code', () => {
    const md = '## Features\n- **Fast** sync\n- *Route* navigation\n`v1.2.0`\n\n```\ncode block\n```';
    const html = sanitizeReleaseNotes(md);
    expect(html).toContain('<h2>Features</h2>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li><strong>Fast</strong> sync</li>');
    expect(html).toContain('<em>Route</em>');
    expect(html).toContain('<code>v1.2.0</code>');
    expect(html).toContain('<pre><code>code block</code></pre>');
  });

  it('T5.8: extracts genuine labeled SHA-256 checksums', () => {
    const notes1 = 'SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const notes2 = 'sha256: E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
    const notes3 = 'checksum: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    expect(extractSha256Checksum(notes1)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(extractSha256Checksum(notes2)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(extractSha256Checksum(notes3)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('T5.9: extracts standalone 64-hex SHA-256 checksums', () => {
    const notes =
      'Binary build hash e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 verified.';
    expect(extractSha256Checksum(notes)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('T5.10: Honesty Invariant - returns null when SHA-256 is absent (never fabricates)', () => {
    expect(extractSha256Checksum('Bug fixes and stability updates.')).toBeNull();
    expect(extractSha256Checksum(null)).toBeNull();
    expect(extractSha256Checksum('')).toBeNull();
    // Rejects 40-char git commit hashes
    expect(extractSha256Checksum('Commit: 7b3117bfa00ff81b9542dcad5bb8482bf4f35832')).toBeNull();
    // Rejects 32-char MD5 hashes
    expect(extractSha256Checksum('MD5: 5d41402abc4b2a76b9719d911017c592')).toBeNull();
  });

  it('T5.11: extracts Android compatibility specs if provided', () => {
    const notes = 'Minimum Android Version: 7.0+\nTarget SDK: 34\nPackage Name: com.nextcola.distribution';
    const compat = extractAndroidCompatibility(notes);
    expect(compat.minAndroidVersion).toBe('Android 7.0+');
    expect(compat.targetSdkVersion).toBe('API 34');
    expect(compat.packageName).toBe('com.nextcola.distribution');
  });

  it('T5.12: returns null compatibility fields when specs are absent', () => {
    const notes = 'Routine release with bug fixes.';
    const compat = extractAndroidCompatibility(notes);
    expect(compat.minAndroidVersion).toBeNull();
    expect(compat.targetSdkVersion).toBeNull();
    expect(compat.packageName).toBeNull();
  });

  it('T5.13: escapeHtml escapes &, <, >, ", and single quote', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(escapeHtml('')).toBe('');
  });

  it('T5.14: renderSafeMarkdown converts markdown elements to HTML', () => {
    const md = '# Title\nParagraph with `code` and [link](https://example.com)';
    const rendered = renderSafeMarkdown(md);
    expect(rendered).toContain('<h1>Title</h1>');
    expect(rendered).toContain('<code>code</code>');
    expect(rendered).toContain('<a href="https://example.com">link</a>');
  });

  // =========================================================================
  // Milestone 1 Iteration 2: Solidus Delimiters & Whitespace Variations
  // =========================================================================

  it('T5.15: strips solidus-delimited inline handlers on <img> tags', () => {
    // Basic solidus-delimited onerror handler
    const v1 = '<img/onerror=alert(1)>';
    const out1 = sanitizeHtml(v1);
    expect(out1).not.toContain('onerror');
    expect(out1).not.toContain('alert');
    expect(out1).toBe('<img />');

    // Solidus-delimited src followed by solidus onerror handler
    const v2 = '<img/src=x/onerror=alert(1)>';
    const out2 = sanitizeHtml(v2);
    expect(out2).not.toContain('onerror');
    expect(out2).not.toContain('alert');
    expect(out2).toBe('<img />');

    // Quoted handler with solidus delimiter
    const v3 = '<img/onerror="alert(1)">';
    const out3 = sanitizeHtml(v3);
    expect(out3).not.toContain('onerror');
    expect(out3).not.toContain('alert');
    expect(out3).toBe('<img />');
  });

  it('T5.16: completely removes solidus-delimited disallowed tags (body, details)', () => {
    // Disallowed body tag with solidus onload
    const v1 = '<body/onload=alert(1)>';
    const out1 = sanitizeHtml(v1);
    expect(out1).not.toContain('onload');
    expect(out1).not.toContain('body');
    expect(out1).not.toContain('alert');
    expect(out1).toBe('');

    // Disallowed details tag with solidus ontoggle
    const v2 = '<details/ontoggle=alert(1) open>';
    const out2 = sanitizeHtml(v2);
    expect(out2).not.toContain('ontoggle');
    expect(out2).not.toContain('details');
    expect(out2).not.toContain('alert');
    expect(out2).toBe('');

    // Paired disallowed details tag with content
    const v3 = '<details/ontoggle=alert(1) open><summary>Summary</summary>Details content</details>';
    const out3 = sanitizeHtml(v3);
    expect(out3).not.toContain('ontoggle');
    expect(out3).not.toContain('<details');
    expect(out3).not.toContain('</details>');
  });

  it('T5.17: strips solidus-delimited handlers on allowed container tags (<div>)', () => {
    const input = '<div/onmouseover=alert(1)>Hover</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onmouseover');
    expect(result).not.toContain('alert');
    expect(result).toBe('<div>Hover</div>');

    // With quotes around handler
    const inputQuoted = '<div/onmouseover="alert(1)">Hover</div>';
    expect(sanitizeHtml(inputQuoted)).toBe('<div>Hover</div>');
  });

  it('T5.18: neutralizes solidus-delimited dangerous URI schemes on anchor tags (<a>)', () => {
    const input = '<a/href="javascript:alert(1)">Click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('alert');
    expect(result).toContain('href="#"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toBe('<a href="#" target="_blank" rel="noopener noreferrer">Click</a>');

    // Single quotes
    const inputSingle = "<a/href='javascript:alert(1)'>Click</a>";
    expect(sanitizeHtml(inputSingle)).toBe(
      '<a href="#" target="_blank" rel="noopener noreferrer">Click</a>'
    );
  });

  it('T5.19: handles mixed delimiter combinations with slashes and quotes', () => {
    // Relative or unwhitelisted src with solidus and quotes
    const input1 = '<img/src="valid.png"/onerror="alert(1)">';
    const result1 = sanitizeHtml(input1);
    expect(result1).not.toContain('onerror');
    expect(result1).not.toContain('alert');
    expect(result1).toBe('<img />');

    // Valid HTTPS src with solidus delimiters and quotes
    const input2 = '<img/src="https://example.com/valid.png"/onerror="alert(1)">';
    const result2 = sanitizeHtml(input2);
    expect(result2).not.toContain('onerror');
    expect(result2).not.toContain('alert');
    expect(result2).toContain('src="https://example.com/valid.png"');
    expect(result2).toBe('<img src="https://example.com/valid.png" />');

    // Multiple attributes separated by solidus
    const input3 = '<img/src="https://example.com/image.png"/alt="Logo"/onerror="alert(1)">';
    const result3 = sanitizeHtml(input3);
    expect(result3).not.toContain('onerror');
    expect(result3).not.toContain('alert');
    expect(result3).toContain('src="https://example.com/image.png"');
    expect(result3).toContain('alt="Logo"');
    expect(result3).toBe('<img src="https://example.com/image.png" alt="Logo" />');
  });

  it('T5.20: strips whitespace-delimited handlers including tabs and newlines', () => {
    // Tab delimiter
    const inputTab = '<img\tonerror=alert(1)>';
    const resultTab = sanitizeHtml(inputTab);
    expect(resultTab).not.toContain('onerror');
    expect(resultTab).not.toContain('alert');
    expect(resultTab).toBe('<img />');

    // Newline delimiter
    const inputNewline = '<img\nonerror=alert(1)>';
    const resultNewline = sanitizeHtml(inputNewline);
    expect(resultNewline).not.toContain('onerror');
    expect(resultNewline).not.toContain('alert');
    expect(resultNewline).toBe('<img />');

    // Carriage return and newline delimiter
    const inputCrLf = '<img\r\nonerror=alert(1)>';
    const resultCrLf = sanitizeHtml(inputCrLf);
    expect(resultCrLf).not.toContain('onerror');
    expect(resultCrLf).not.toContain('alert');
    expect(resultCrLf).toBe('<img />');

    // Mixed whitespace and solidus delimiters
    const inputMixed = '<img \t/\n onerror=alert(1)>';
    const resultMixed = sanitizeHtml(inputMixed);
    expect(resultMixed).not.toContain('onerror');
    expect(resultMixed).not.toContain('alert');
    expect(resultMixed).toBe('<img />');
  });

  it('T5.21: correctly preserves valid self-closing tags with and without slashes', () => {
    // Self-closing br and hr with space
    expect(sanitizeHtml('<br />')).toBe('<br />');
    expect(sanitizeHtml('<hr />')).toBe('<hr />');

    // Self-closing br and hr without space
    expect(sanitizeHtml('<br/>')).toBe('<br />');
    expect(sanitizeHtml('<hr/>')).toBe('<hr />');

    // Standard void tags without slash
    expect(sanitizeHtml('<br>')).toBe('<br />');
    expect(sanitizeHtml('<hr>')).toBe('<hr />');

    // Valid img with https src and alt attribute
    const validImg = '<img src="https://example.com/valid.png" alt="valid" />';
    expect(sanitizeHtml(validImg)).toBe(
      '<img src="https://example.com/valid.png" alt="valid" />'
    );

    // Valid img with relative src and alt attribute (relative src filtered, alt kept)
    const relativeImg = '<img src="valid.png" alt="valid" />';
    expect(sanitizeHtml(relativeImg)).toBe('<img alt="valid" />');

    // Valid img without space before slash
    const compactImg = '<img src="https://example.com/valid.png" alt="valid"/>';
    expect(sanitizeHtml(compactImg)).toBe(
      '<img src="https://example.com/valid.png" alt="valid" />'
    );
  });

  it('T5.22: end-to-end release notes sanitization strips solidus and whitespace obfuscations in Markdown', () => {
    const notes = [
      '## Release Notes v1.2.3',
      '- Important fix: <img/onerror=alert(1)>',
      '- Download link: <a/href="javascript:alert(1)">Get APK</a>',
      '- Injection attempt: <body/onload=alert(1)>',
      '- Hover attack: <div/onmouseover=alert(1)>Notice</div>',
      '- Valid screenshot: <img src="https://example.com/shot.png" alt="Screenshot" />',
      '- Valid changelog link: [Full Changelog](https://github.com/nextcola/releases/tag/v1.2.3)',
    ].join('\n');

    const sanitized = sanitizeReleaseNotes(notes);

    // Security invariants: zero malicious handlers or scripts
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('onload');
    expect(sanitized).not.toContain('onmouseover');
    expect(sanitized).not.toContain('alert');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('<body');

    // Structural invariants: markdown rendered safely
    expect(sanitized).toContain('<h2>Release Notes v1.2.3</h2>');
    expect(sanitized).toContain('<ul>');
    expect(sanitized).toContain('<li>Important fix: <img /></li>');
    expect(sanitized).toContain(
      '<li>Download link: <a href="#" target="_blank" rel="noopener noreferrer">Get APK</a></li>'
    );
    expect(sanitized).toContain('<div>Notice</div>');
    expect(sanitized).toContain(
      '<img src="https://example.com/shot.png" alt="Screenshot" />'
    );
    expect(sanitized).toContain(
      '<a href="https://github.com/nextcola/releases/tag/v1.2.3" target="_blank" rel="noopener noreferrer">Full Changelog</a>'
    );
  });

  it('T5.23: preserves URLs containing path slashes in href and src attributes', () => {
    const urlWithSlashes = 'https://github.com/nextcola/repo/releases/tag/v1.0.0';

    // Standard anchor link with path slashes
    const standardLink = `<a href="${urlWithSlashes}">Release</a>`;
    const sanitizedStandard = sanitizeHtml(standardLink);
    expect(sanitizedStandard).toContain(`href="${urlWithSlashes}"`);
    expect(sanitizedStandard).toContain('target="_blank"');
    expect(sanitizedStandard).toContain('rel="noopener noreferrer"');

    // Solidus-delimited anchor tag with path slashes
    const solidusLink = `<a/href="${urlWithSlashes}">Release</a>`;
    const sanitizedSolidus = sanitizeHtml(solidusLink);
    expect(sanitizedSolidus).toContain(`href="${urlWithSlashes}"`);
    expect(sanitizedSolidus).toContain('target="_blank"');
    expect(sanitizedSolidus).toContain('rel="noopener noreferrer"');

    // Img tag with path slashes
    const imgWithSlashes =
      '<img src="https://example.com/nested/path/to/image.png" alt="Diagram" />';
    const sanitizedImg = sanitizeHtml(imgWithSlashes);
    expect(sanitizedImg).toBe(
      '<img src="https://example.com/nested/path/to/image.png" alt="Diagram" />'
    );
  });
});
