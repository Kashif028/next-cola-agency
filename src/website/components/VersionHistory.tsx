import React from 'react';
import { Download, ExternalLink, Calendar, Sparkles } from 'lucide-react';
import { ReleaseInfo } from '../types/website';

export interface VersionHistoryProps {
  releases: ReleaseInfo[];
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  onRefetch?: () => Promise<void>;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  releases,
  status,
  onRefetch,
}) => {
  const isLoading = status === 'loading';
  return (
    <section id="versions" aria-labelledby="history-heading" className="space-y-6">
      {/* Anchor for #history support */}
      <div id="history" className="sr-only">
        Version History Anchor
      </div>

      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h2 id="history-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Version History &amp; Past Releases
        </h2>
        <p className="text-sm sm:text-base text-slate-600">
          Previous application versions and historical APK packages for rollback or compatibility needs.
        </p>
      </div>

      {releases.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500 text-sm space-y-2">
          <p>{isLoading ? 'Loading releases...' : 'No previous releases available.'}</p>
          {onRefetch && (
            <button
              type="button"
              onClick={() => onRefetch()}
              className="text-xs text-blue-600 hover:underline"
            >
              Refresh Releases
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl mx-auto">
          {releases.map((rel, index) => {
            const isLatest = index === 0;
            return (
              <div
                key={rel.id || rel.versionTag}
                className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm hover:border-slate-300 transition space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg font-bold text-slate-900 font-mono">
                      {rel.versionTag}
                    </span>
                    {isLatest && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Latest Release
                      </span>
                    )}
                    <span className="inline-flex items-center text-xs text-slate-500">
                      <Calendar className="w-3.5 h-3.5 mr-1" />
                      {rel.formattedDate}
                    </span>
                  </div>

                  <a
                    href={rel.githubReleaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-blue-600 transition"
                  >
                    <span>View on GitHub</span>
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>

                {rel.sanitizedNotesHtml && (
                  <div
                    className="text-xs text-slate-600 max-h-24 overflow-y-auto prose prose-xs"
                    dangerouslySetInnerHTML={{ __html: rel.sanitizedNotesHtml }}
                  />
                )}

                <div className="flex items-center justify-between pt-2">
                  {rel.apkAsset ? (
                    <a
                      href={rel.apkAsset.downloadUrl}
                      download
                      className="inline-flex items-center px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Download APK ({rel.apkAsset.formattedSize})
                    </a>
                  ) : (
                    <span className="text-xs text-amber-600 font-medium">
                      No APK attached to this release
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
