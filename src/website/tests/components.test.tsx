import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { AppInfoCard } from '../components/AppInfoCard';
import { Features } from '../components/Features';
import { InstallationGuide } from '../components/InstallationGuide';
import { Troubleshooting } from '../components/Troubleshooting';
import { VersionHistory } from '../components/VersionHistory';
import { Footer } from '../components/Footer';
import { WebsiteApp } from '../WebsiteApp';
import App from '../../App';
import { ReleaseInfo } from '../types/website';

// Mock test fixtures
const validRelease: ReleaseInfo = {
  id: 101,
  versionTag: 'v1.2.0',
  title: 'Nextco Distribution v1.2.0',
  releaseDate: '2026-11-10T12:00:00Z',
  formattedDate: 'November 10, 2026',
  releaseNotesRaw: '## Release notes with sha256 checksum\nsha256: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
  sanitizedNotesHtml: '<h2>Release notes with sha256 checksum</h2>\n<p>sha256: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069</p>',
  githubReleaseUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v1.2.0',
  isPrerelease: false,
  apkAsset: {
    id: 501,
    filename: 'cold-drink-distribution-universal-v1.2.0.apk',
    sizeBytes: 25690112,
    formattedSize: '24.5 MB',
    downloadUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v1.2.0/cold-drink-distribution-universal-v1.2.0.apk',
    downloadCount: 120,
    updatedAt: '2026-11-10T12:05:00Z',
  },
  sha256Checksum: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
  compatibility: {
    minAndroidVersion: 'Android 8.0 (Oreo)+',
    targetSdkVersion: 'API Level 34',
    packageName: 'com.logartraders.colddrinkdistribution',
  },
};

const releaseWithoutApk: ReleaseInfo = {
  ...validRelease,
  apkAsset: null,
};

const releaseWithoutSha: ReleaseInfo = {
  ...validRelease,
  sha256Checksum: null,
  compatibility: { minAndroidVersion: null, targetSdkVersion: null, packageName: null },
};

