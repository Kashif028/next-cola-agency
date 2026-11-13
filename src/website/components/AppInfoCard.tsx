import React, { useState } from 'react';
import { ExternalLink, Copy, Check, ShieldCheck, Sparkles } from 'lucide-react';
import { ReleaseInfo } from '../types/website';

export interface AppInfoCardProps {
  latestRelease: ReleaseInfo | null;
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  appName?: string;
  onCopySuccess?: (hash: string) => void;
  onRefetch?: () => Promise<void>;
}

export const AppInfoCard: React.FC<AppInfoCardProps> = ({
  latestRelease,
  status,
  appName = 'Cold Drink Distribution Agency App',
  onCopySuccess,
  onRefetch,
}) => {
  const [copied, setCopied] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);

  const isLoading = status === 'loading';

  const handleCopyChecksum = () => {
    if (!latestRelease?.sha256Checksum) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(latestRelease.sha256Checksum);
      }
    } catch {
      // Fallback
    }
    setCopied(true);
    onCopySuccess?.(latestRelease.sha256Checksum);
    setTimeout(() => setCopied(false), 2000);
  };

  const versionDisplay = latestRelease?.versionTag || 'Not provided';
  const hasVersionBadge = Boolean(latestRelease?.versionTag);
  const dateDisplay = latestRelease?.formattedDate || 'Not provided';
  const sizeDisplay = latestRelease?.apkAsset?.formattedSize || 'Not provided';
  const minAndroidDisplay = latestRelease?.compatibility?.minAndroidVersion || 'Not provided';
  const packageNameDisplay = latestRelease?.compatibility?.packageName || 'Not provided';
  const checksumDisplay = latestRelease?.sha256Checksum || 'Not provided';
  const hasChecksum = Boolean(latestRelease?.sha256Checksum);
  const githubUrl =
    latestRelease?.githubReleaseUrl ||
    'https://github.com/LogarTraders/cold-drink-distribution-app/releases';
  const notesHtml = latestRelease
    ? latestRelease.sanitizedNotesHtml || 'No release notes provided for this release.'
    : 'No release notes provided for this release.';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-md overflow-hidden">
      {/* Header bar */}
      <div className="bg-slate-900 px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-white">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-red-600 text-white shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 id="app-info-heading" className="text-lg font-bold tracking-tight">
              {appName}
            </h2>
            <p className="text-xs text-slate-300">
              Verified Technical Release Specifications
            </p>
          </div>
        </div>

        {isLoading && (
          <span className="text-xs text-slate-400 animate-pulse">Checking release...</span>
        )}
        {onRefetch && (
          <button type="button" onClick={() => onRefetch()} className="sr-only">Refresh</button>
        )}
        {hasVersionBadge && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Latest Release
          </span>
        )}
      </div>

      {/* Grid of metadata fields */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm text-slate-700 border-b border-slate-100">
        {/* Version */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Release Version
          </div>
          <div className="text-base font-semibold text-slate-900">
            {versionDisplay}
          </div>
        </div>

        {/* Release Date */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Release Date
          </div>
          <div className="text-base font-semibold text-slate-900">
            {dateDisplay}
          </div>
        </div>

        {/* APK Size */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            APK File Size
          </div>
          <div className="text-base font-semibold text-slate-900">
            {sizeDisplay}
          </div>
        </div>

        {/* Min Android Version */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Min Android Version
          </div>
          <div className="text-base font-semibold text-slate-900">
            {minAndroidDisplay}
          </div>
        </div>

        {/* Package Name */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Package Name
          </div>
          <div className="text-base font-mono text-slate-800 break-all">
            {packageNameDisplay}
          </div>
        </div>

        {/* GitHub Source Link */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Source Repository
          </div>
          <div>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-blue-600 hover:text-blue-700 font-semibold transition"
            >
              <span>View on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5 ml-1" />
            </a>
          </div>
        </div>
      </div>

      {/* SHA-256 Checksum Container */}
      <div className="p-6 bg-slate-50 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <span>Verified SHA-256 Checksum</span>
              {hasChecksum && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                  SHA-256 Verified
                </span>
              )}
            </div>
            {hasChecksum ? (
              <code className="font-mono text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200 block break-all select-all">
                {checksumDisplay}
              </code>
            ) : (
              <div className="text-sm font-semibold text-slate-600">
                Not provided
              </div>
            )}
          </div>

          {hasChecksum && (
            <button
              type="button"
              aria-label="Copy SHA-256 Checksum"
              onClick={handleCopyChecksum}
              className="inline-flex items-center justify-center px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-95 flex-shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  <span>Copy Checksum</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Release Notes */}
      <div className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            Release Notes
          </h3>
          <button
            type="button"
            onClick={() => setNotesExpanded(!notesExpanded)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            {notesExpanded ? 'Show less' : 'Show full release notes'}
          </button>
        </div>

        <div
          className={`prose prose-sm max-w-none text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200 overflow-hidden transition-all duration-200 ${
            notesExpanded ? 'max-h-none' : 'max-h-48 overflow-y-auto'
          }`}
          dangerouslySetInnerHTML={{ __html: notesHtml }}
        />
      </div>
    </div>
  );
};
