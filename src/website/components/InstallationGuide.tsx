import React from 'react';
import { Download, FolderOpen, ShieldAlert, CheckCircle, Play, Monitor, ShieldCheck, Zap } from 'lucide-react';

export interface InstallationGuideProps {
  className?: string;
}

export const InstallationGuide: React.FC<InstallationGuideProps> = ({ className = '' }) => {
  const steps = [
    {
      step: 1,
      title: 'Download APK',
      desc: 'Tap Download Latest APK and monitor notification bar for completion.',
      icon: Download,
    },
    {
      step: 2,
      title: 'Open Downloaded File',
      desc: 'Open notification or locate APK in Files/Downloads folder.',
      icon: FolderOpen,
    },
    {
      step: 3,
      title: 'Grant Permissions',
      desc: 'Navigate to Settings and toggle Allow from this source for your browser or file manager.',
      icon: ShieldAlert,
    },
    {
      step: 4,
      title: 'Confirm Installation',
      desc: 'Tap Install and wait for Android Package Installer verification.',
      icon: CheckCircle,
    },
    {
      step: 5,
      title: 'Launch Application',
      desc: 'Tap Open to launch the cold drink distribution agency application.',
      icon: Play,
    },
  ];

  const pcSteps = [
    {
      step: 1,
      title: 'Download PC Setup (.exe)',
      desc: 'Click Download for PC to get the latest Windows installer (.exe).',
      icon: Download,
    },
    {
      step: 2,
      title: 'Run Installer & Confirm',
      desc: 'Double click the installer. If Windows SmartScreen appears, click "More info" and "Run anyway".',
      icon: ShieldCheck,
    },
    {
      step: 3,
      title: 'Open POS Desktop & Work Offline',
      desc: 'A desktop shortcut is created. Launch the application with instant offline SQLite database support.',
      icon: Zap,
    },
  ];

  return (
    <section id="installation" aria-labelledby="guide-heading" className={`space-y-12 ${className}`}>
      {/* Mobile Android Guide */}
      <div className="space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 id="guide-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            5-Step Android Installation Guide
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Step-by-step sideloading instructions to install the application on Android devices.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {steps.map((item) => {
            const IconComp = item.icon;
            return (
              <div
                key={item.step}
                className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col justify-between space-y-3 relative group hover:border-blue-300 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                    {item.step}
                  </span>
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                    <IconComp className="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Windows PC Installation Guide */}
      <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 text-white space-y-6 shadow-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight text-white">
                Windows PC Setup Guide (3 Simple Steps)
              </h3>
              <p className="text-xs text-slate-400">
                Optimized for Windows 10 & 11 (64-bit) with high-speed offline desktop performance.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 self-start sm:self-auto">
            PC Desktop Edition
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pcSteps.map((item) => {
            const IconComp = item.icon;
            return (
              <div
                key={item.step}
                className="bg-slate-800/80 p-5 rounded-xl border border-slate-700 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="w-8 h-8 rounded-full bg-cyan-500 text-slate-950 text-xs font-bold flex items-center justify-center">
                    {item.step}
                  </span>
                  <div className="p-2 rounded-lg bg-slate-700/80 text-cyan-400">
                    <IconComp className="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-100">
                    {item.title}
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
