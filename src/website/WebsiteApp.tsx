import React, { useState, useRef, useEffect } from 'react';
import { useGitHubRelease } from './hooks/useGitHubRelease';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { AppInfoCard } from './components/AppInfoCard';
import { Features } from './components/Features';
import { InstallationGuide } from './components/InstallationGuide';
import { Troubleshooting } from './components/Troubleshooting';
import { VersionHistory } from './components/VersionHistory';
import { Footer } from './components/Footer';
import { AlertTriangle, WifiOff, CheckCircle2 } from 'lucide-react';

export interface WebsiteAppProps {
  onSwitchToPos?: () => void;
}

export const WebsiteApp: React.FC<WebsiteAppProps> = ({ onSwitchToPos }) => {
  const releaseState = useGitHubRelease();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyChecksum = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage('SHA-256 Checksum copied to clipboard!');
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-600 selection:text-white">
      {/* 1. Header Navigation Bar */}
      <Header
        latestRelease={releaseState.latestRelease}
        status={releaseState.status}
      />

      {/* 2. Global Toast Notification for Checksum Copy */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center space-x-2.5 px-4 py-3 bg-slate-900 border border-emerald-500/60 text-white rounded-xl shadow-2xl animate-fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* 3. Global Network / Rate Limit Alert Banners */}
      {releaseState.status === 'error' && releaseState.error?.code === 'RATE_LIMITED' && (
        <aside
          role="alert"
          className="bg-amber-950/90 border-b border-amber-600/50 px-4 py-3 text-amber-200 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              GitHub API rate limit active. Reset in ~{releaseState.error.minutesUntilReset ?? 30} minutes. Direct downloads remain available on GitHub.
            </span>
          </div>
          {releaseState.error.fallbackUrl && (
            <a
              href={releaseState.error.fallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-white"
            >
              Open Releases Page
            </a>
          )}
        </aside>
      )}

      {releaseState.status === 'error' && releaseState.error?.code === 'NETWORK_ERROR' && (
        <aside
          role="alert"
          className="bg-red-950/90 border-b border-red-600/50 px-4 py-3 text-red-200 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center space-x-2">
            <WifiOff className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>Unable to connect to GitHub. Check your network connection.</span>
          </div>
          <button
            type="button"
            onClick={() => releaseState.refetch(true)}
            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-md text-xs font-semibold transition"
          >
            Retry Connection
          </button>
        </aside>
      )}

      {/* 4. Main Page Content Landmark */}
      <main id="main-content" className="flex-1 flex flex-col">
        {/* Hero Section (#hero landmark, #home inside Hero) */}
        <section id="hero" aria-labelledby="hero-heading">
          <Hero
            latestRelease={releaseState.latestRelease}
            status={releaseState.status}
            emptyReason={releaseState.emptyReason}
            error={releaseState.error}
          />
        </section>

        {/* Verified Application Information Card (#download) */}
        <section
          id="download"
          aria-labelledby="app-info-heading"
          className="py-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full"
        >
          <AppInfoCard
            latestRelease={releaseState.latestRelease}
            status={releaseState.status}
            onCopySuccess={handleCopyChecksum}
            onRefetch={() => releaseState.refetch()}
          />
        </section>

        {/* Features Highlights (#features inside Features) */}
        <div className="py-16 bg-slate-900/60 border-y border-slate-800/80">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <Features />
          </div>
        </div>

        {/* 5-Step Android Installation Guide (#installation inside InstallationGuide) */}
        <div className="py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
          <InstallationGuide />
        </div>

        {/* Troubleshooting Accordion (#troubleshooting inside Troubleshooting) */}
        <div className="py-16 bg-slate-900/60 border-y border-slate-800/80">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <Troubleshooting />
          </div>
        </div>

        {/* Version History & Past Releases (#versions and #history inside VersionHistory) */}
        <div className="py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
          <VersionHistory
            releases={releaseState.historyReleases}
            status={releaseState.status}
            onRefetch={() => releaseState.refetch()}
          />
        </div>
      </main>

      {/* 5. Contact Section & Semantic Footer (#contact and #footer inside Footer) */}
      {onSwitchToPos && (
        <div className="sr-only">
          <button type="button" onClick={onSwitchToPos}>
            Switch to POS
          </button>
        </div>
      )}
      <Footer />
    </div>
  );
};

export default WebsiteApp;
