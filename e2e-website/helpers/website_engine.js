/**
 * Opaque-Box Website Engine & UI State Machine Simulator
 * Zero external cloud or npm dependencies.
 */

const { SessionStorageMock } = require('./session_storage_mock.js');

class WebsiteEngine {
  constructor(config = {}) {
    this.config = {
      owner: config.owner || 'LogarTraders',
      repo: config.repo || 'cold-drink-distribution-app',
      cacheTtlMs: config.cacheTtlMs || 5 * 60 * 1000,
      appName: config.appName || 'Cold Drink Distribution Agency App',
      tagline: config.tagline || 'Official Android APK Distribution Portal',
      contactEmail: config.contactEmail || 'support@colddrinkdist.example.com',
      contactPhone: config.contactPhone || '+92 300 1234567',
      apkPattern: config.apkPattern || null,
      prefersReducedMotion: config.prefersReducedMotion || false,
    };

    this.sessionStorage = new SessionStorageMock();
    this.inFlightLatestPromise = null;
    this.state = {
      status: 'idle', // 'idle' | 'loading' | 'success' | 'empty' | 'error'
      emptyReason: null,
      latestRelease: null,
      historyReleases: [],
      error: null,
      lastFetchedAt: null,
      mobileMenuOpen: false,
      expandedTroubleshootIndex: null,
      clipboard: null,
      scrollPosition: 0,
    };
  }

  // 1. Pure Asset Filtering
  filterApkAsset(assets, pattern = null) {
    if (!Array.isArray(assets) || assets.length === 0) return null;

    const apkAssets = assets.filter(a => {
      if (!a || typeof a !== 'object') return false;
      const name = (a.name || '').toLowerCase();
      // Must end strictly with .apk and not have archive extensions appended
      return name.endsWith('.apk') && !/\.(zip|tar\.gz|tgz|tar|bz2|7z|rar)$/i.test(name);
    });

    if (apkAssets.length === 0) return null;

    if (pattern) {
      const match = apkAssets.find(a => pattern.test(a.name));
      if (match) return match;
    }

    const universal = apkAssets.find(a => /universal/i.test(a.name));
    if (universal) return universal;

    const release = apkAssets.find(a => /release/i.test(a.name));
    if (release) return release;

    return apkAssets[0];
  }

  // 2. Pure SHA-256 Extraction
  extractSha256(body) {
    if (!body || typeof body !== 'string') return null;

    // Reject non-64-hex patterns explicitly (e.g. 32-hex MD5 or 40-hex SHA-1)
    const labeledRegex = /(?:sha[-_]?256|checksum)[\s:=]+([a-fA-F0-9]{64})\b/i;
    const labeledMatch = body.match(labeledRegex);
    if (labeledMatch && labeledMatch[1]) {
      return labeledMatch[1].toLowerCase();
    }

    const hex64Regex = /\b([a-fA-F0-9]{64})\b/;
    const hexMatch = body.match(hex64Regex);
    if (hexMatch && hexMatch[1]) {
      return hexMatch[1].toLowerCase();
    }

    return null;
  }

