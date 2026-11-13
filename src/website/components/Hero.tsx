import React from 'react';
import { Download, BookOpen, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { ReleaseInfo, EmptyReleaseReason, GitHubApiError } from '../types/website';

export interface HeroProps {
  latestRelease: ReleaseInfo | null;
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  emptyReason?: EmptyReleaseReason;
  error?: GitHubApiError | null;
  onDownloadClick?: () => void;
}

export const Hero: React.FC<HeroProps> = ({
  latestRelease,
  status,
  emptyReason,
  error,
  onDownloadClick,
}) => {
  const renderPrimaryCTA = () => {
    if (status === 'loading') {
      return (
        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center px-6 py-3.5 bg-gray-400 text-white font-semibold rounded-xl cursor-not-allowed animate-pulse"
        >
          <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
          Checking for updates...
        </button>
      );
    }

    if (status === 'success' && latestRelease?.apkAsset) {
      const apk = latestRelease.apkAsset;
      return (
        <a
          href={apk.downloadUrl}
          download
          onClick={onDownloadClick}
          className="inline-flex items-center justify-center px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg hover:shadow-red-500/30 transition transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <Download className="w-5 h-5 mr-2" />
          Download Latest APK ({latestRelease.versionTag} • {apk.formattedSize})
        </a>
      );
    }

    if (status === 'empty' && emptyReason === 'NO_APK') {
      return (
        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center px-6 py-3.5 bg-amber-500 text-white font-semibold rounded-xl cursor-not-allowed"
        >
          <AlertTriangle className="w-5 h-5 mr-2" />
          No APK in Latest Release
        </button>
      );
    }

    if (status === 'error' && error?.code === 'RATE_LIMITED') {
      const fallback = error.fallbackUrl || 'https://github.com/LogarTraders/cold-drink-distribution-app/releases';
      return (
        <a
          href={fallback}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md transition"
        >
          <ExternalLink className="w-5 h-5 mr-2" />
          Download via GitHub Releases
        </a>
      );
    }

    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center justify-center px-6 py-3.5 bg-gray-400 text-white font-semibold rounded-xl cursor-not-allowed"
      >
        Download Unavailable
      </button>
    );
  };

  return (
    <section id="home" className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-sky-50/40 py-16 sm:py-24">
      {/* Carbonation Effervescence Ambient Elements */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-12 left-10 w-4 h-4 rounded-full bg-blue-400/30 animate-pulse" />
        <div className="absolute top-28 right-20 w-6 h-6 rounded-full bg-red-400/20 animate-pulse" />
        <div className="absolute bottom-16 left-1/4 w-3 h-3 rounded-full bg-blue-500/20" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        {/* Verbatim Headline */}
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight max-w-3xl mx-auto leading-tight">
          Your Cold Drink Agency App – Download Now
        </h1>

        {/* Verbatim Supporting Text */}
        <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Access your Cold Drink Distribution Agency application through a simple and convenient Android download experience. Download the latest available version directly from our official distribution source.
        </p>

        {/* Dual Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          {renderPrimaryCTA()}
          <a
            href="#installation"
            className="inline-flex items-center justify-center px-6 py-3.5 border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold rounded-xl transition"
          >
            <BookOpen className="w-5 h-5 mr-2" />
            View Installation Guide
          </a>
        </div>
      </div>
    </section>
  );
};
