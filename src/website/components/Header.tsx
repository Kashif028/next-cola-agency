import React, { useState } from 'react';
import { Menu, X, Download, RefreshCw, Smartphone } from 'lucide-react';
import { ReleaseInfo } from '../types/website';

export interface HeaderProps {
  latestRelease: ReleaseInfo | null;
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  appName?: string;
  onDownloadClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  latestRelease,
  status,
  appName = 'Cold Drink Distribution Agency App',
  onDownloadClick,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Home', href: '#home' },
    { label: 'Features', href: '#features' },
    { label: 'Download App', href: '#download' },
    { label: 'Installation Guide', href: '#installation' },
    { label: 'Version History', href: '#versions' },
    { label: 'Contact', href: '#contact' },
  ];

  const renderCta = (isMobile = false) => {
    if (status === 'loading') {
      return (
        <button
          disabled
          className="inline-flex items-center px-4 py-2 bg-gray-400 text-white text-sm font-semibold rounded-lg opacity-50 cursor-not-allowed"
        >
          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          Loading...
        </button>
      );
    }
    if (status === 'success' && latestRelease?.apkAsset) {
      return (
        <a
          href={latestRelease.apkAsset.downloadUrl}
          onClick={() => {
            if (isMobile) setMobileMenuOpen(false);
            onDownloadClick?.();
          }}
          className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg shadow-sm transition active:scale-95"
        >
          <Download className="w-4 h-4 mr-2" />
          Download APK ({latestRelease.versionTag})
        </a>
      );
    }
    if (status === 'empty') {
      return (
        <button
          disabled
          className="inline-flex items-center px-4 py-2 bg-gray-400 text-white text-sm font-semibold rounded-lg cursor-not-allowed"
        >
          No APK
        </button>
      );
    }
    return (
      <button
        disabled
        className="inline-flex items-center px-4 py-2 bg-gray-400 text-white text-sm font-semibold rounded-lg cursor-not-allowed"
      >
        Download APK
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Subtitle */}
        <a href="#home" className="flex items-center space-x-3 group">
          <div
            role="img"
            aria-label="Agency Logo"
            className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-md group-hover:bg-red-700 transition"
          >
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-base leading-tight group-hover:text-red-600 transition">
              {appName}
            </div>
            <span className="inline-block text-[11px] font-semibold text-blue-600">
              Official APK Distribution
            </span>
          </div>
        </a>

        {/* Desktop Navigation Links */}
        <nav aria-label="Main Navigation" className="hidden md:flex items-center space-x-1 lg:space-x-2">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-red-600 hover:bg-red-50/60 rounded-md transition"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center space-x-3">
          {renderCta(false)}
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            role="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen ? 'true' : 'false'}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-700 hover:text-red-600 hover:bg-slate-100 transition"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-gray-200 bg-white px-4 pt-2 pb-6 space-y-3 shadow-lg">
          <nav className="flex flex-col space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-red-600 hover:bg-red-50 transition"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="pt-2 border-t border-gray-100">
            {renderCta(true)}
          </div>
        </div>
      )}
    </header>
  );
};