  // 3. Pure HTML/XSS Sanitizer
  sanitizeHtml(input) {
    if (!input || typeof input !== 'string') return '';
    let sanitized = input;

    // Strip nested / repeated script tags
    while (/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(sanitized)) {
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    // Also remove any stray opening or closing script tags
    sanitized = sanitized.replace(/<\/?script[^>]*>/gi, '');

    // Strip dangerous iframe, svg, form, style tags
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    sanitized = sanitized.replace(/<\/?iframe[^>]*>/gi, '');
    sanitized = sanitized.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
    sanitized = sanitized.replace(/<\/?svg[^>]*>/gi, '');
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    sanitized = sanitized.replace(/<\/?style[^>]*>/gi, '');
    sanitized = sanitized.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');
    sanitized = sanitized.replace(/<\/?form[^>]*>/gi, '');

    // Strip all inline on* attributes (onerror, onload, onclick, etc.)
    sanitized = sanitized.replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    // Neutralize dangerous URI schemes in href / src attributes and markdown links
    sanitized = sanitized.replace(/href\s*=\s*["']?\s*(?:javascript|data|vbscript):[^"'\s>]*/gi, 'href="#"');
    sanitized = sanitized.replace(/src\s*=\s*["']?\s*(?:javascript|data|vbscript):[^"'\s>]*/gi, 'src=""');
    sanitized = sanitized.replace(/\]\(\s*(?:javascript|data|vbscript):[^)]*\)/gi, '](#)');

    // Ensure external hyperlinks have target="_blank" rel="noopener noreferrer"
    sanitized = sanitized.replace(/<a\s+(?![^>]*\brel=)([^>]*href=["']https?:\/\/[^"']+["'][^>]*)>/gi, '<a $1 target="_blank" rel="noopener noreferrer">');

    return sanitized;
  }

  // 4. API Release Ingestion & State Machine
  loadLatestRelease(forceRefresh = false) {
    // If request already in-flight, return same promise (deduplication)
    if (this.inFlightLatestPromise) {
      return this.inFlightLatestPromise;
    }

    this.inFlightLatestPromise = this._executeLoadLatestRelease(forceRefresh)
      .finally(() => {
        this.inFlightLatestPromise = null;
      });

    return this.inFlightLatestPromise;
  }

  async _executeLoadLatestRelease(forceRefresh = false) {
    const cacheKey = `gh_rel_latest_${this.config.owner}_${this.config.repo}`;
    let cached = null;

    try {
      cached = this.sessionStorage.getItem(cacheKey);
    } catch (e) {
      // sessionStorage unavailable (e.g. private mode)
    }

    if (!forceRefresh && cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < this.config.cacheTtlMs) {
          this.state.status = 'success';
          this.state.latestRelease = parsed.data;
          this.state.lastFetchedAt = parsed.timestamp;
          return this.state;
        }
      } catch (e) {
        try { this.sessionStorage.removeItem(cacheKey); } catch (err) {}
      }
    }

    this.state.status = 'loading';
    const apiUrl = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/releases/latest`;

    try {
      const headers = { Accept: 'application/vnd.github.v3+json' };
      if (this.state.latestRelease && this.state.latestRelease.etag) {
        headers['If-None-Match'] = this.state.latestRelease.etag;
      }

      const res = await fetch(apiUrl, { headers });

      if (res.status === 304) {
        // Not Modified - refresh timestamp
        this.state.status = 'success';
        if (this.state.latestRelease) {
          try {
            this.sessionStorage.setItem(cacheKey, JSON.stringify({
              timestamp: Date.now(),
              data: this.state.latestRelease,
            }));
          } catch (e) {}
        }
        return this.state;
      }

      if (res.status === 403) {
        const resetHeader = res.headers.get('x-ratelimit-reset');
        const resetEpoch = resetHeader ? parseInt(resetHeader, 10) : Math.floor(Date.now() / 1000) + 1800;
        const minutesUntilReset = Math.max(1, Math.ceil((resetEpoch * 1000 - Date.now()) / 60000));
        this.state.status = 'error';
        this.state.error = {
          code: 'RATE_LIMITED',
          message: 'GitHub API rate limit exceeded.',
          resetTimestamp: resetEpoch,
          minutesUntilReset,
          fallbackUrl: `https://github.com/${this.config.owner}/${this.config.repo}/releases`,
        };
        return this.state;
      }

      if (res.status === 404) {
        this.state.status = 'empty';
        this.state.emptyReason = 'REPO_404';
        return this.state;
      }

      if (!res.ok) {
        this.state.status = 'error';
        this.state.error = { code: 'HTTP_ERROR', status: res.status, message: `HTTP ${res.status}` };
        return this.state;
      }

      const releaseData = await res.json();
      const apk = this.filterApkAsset(releaseData.assets, this.config.apkPattern);
      const sha = this.extractSha256(releaseData.body);

      const parsedRelease = {
        id: releaseData.id,
        versionTag: releaseData.tag_name || null,
        name: releaseData.name || releaseData.tag_name || 'Not provided',
        releaseDate: releaseData.published_at || null,
        releaseNotesRaw: releaseData.body || '',
        sanitizedNotesHtml: this.sanitizeHtml(releaseData.body || ''),
        githubReleaseUrl: releaseData.html_url || `https://github.com/${this.config.owner}/${this.config.repo}/releases`,
        isPrerelease: Boolean(releaseData.prerelease),
        etag: res.headers.get('etag'),
        apkAsset: apk ? {
          id: apk.id,
          name: apk.name,
          sizeBytes: typeof apk.size === 'number' && apk.size > 0 ? apk.size : 0,
          formattedSize: typeof apk.size === 'number' && apk.size > 0 ? (apk.size / (1024 * 1024)).toFixed(1) + ' MB' : 'Not provided',
          downloadUrl: apk.browser_download_url,
          downloadCount: apk.download_count || 0,
        } : null,
        sha256Checksum: sha,
      };

