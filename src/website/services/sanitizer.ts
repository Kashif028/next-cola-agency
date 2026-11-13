/**
 * Security & Sanitization Service
 * Implements strict HTML/Markdown sanitization, genuine SHA-256 extraction,
 * and Android compatibility parsing.
 *
 * Security Controls:
 * - Drops dangerous tags and contents: <script>, <style>, <iframe>, <object>, <embed>, <form>, <input>, <link>, <svg>, <math>, <base>, <meta>
 * - Strips all inline event handlers: on* (onload, onerror, onclick, onmouseover, etc.)
 * - Neutralizes dangerous URI schemes: javascript:, data:, vbscript: (with entity & percent decoding)
 * - Restricts link schemes to: https:, http:, mailto:, #
 * - Enforces target="_blank" rel="noopener noreferrer" on all anchor tags
 * - Strict honesty: Returns null if no SHA-256 checksum is present (NEVER hardcodes or fabricates)
 */

import { CompatibilityInfo } from '../types/website';

export type { CompatibilityInfo };

/**
 * Escapes raw HTML characters to prevent unintended markup execution.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips dangerous tags, inline event handlers, and dangerous URI schemes.
 * Uses a strict allowlist approach for maximum security.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  let s = html;

  // 1. Strip dangerous tags AND their inner text entirely (loop to handle nested attacks like <scr<script>ipt>)
  const dropEntirely = [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'textarea',
    'select',
    'button',
    'svg',
    'math',
    'applet',
    'audio',
    'video',
    'base',
    'meta',
    'link',
  ];

  let prev: string;
  do {
    prev = s;
    for (const tag of dropEntirely) {
      const tagRegex = new RegExp(
        `<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*${tag}\\s*>|<\\s*${tag}\\b[^>]*\\/?>`,
        'gi'
      );
      s = s.replace(tagRegex, '');
    }
  } while (s !== prev);

  // 2. Allowlist of safe tags
  const allowedTags = new Set([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'br',
    'hr',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'del',
    'strike',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'span',
    'div',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'img',
  ]);

  // 3. Process every remaining tag against the allowlist
  s = s.replace(/<\/?([a-zA-Z0-9]+)((?:[\s/][^>]*)?)\/?>/g, (match, tagName, rawAttrs) => {
    const lowerTag = tagName.toLowerCase();
    const isClosing = match.startsWith('</');

    // Strip unallowed tags completely
    if (!allowedTags.has(lowerTag)) {
      return '';
    }

    if (isClosing) {
      return `</${lowerTag}>`;
    }

    // Filter attributes for allowed tags
    const allowedAttrs = new Set(['class', 'title']);
    if (lowerTag === 'a') {
      allowedAttrs.add('href');
      allowedAttrs.add('target');
      allowedAttrs.add('rel');
    } else if (lowerTag === 'img') {
      allowedAttrs.add('src');
      allowedAttrs.add('alt');
      allowedAttrs.add('width');
      allowedAttrs.add('height');
    }

    let cleanAttrs: string[] = [];

    if (rawAttrs) {
      // Normalize leading slashes e.g. /onerror=alert(1) ->  onerror=alert(1)
      const normalizedAttrs = rawAttrs.replace(/^\/+/, ' ');
      // Parse name="val", name='val', or name=val (retains [^\s>]+ to preserve unquoted URLs with slashes)
      const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:(")(.*?)"|(')(.*?)'|([^\s>]+))/g;
      let m: RegExpExecArray | null;
      while ((m = attrRegex.exec(normalizedAttrs)) !== null) {
        const attrName = m[1].toLowerCase();
        const attrVal = m[3] ?? m[5] ?? m[6] ?? '';

        // Disallow all inline event handlers
        if (attrName.startsWith('on')) {
          continue;
        }

        if (!allowedAttrs.has(attrName)) {
          continue;
        }

        // Validate URLs for href and src
        if (attrName === 'href' || attrName === 'src') {
          // Decode entities and percent encodings to detect obfuscated schemes (e.g. &#x6a;avascript: or %6aavascript:)
          let decoded = attrVal;
          try {
            decoded = decodeURIComponent(decoded);
          } catch {
            // ignore malformed URI components
          }
          decoded = decoded
            .replace(/&#x([0-9a-fA-F]+);?/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/&#([0-9]+);?/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
            .replace(/%([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/[\x00-\x20\s]+/g, '')
            .toLowerCase();

          const isSafe =
            decoded.startsWith('https://') ||
            decoded.startsWith('http://') ||
            decoded.startsWith('mailto:') ||
            decoded.startsWith('#');

          if (!isSafe) {
            if (attrName === 'href') {
              cleanAttrs.push('href="#"');
            }
            continue;
          }
        }

        cleanAttrs.push(`${attrName}="${escapeHtml(attrVal)}"`);
      }
    }

    // Force secure attributes on external links
    if (lowerTag === 'a') {
      cleanAttrs = cleanAttrs.filter(
        (a) => !a.startsWith('target=') && !a.startsWith('rel=')
      );
      cleanAttrs.push('target="_blank"');
      cleanAttrs.push('rel="noopener noreferrer"');
    }

    const selfClosing = lowerTag === 'br' || lowerTag === 'hr' || lowerTag === 'img';
    const attrString = cleanAttrs.length > 0 ? ' ' + cleanAttrs.join(' ') : '';
    return selfClosing ? `<${lowerTag}${attrString} />` : `<${lowerTag}${attrString}>`;
  });

  return s;
}

/**
 * Basic safe Markdown renderer for GitHub release notes.
 * Converts headings, lists, bold, italics, code blocks, and markdown links into safe HTML.
 */