describe('Component Unit & Integration Suite (renderToStaticMarkup)', () => {
  // 1. Header.tsx Tests
  describe('Header Component', () => {
    it('CMP-NAV-01: Renders agency branding and logo role="img"', () => {
      const html = renderToStaticMarkup(<Header latestRelease={validRelease} status="success" />);
      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="Agency Logo"');
    });

    it('CMP-NAV-02: Renders title and official subtitle badge', () => {
      const html = renderToStaticMarkup(<Header latestRelease={validRelease} status="success" />);
      expect(html).toContain('Official APK Distribution');
    });

    it('CMP-NAV-03: Renders all 6 desktop navigation links with exact # anchors', () => {
      const html = renderToStaticMarkup(<Header latestRelease={validRelease} status="success" />);
      expect(html).toContain('href="#home"');
      expect(html).toContain('href="#features"');
      expect(html).toContain('href="#download"');
      expect(html).toContain('href="#installation"');
      expect(html).toContain('href="#versions"');
      expect(html).toContain('href="#contact"');
    });

    it('CMP-NAV-04: Renders header CTA in loading state as disabled', () => {
      const html = renderToStaticMarkup(<Header latestRelease={null} status="loading" />);
      expect(html).toContain('disabled');
      expect(html).toContain('Loading...');
    });

    it('CMP-NAV-05: Renders header CTA in success state with version tag and direct link', () => {
      const html = renderToStaticMarkup(<Header latestRelease={validRelease} status="success" />);
      expect(html).toContain('Download APK (v1.2.0)');
      expect(html).toContain('href="https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v1.2.0/cold-drink-distribution-universal-v1.2.0.apk"');
    });

    it('CMP-NAV-06: Renders header CTA in empty state as disabled "No APK"', () => {
      const html = renderToStaticMarkup(<Header latestRelease={releaseWithoutApk} status="empty" />);
      expect(html).toContain('disabled');
      expect(html).toContain('No APK');
    });

    it('CMP-NAV-07: Mobile hamburger button has accessible aria attributes', () => {
      const html = renderToStaticMarkup(<Header latestRelease={validRelease} status="success" />);
      expect(html).toContain('aria-label="Toggle navigation menu"');
      expect(html).toContain('aria-expanded="false"');
    });
  });

  // 2. Hero.tsx Tests
  describe('Hero Component', () => {
    it('CMP-HERO-01: Renders verbatim headline inside semantic <h1>', () => {
      const html = renderToStaticMarkup(<Hero latestRelease={validRelease} status="success" />);
      expect(html).toMatch(/<h1[^>]*>Your Cold Drink Agency App – Download Now<\/h1>/);
    });

    it('CMP-HERO-02: Renders verbatim supporting description', () => {
      const html = renderToStaticMarkup(<Hero latestRelease={validRelease} status="success" />);
      expect(html).toContain(
        'Access your Cold Drink Distribution Agency application through a simple and convenient Android download experience. Download the latest available version directly from our official distribution source.'
      );
    });

    it('CMP-HERO-03: Primary CTA renders "Download Latest APK" with version and size', () => {
      const html = renderToStaticMarkup(<Hero latestRelease={validRelease} status="success" />);
      expect(html).toContain('Download Latest APK (v1.2.0 • 24.5 MB)');
      expect(html).toContain('href="https://github.com/');
    });

    it('CMP-HERO-04: Primary CTA in loading state renders disabled "Checking for updates..."', () => {
      const html = renderToStaticMarkup(<Hero latestRelease={null} status="loading" />);
      expect(html).toContain('disabled');
      expect(html).toContain('Checking for updates...');
    });

    it('CMP-HERO-05: Primary CTA in empty state renders disabled "No APK in Latest Release"', () => {
      const html = renderToStaticMarkup(
        <Hero latestRelease={releaseWithoutApk} status="empty" emptyReason="NO_APK" />
      );
      expect(html).toContain('disabled');
      expect(html).toContain('No APK in Latest Release');
    });

    it('CMP-HERO-06: Primary CTA in rate limit error renders fallback link', () => {
      const html = renderToStaticMarkup(
        <Hero
          latestRelease={null}
          status="error"
          error={{
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded',
            fallbackUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases',
            minutesUntilReset: 25,
          }}
        />
      );
      expect(html).toContain('Download via GitHub Releases');
      expect(html).toContain('href="https://github.com/LogarTraders/cold-drink-distribution-app/releases"');
    });

    it('CMP-HERO-07: Secondary CTA renders verbatim "View Installation Guide" linking to #installation', () => {
      const html = renderToStaticMarkup(<Hero latestRelease={validRelease} status="success" />);
      expect(html).toContain('View Installation Guide');
      expect(html).toContain('href="#installation"');
    });

    it('CMP-HERO-08: Beverage visual presentation applies crimson red and cobalt blue without fake badges', () => {
      const html = renderToStaticMarkup(<Hero latestRelease={validRelease} status="success" />);
      expect(html).toContain('bg-red-600');
      expect(html).not.toContain('Norton');
      expect(html).not.toContain('McAfee');
      expect(html).not.toContain('10,000+ Downloads');
    });
  });

  // 3. AppInfoCard.tsx Tests
  describe('AppInfoCard Component', () => {
    it('CMP-CARD-01: Displays application name and version tag with badge', () => {
      const html = renderToStaticMarkup(<AppInfoCard latestRelease={validRelease} status="success" />);
      expect(html).toContain('v1.2.0');
      expect(html).toContain('Latest Release');
    });

    it('CMP-CARD-02: Displays release date and formatted size', () => {
      const html = renderToStaticMarkup(<AppInfoCard latestRelease={validRelease} status="success" />);
      expect(html).toContain('November 10, 2026');
      expect(html).toContain('24.5 MB');
    });

    it('CMP-CARD-03: Displays verbatim "Not provided" when Android compatibility is null', () => {
      const html = renderToStaticMarkup(<AppInfoCard latestRelease={releaseWithoutSha} status="success" />);
      expect(html).toContain('Not provided');
    });

    it('CMP-CARD-04: Displays verbatim "Not provided" when package name is null', () => {
      const html = renderToStaticMarkup(<AppInfoCard latestRelease={releaseWithoutSha} status="success" />);
      expect(html).toContain('Not provided');
    });

    it('CMP-CARD-05: Renders sanitized notes safely without unescaped script tags', () => {
      const html = renderToStaticMarkup(<AppInfoCard latestRelease={validRelease} status="success" />);
      expect(html).toContain('Release notes with sha256 checksum');
      expect(html).not.toContain('<script>');
    });

    it('CMP-CARD-06: Source link points to GitHub release with secure rel attributes', () => {
      const html = renderToStaticMarkup(<AppInfoCard latestRelease={validRelease} status="success" />);
      expect(html).toContain('href="https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v1.2.0"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    });

    it('CMP-CARD-07: Displays 64-hex SHA-256 checksum with Copy Checksum button', () => {
      const html = renderToStaticMarkup(<AppInfoCard latestRelease={validRelease} status="success" />);
      expect(html).toContain('7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069');
      expect(html).toContain('Copy Checksum');
    });

    it('CMP-CARD-08: Displays "Not provided" and omits copy button when SHA-256 is null', () => {
      const html = renderToStaticMarkup(<AppInfoCard latestRelease={releaseWithoutSha} status="success" />);
      expect(html).toContain('Not provided');
      expect(html).not.toContain('Copy Checksum');
    });
  });

  // 4. Features.tsx Tests
  describe('Features Component', () => {
    it('CMP-FEAT-01: Section has id="features" and heading "Official Distribution Highlights"', () => {
      const html = renderToStaticMarkup(<Features />);
      expect(html).toContain('id="features"');
      expect(html).toContain('Official Distribution Highlights');
    });

    it('CMP-FEAT-02: Renders all 4 distribution highlights', () => {
      const html = renderToStaticMarkup(<Features />);
      expect(html).toContain('Direct Distribution');
      expect(html).toContain('Automated Releases Sync');
      expect(html).toContain('Cryptographic Integrity');
      expect(html).toContain('Field Optimized');
    });

    it('CMP-FEAT-03: Verified absence of invented POS, sales, billing, or inventory marketing claims', () => {
      const html = renderToStaticMarkup(<Features />);
      expect(html).not.toContain('POS Checkout');
      expect(html).not.toContain('Cash Register');
      expect(html).not.toContain('Thermal Receipt');
    });
  });

  // 5. InstallationGuide.tsx Tests
  describe('InstallationGuide Component', () => {
    it('CMP-GUIDE-01: Section has id="installation" and heading "5-Step Android Installation Guide"', () => {
      const html = renderToStaticMarkup(<InstallationGuide />);
      expect(html).toContain('id="installation"');
      expect(html).toContain('5-Step Android Installation Guide');
    });

    it('CMP-GUIDE-02: Renders all 5 numbered steps in sequence', () => {
      const html = renderToStaticMarkup(<InstallationGuide />);
      expect(html).toContain('Download APK');
      expect(html).toContain('Open Downloaded File');
      expect(html).toContain('Grant Permissions');
      expect(html).toContain('Confirm Installation');
      expect(html).toContain('Launch Application');
    });

    it('CMP-GUIDE-03: Includes security guidance for granting installation permissions', () => {
      const html = renderToStaticMarkup(<InstallationGuide />);
      expect(html).toContain('Allow from this source');
    });
  });

  // 6. Troubleshooting.tsx Tests
  describe('Troubleshooting Component', () => {
    it('CMP-TRBL-01: Section has id="troubleshooting" and heading "Troubleshooting Common Issues"', () => {
      const html = renderToStaticMarkup(<Troubleshooting />);
      expect(html).toContain('id="troubleshooting"');
      expect(html).toContain('Troubleshooting Common Issues');
    });

    it('CMP-TRBL-02: Covers all 5 error scenarios', () => {
      const html = renderToStaticMarkup(<Troubleshooting />);
      expect(html).toContain('Incomplete Downloads');
      expect(html).toContain('Unsupported Android Version');
      expect(html).toContain('Insufficient Storage Space');
      expect(html).toContain('Permission Issues (Install Unknown Apps)');
      expect(html).toContain('Signature Conflicts / App Not Installed');
    });

    it('CMP-TRBL-03: Each scenario contains actionable solutions', () => {
      const html = renderToStaticMarkup(<Troubleshooting />);
      expect(html).toContain('.crdownload');
      expect(html).toContain('Settings');
      expect(html).toContain('Special App Access');
    });
  });

  // 7. VersionHistory.tsx Tests
  describe('VersionHistory Component', () => {
    it('CMP-HIST-01: Section has id="versions" and id="history"', () => {
      const html = renderToStaticMarkup(
        <VersionHistory releases={[validRelease]} status="success" />
      );
      expect(html).toContain('id="versions"');
      expect(html).toContain('id="history"');
    });

    it('CMP-HIST-02: Renders heading "Version History & Past Releases"', () => {
      const html = renderToStaticMarkup(
        <VersionHistory releases={[validRelease]} status="success" />
      );
      expect(html).toContain('Version History &amp; Past Releases');
    });

    it('CMP-HIST-03: Renders release cards with direct APK download link', () => {
      const html = renderToStaticMarkup(
        <VersionHistory releases={[validRelease]} status="success" />
      );
      expect(html).toContain('v1.2.0');
      expect(html).toContain('Download APK (24.5 MB)');
      expect(html).toContain('href="https://github.com/LogarTraders/cold-drink-distribution-app/releases/download/v1.2.0/');
    });

    it('CMP-HIST-04: Displays empty state message when list is empty', () => {
      const html = renderToStaticMarkup(
        <VersionHistory releases={[]} status="success" />
      );
      expect(html).toContain('No previous releases available.');
    });
  });

  // 8. Footer.tsx Tests
  describe('Footer Component', () => {
    it('CMP-FOOT-01: Semantic <footer role="contentinfo"> with id="footer" and id="contact"', () => {
      const html = renderToStaticMarkup(<Footer />);
      expect(html).toContain('role="contentinfo"');
      expect(html).toContain('id="footer"');
      expect(html).toContain('id="contact"');
    });

    it('CMP-FOOT-02: Renders quick navigation links to sections', () => {
      const html = renderToStaticMarkup(<Footer />);
      expect(html).toContain('href="#home"');
      expect(html).toContain('href="#features"');
      expect(html).toContain('href="#download"');
      expect(html).toContain('href="#installation"');
      expect(html).toContain('href="#versions"');
    });

    it('CMP-FOOT-03: Contact email rendered as mailto with inquiry parameter', () => {
      const html = renderToStaticMarkup(<Footer />);
      expect(html).toContain('mailto:');
      expect(html).toContain('subject=Cold%20Drink%20App%20Inquiry');
    });

    it('CMP-FOOT-04: Contact phone rendered as tel link', () => {
      const html = renderToStaticMarkup(<Footer />);
      expect(html).toContain('tel:');
    });

    it('CMP-FOOT-05: Verified GitHub link and truthful copyright notice', () => {
      const html = renderToStaticMarkup(<Footer />);
      expect(html).toContain('https://github.com/LogarTraders/cold-drink-distribution-app');
      expect(html).toContain('© 2026 Cold Drink Distribution Agency. All rights reserved.');
      expect(html).not.toContain('Norton');
    });
  });

  // 9. Full Assembly & Dual Mode Tests
  describe('Assembly and App Dual Mode', () => {
    it('CMP-APP-01: WebsiteApp contains all 10 landmark section anchors', () => {
      const html = renderToStaticMarkup(<WebsiteApp />);
      expect(html).toContain('id="home"');
      expect(html).toContain('id="hero"');
      expect(html).toContain('id="download"');
      expect(html).toContain('id="features"');
      expect(html).toContain('id="installation"');
      expect(html).toContain('id="troubleshooting"');
      expect(html).toContain('id="versions"');
      expect(html).toContain('id="history"');
      expect(html).toContain('id="contact"');
      expect(html).toContain('id="footer"');
    });

    it('CMP-APP-02: App defaults to Website mode and renders floating switcher', () => {
      const html = renderToStaticMarkup(<App />);
      expect(html).toContain('data-testid="switch-to-pos-btn"');
      expect(html).toContain('Launch POS Terminal');
      expect(html).toContain('Your Cold Drink Agency App – Download Now');
    });
  });
});