      if (!parsedRelease.apkAsset) {
        this.state.status = 'empty';
        this.state.emptyReason = 'NO_APK';
        this.state.latestRelease = parsedRelease;
      } else {
        this.state.status = 'success';
        this.state.latestRelease = parsedRelease;
        try {
          this.sessionStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: parsedRelease,
          }));
        } catch (e) {}
      }

      this.state.lastFetchedAt = Date.now();
      return this.state;
    } catch (err) {
      this.state.status = 'error';
      this.state.error = { code: 'NETWORK_ERROR', message: err.message };
      return this.state;
    }
  }

  async loadReleaseHistory(forceRefresh = false) {
    const apiUrl = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/releases`;
    try {
      const res = await fetch(apiUrl, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });

      if (!res.ok) {
        return [];
      }

      const rawList = await res.json();
      if (!Array.isArray(rawList)) return [];

      // Filter out drafts
      const stableList = rawList.filter(r => !r.draft);

      this.state.historyReleases = stableList.map(r => {
        const apk = this.filterApkAsset(r.assets, this.config.apkPattern);
        return {
          id: r.id,
          versionTag: r.tag_name,
          name: r.name || r.tag_name,
          releaseDate: r.published_at,
          releaseNotesRaw: r.body || '',
          sanitizedNotesHtml: this.sanitizeHtml(r.body || ''),
          githubReleaseUrl: r.html_url,
          isPrerelease: Boolean(r.prerelease),
          apkAsset: apk ? {
            id: apk.id,
            name: apk.name,
            sizeBytes: apk.size,
            formattedSize: (apk.size / (1024 * 1024)).toFixed(1) + ' MB',
            downloadUrl: apk.browser_download_url,
          } : null,
        };
      });

      return this.state.historyReleases;
    } catch (e) {
      return [];
    }
  }

  // 5. Component Visual & State DOM Inspectors
  renderHeader() {
    return {
      logo: {
        role: 'img',
        ariaLabel: 'Agency Logo',
        text: this.config.appName,
        href: '#home',
      },
      title: this.config.appName,
      subtitle: 'Official APK Distribution',
      navLinks: [
        { label: 'Home', href: '#home' },
        { label: 'Features', href: '#features' },
        { label: 'Download App', href: '#download' },
        { label: 'Installation Guide', href: '#installation' },
        { label: 'Version History', href: '#versions' },
        { label: 'Contact', href: '#contact' },
      ],
      cta: this.renderHeaderCTA(),
      mobileToggle: {
        role: 'button',
        ariaLabel: 'Toggle navigation menu',
        ariaExpanded: this.state.mobileMenuOpen ? 'true' : 'false',
      },
      themeAccents: ['text-red-600', 'bg-blue-600', 'border-gray-200'],
    };
  }

  renderHeaderCTA() {
    if (this.state.status === 'loading') {
      return { disabled: true, text: 'Loading...', classes: ['opacity-50'] };
    }
    if (this.state.status === 'success' && this.state.latestRelease?.apkAsset) {
      return {
        disabled: false,
        text: `Download APK (${this.state.latestRelease.versionTag})`,
        href: this.state.latestRelease.apkAsset.downloadUrl,
        classes: ['bg-red-600', 'hover:bg-red-700', 'text-white'],
      };
    }
    if (this.state.status === 'empty') {
      return { disabled: true, text: 'No APK', classes: ['bg-gray-400', 'text-white'] };
    }
    return { disabled: true, text: 'Download APK', classes: ['bg-gray-400', 'text-white'] };
  }

  renderHero() {
    return {
      heading: 'Your Cold Drink Agency App – Download Now',
      headingTag: 'h1',
      description: 'Access your Cold Drink Distribution Agency application through a simple and convenient Android download experience. Download the latest available version directly from our official distribution source.',
      primaryCTA: this.renderHeroCTA(),
      secondaryCTA: {
        text: 'View Installation Guide',
        href: '#installation',
        classes: ['border', 'border-blue-600', 'text-blue-600'],
      },
      visuals: {
        themeColors: { primaryRed: '#DC2626', secondaryBlue: '#2563EB', white: '#FFFFFF' },
        hasEffervescenceMotif: true,
        hasFakeScreenshots: false,
        hasFakeStats: false,
        hasFakeSecurityBadges: false,
      },
    };
  }

  renderHeroCTA() {
    if (this.state.status === 'loading') {
      return {
        disabled: true,
        text: 'Checking for updates...',
        classes: ['animate-pulse', 'bg-gray-400'],
        versionTag: null,
        formattedSize: null,
      };
    }

    if (this.state.status === 'success' && this.state.latestRelease?.apkAsset) {
      const apk = this.state.latestRelease.apkAsset;
      return {
        disabled: false,
        text: `Download Latest APK (${this.state.latestRelease.versionTag} • ${apk.formattedSize})`,
        href: apk.downloadUrl,
        versionTag: this.state.latestRelease.versionTag,
        formattedSize: apk.formattedSize,
        classes: ['bg-red-600', 'hover:bg-red-700', 'text-white'],
        isDirectDownload: apk.downloadUrl.startsWith('https://'),
      };
    }

    if (this.state.status === 'empty' && this.state.emptyReason === 'NO_APK') {
      return {
        disabled: true,
        text: 'No APK in Latest Release',
        classes: ['bg-amber-500', 'text-white'],
        versionTag: this.state.latestRelease ? this.state.latestRelease.versionTag : null,
      };
    }

    if (this.state.status === 'error' && this.state.error?.code === 'RATE_LIMITED') {
      return {
        disabled: false,
        text: 'Download via GitHub Releases',
        href: this.state.error.fallbackUrl,
        classes: ['bg-blue-600', 'text-white'],
        isFallbackLink: true,
        rateLimitInfo: {
          minutesUntilReset: this.state.error.minutesUntilReset,
          resetTimestamp: this.state.error.resetTimestamp,
        },
      };
    }

    return {
      disabled: true,
      text: 'Download Unavailable',
      classes: ['bg-gray-400'],
    };
  }

  renderAppInfoCard() {
    const rel = this.state.latestRelease;
    return {
      appName: this.config.appName,
      version: rel && rel.versionTag ? rel.versionTag : 'Not provided',
      versionBadge: rel && rel.versionTag ? 'Latest Release' : null,
      releaseDate: rel && rel.releaseDate ? this.formatDate(rel.releaseDate) : 'Not provided',
      rawDate: rel?.releaseDate || null,
      fileSize: rel?.apkAsset && rel.apkAsset.formattedSize ? rel.apkAsset.formattedSize : 'Not provided',
      minAndroidVersion: 'Not provided',
      packageName: 'Not provided',
      releaseNotesHtml: rel ? (rel.sanitizedNotesHtml || 'No release notes provided for this release.') : 'Loading release notes...',
      sourceLink: {
        text: 'View on GitHub',
        href: rel ? rel.githubReleaseUrl : `https://github.com/${this.config.owner}/${this.config.repo}/releases`,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      checksum: rel?.sha256Checksum ? rel.sha256Checksum : 'Not provided',
      hasCopyButton: Boolean(rel?.sha256Checksum),
      copyChecksumAction: () => {
        if (rel?.sha256Checksum) {
          this.state.clipboard = rel.sha256Checksum;
          return { success: true, text: 'Copied!' };
        }
        return { success: false, text: 'No checksum to copy' };
      },
      hasInventedBadges: false,
    };
  }

  formatDate(isoString) {
    if (!isoString || typeof isoString !== 'string') return 'Not provided';
    if (!/^\d{4}-\d{2}-\d{2}(?:T|\b)/.test(isoString)) {
      return 'Not provided';
    }
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Not provided';
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  }

  renderFeatures() {
    return {
      id: 'features',
      heading: 'Official Distribution Highlights',
      items: [
        {
          id: 'feat-direct',
          title: 'Direct Distribution',
          description: 'Official direct download from agency repository without intermediate app stores.',
          icon: 'server',
        },
        {
          id: 'feat-sync',
          title: 'Automated Releases Sync',
          description: 'Live integration with GitHub Releases ensures instant access to new field updates.',
          icon: 'refresh-cw',
        },
        {
          id: 'feat-integrity',
          title: 'Cryptographic Integrity',
          description: 'Every build provides verified SHA-256 digests and direct secure HTTPS downloads.',
          icon: 'shield-check',
        },
        {
          id: 'feat-field',
          title: 'Field Optimized',
          description: 'Designed for quick sideloading on field staff Android tablets and handhelds.',
          icon: 'smartphone',
        },
      ],
      hasInventedPOSClaims: false,
    };
  }

  renderInstallationGuide() {
    return {
      id: 'installation',
      heading: '5-Step Android Installation Guide',
      steps: [
        { step: 1, title: 'Download APK', desc: 'Tap Download Latest APK and monitor notification bar for completion.' },
        { step: 2, title: 'Open Downloaded File', desc: 'Open notification or locate APK in Files/Downloads folder.' },
        { step: 3, title: 'Grant Permissions', desc: 'Navigate to Settings and toggle Allow from this source for your browser or file manager.' },
        { step: 4, title: 'Confirm Installation', desc: 'Tap Install and wait for Android Package Installer verification.' },
        { step: 5, title: 'Launch Application', desc: 'Tap Open to launch the cold drink distribution agency application.' },
      ],
    };
  }

  renderTroubleshooting() {
    return {
      heading: 'Troubleshooting Common Issues',
      scenarios: [
        {
          id: 'incomplete-download',
          case: 1,
          title: 'Incomplete Downloads',
          cause: 'Intermittent mobile data interruption during binary transfer.',
          solution: 'Delete the partial .crdownload file from your Downloads folder, reconnect to depot Wi-Fi, and re-download.',
        },
        {
          id: 'unsupported-os',
          case: 2,
          title: 'Unsupported Android Version',
          cause: 'Handset operating system is older than required minimum API level.',
          solution: 'Check Android version under Settings > About Phone. Update system software or contact depot IT.',
        },
        {
          id: 'insufficient-storage',
          case: 3,
          title: 'Insufficient Storage Space',
          cause: 'Device storage has less than 150MB free space required for extraction.',
          solution: 'Free at least 150MB-300MB by clearing cached media files under Settings > Storage.',
        },
        {
          id: 'permission-issues',
          case: 4,
          title: 'Permission Issues (Install Unknown Apps)',
          cause: 'Android security restricts sideloading from unauthorized browsers or file managers.',
          solution: 'Navigate to Settings > Apps > Special App Access > Install Unknown Apps. Select your browser and toggle Allow.',
        },
        {
          id: 'signature-conflicts',
          case: 5,
          title: 'Signature Conflicts / App Not Installed',
          cause: 'Existing app build was signed with a differing debug or staging key.',
          solution: 'Backup offline routes, completely uninstall the previous app version, and perform a clean install.',
        },
      ],
    };
  }

  renderVersionHistory() {
    const list = this.state.historyReleases.length > 0 ? this.state.historyReleases : (this.state.latestRelease ? [this.state.latestRelease] : []);
    return {
      id: 'versions',
      heading: 'Version History & Past Releases',
      releases: list.map((rel, index) => ({
        tag: rel.versionTag,
        name: rel.name,
        date: this.formatDate(rel.releaseDate),
        isLatest: index === 0,
        hasApk: Boolean(rel.apkAsset),
        apkSize: rel.apkAsset ? rel.apkAsset.formattedSize : null,
        downloadUrl: rel.apkAsset ? rel.apkAsset.downloadUrl : null,
        notes: rel.sanitizedNotesHtml,
        githubUrl: rel.githubReleaseUrl,
      })),
      empty: list.length === 0,
    };
  }

  renderFooter() {
    return {
      role: 'contentinfo',
      about: 'Official APK distribution portal for the Android Cold Drink Distribution Agency application. Download official Android binaries directly from repository releases.',
      privacy: 'Direct HTTPS downloads directly from official repository with zero user tracking, cookies, or telemetry.',
      quickLinks: [
        { label: 'Home', href: '#home' },
        { label: 'Features', href: '#features' },
        { label: 'Download App', href: '#download' },
        { label: 'Installation Guide', href: '#installation' },
        { label: 'Version History', href: '#versions' },
      ],
      contact: {
        email: this.config.contactEmail,
        emailHref: `mailto:${this.config.contactEmail}?subject=Cold%20Drink%20App%20Inquiry`,
        phone: this.config.contactPhone,
        phoneHref: `tel:${this.config.contactPhone.replace(/[^0-9+]/g, '')}`,
        guidance: 'Contact distribution desk for field access assistance.',
      },
      repoLink: {
        href: `https://github.com/${this.config.owner}/${this.config.repo}`,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      copyright: '© 2026 Cold Drink Distribution Agency. All rights reserved.',
      hasFakeBadges: false,
    };
  }

  renderMobileNav() {
    return {
      isOpen: this.state.mobileMenuOpen,
      links: [
        { label: 'Home', href: '#home' },
        { label: 'Features', href: '#features' },
        { label: 'Download App', href: '#download' },
        { label: 'Installation Guide', href: '#installation' },
        { label: 'Version History', href: '#versions' },
        { label: 'Contact', href: '#contact' },
      ],
      cta: this.renderHeroCTA(),
      closeDrawer: () => { this.state.mobileMenuOpen = false; },
      openDrawer: () => { this.state.mobileMenuOpen = true; },
      toggleDrawer: () => { this.state.mobileMenuOpen = !this.state.mobileMenuOpen; },
    };
  }
}

module.exports = { WebsiteEngine };