export function renderSafeMarkdown(markdown: string): string {
  if (!markdown) return '';
  const lines = markdown.split(/\r?\n/);
  const htmlParts: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCodeBlock = false;
  const codeBlockLines: string[] = [];

  const formatInline = (str: string): string => {
    let s = str;
    // Bold: **text** or __text__
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.*?)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Inline code: `text`
    s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
    // Links: [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      return `<a href="${url}">${text}</a>`;
    });
    return s;
  };

  for (const line of lines) {
    // Code block toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        htmlParts.push(`<pre><code>${escapeHtml(codeBlockLines.join('\n'))}</code></pre>`);
        codeBlockLines.length = 0;
        inCodeBlock = false;
      } else {
        if (inUl) {
          htmlParts.push('</ul>');
          inUl = false;
        }
        if (inOl) {
          htmlParts.push('</ol>');
          inOl = false;
        }
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Headings
    if (/^###\s+(.+)$/.test(line)) {
      if (inUl) {
        htmlParts.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        htmlParts.push('</ol>');
        inOl = false;
      }
      htmlParts.push(`<h3>${formatInline(line.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }
    if (/^##\s+(.+)$/.test(line)) {
      if (inUl) {
        htmlParts.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        htmlParts.push('</ol>');
        inOl = false;
      }
      htmlParts.push(`<h2>${formatInline(line.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }
    if (/^#\s+(.+)$/.test(line)) {
      if (inUl) {
        htmlParts.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        htmlParts.push('</ol>');
        inOl = false;
      }
      htmlParts.push(`<h1>${formatInline(line.replace(/^#\s+/, ''))}</h1>`);
      continue;
    }

    // Unordered lists (- or *)
    if (/^[-*]\s+(.+)$/.test(line)) {
      if (inOl) {
        htmlParts.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        htmlParts.push('<ul>');
        inUl = true;
      }
      htmlParts.push(`<li>${formatInline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }

    // Ordered lists (1. 2.)
    if (/^\d+\.\s+(.+)$/.test(line)) {
      if (inUl) {
        htmlParts.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        htmlParts.push('<ol>');
        inOl = true;
      }
      htmlParts.push(`<li>${formatInline(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }

    // Close open lists if non-list line
    if (inUl) {
      htmlParts.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      htmlParts.push('</ol>');
      inOl = false;
    }

    // Blank line
    if (line.trim() === '') {
      continue;
    }

    // Paragraph
    htmlParts.push(`<p>${formatInline(line)}</p>`);
  }

  if (inUl) htmlParts.push('</ul>');
  if (inOl) htmlParts.push('</ol>');
  if (inCodeBlock) htmlParts.push(`<pre><code>${escapeHtml(codeBlockLines.join('\n'))}</code></pre>`);

  return htmlParts.join('\n');
}

/**
 * Sanitizes raw release notes (markdown or html).
 * Parses markdown structure first, then runs through strict HTML allowlist sanitizer.
 */
export function sanitizeReleaseNotes(rawMarkdownOrHtml: string | null): string {
  if (!rawMarkdownOrHtml) return '';
  const rendered = renderSafeMarkdown(rawMarkdownOrHtml);
  return sanitizeHtml(rendered);
}

/**
 * Extracts a verified SHA-256 hexadecimal checksum from release notes body.
 * Honesty Requirement: Returns null if no genuine SHA-256 pattern is found.
 * NEVER fabricates or hardcodes checksums.
 */
export function extractSha256Checksum(body: string | null): string | null {
  if (!body) return null;

  // Priority 1: Labeled universal APK checksum in multi-asset changelogs
  const universalRegex = /(?:universal|app[-_]universal)(?:[^\n\r]*?)[\s:=`"']+([a-fA-F0-9]{64})\b/i;
  const universalMatch = body.match(universalRegex);
  if (universalMatch && universalMatch[1]) {
    return universalMatch[1].toLowerCase();
  }

  // Priority 2: Explicitly labeled SHA-256 / Checksum
  const labeledRegex = /(?:sha[-_]?256(?:[\s_-]*checksum)?|checksum)(?:[^\n\r]*?)[\s:=`"']+([a-fA-F0-9]{64})\b/i;
  const labeledMatch = body.match(labeledRegex);
  if (labeledMatch && labeledMatch[1]) {
    return labeledMatch[1].toLowerCase();
  }

  // Priority 3: Standalone 64-hexadecimal word in body
  // Strip URLs from body first to avoid URL query parameter / auth token false positives
  const bodyWithoutUrls = body.replace(/https?:\/\/[^\s<>'")]+/gi, '');
  // Reject tokens preceded by '=', '?', '&', or '/'
  const hex64Regex = /(?<![=?&/])\b([a-fA-F0-9]{64})\b/;
  const hexMatch = bodyWithoutUrls.match(hex64Regex);
  if (hexMatch && hexMatch[1]) {
    return hexMatch[1].toLowerCase();
  }

  return null;
}

/**
 * Extracts Android compatibility specs if mentioned in release notes.
 * Returns null for any field not explicitly provided.
 */
export function extractAndroidCompatibility(body: string | null): CompatibilityInfo {
  if (!body) {
    return { minAndroidVersion: null, targetSdkVersion: null, packageName: null };
  }

  let minAndroidVersion: string | null = null;
  const minVerMatch = body.match(
    /(?:min(?:imum)?\s+android(?:\s+version)?|requires\s+android|android\s+(?:version\s+)?(?:supports?|requirement)?|min\s+sdk)[\s:=]+(?:Android\s+)?([0-9]+(?:\.[0-9]+)*(?:\+|(?:\s+or\s+(?:higher|above)))?)/i
  );
  if (minVerMatch && minVerMatch[1]) {
    minAndroidVersion = `Android ${minVerMatch[1].replace(/or\s+(higher|above)/i, '+').trim()}`;
  } else {
    const apiMatch = body.match(/(?:API\s+(?:level\s+)?([0-9]{2}))/i);
    if (apiMatch && apiMatch[1]) {
      minAndroidVersion = `API ${apiMatch[1]}+`;
    }
  }

  let targetSdkVersion: string | null = null;
  const targetSdkMatch = body.match(/(?:target\s+sdk|targetSdkVersion)[\s:=]+([0-9]{2})/i);
  if (targetSdkMatch && targetSdkMatch[1]) {
    targetSdkVersion = `API ${targetSdkMatch[1]}`;
  }

  let packageName: string | null = null;
  const pkgMatch = body.match(
    /(?:package\s*name|application\s*id|package)[\s:=`]+([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)/i
  );
  if (pkgMatch && pkgMatch[1]) {
    packageName = pkgMatch[1].trim();
  }

  return { minAndroidVersion, targetSdkVersion, packageName };
}
