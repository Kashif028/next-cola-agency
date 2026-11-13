import React from 'react';
import { Download, FolderOpen, ShieldAlert, CheckCircle, Play } from 'lucide-react';

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

  return (
    <section id="installation" aria-labelledby="guide-heading" className={`space-y-8 ${className}`}>
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
    </section>
  );
};
