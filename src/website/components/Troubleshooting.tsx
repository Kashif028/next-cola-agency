import React, { useState } from 'react';
import { ChevronDown, AlertTriangle, HardDrive, ShieldAlert, KeyRound, WifiOff } from 'lucide-react';

export interface TroubleshootingProps {
  className?: string;
}

export const Troubleshooting: React.FC<TroubleshootingProps> = ({ className = '' }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const scenarios = [
    {
      id: 'incomplete-download',
      case: 1,
      title: 'Incomplete Downloads',
      cause: 'Intermittent mobile data interruption during binary transfer.',
      solution: 'Delete the partial .crdownload file from your Downloads folder, reconnect to depot Wi-Fi, and re-download.',
      icon: WifiOff,
    },
    {
      id: 'unsupported-os',
      case: 2,
      title: 'Unsupported Android Version',
      cause: 'Handset operating system is older than required minimum API level.',
      solution: 'Check Android version under Settings > About Phone. Update system software or contact depot IT.',
      icon: AlertTriangle,
    },
    {
      id: 'insufficient-storage',
      case: 3,
      title: 'Insufficient Storage Space',
      cause: 'Device storage has less than 150MB free space required for extraction.',
      solution: 'Free at least 150MB-300MB by clearing cached media files under Settings > Storage.',
      icon: HardDrive,
    },
    {
      id: 'permission-issues',
      case: 4,
      title: 'Permission Issues (Install Unknown Apps)',
      cause: 'Android security restricts sideloading from unauthorized browsers or file managers.',
      solution: 'Navigate to Settings > Apps > Special App Access > Install Unknown Apps. Select your browser and toggle Allow.',
      icon: ShieldAlert,
    },
    {
      id: 'signature-conflicts',
      case: 5,
      title: 'Signature Conflicts / App Not Installed',
      cause: 'Existing app build was signed with a differing debug or staging key.',
      solution: 'Backup offline routes, completely uninstall the previous app version, and perform a clean install.',
      icon: KeyRound,
    },
  ];

  const toggleAccordion = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="troubleshooting" aria-labelledby="trouble-heading" className={`space-y-6 ${className}`}>
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h2 id="trouble-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Troubleshooting Common Issues
        </h2>
        <p className="text-sm sm:text-base text-slate-600">
          Solutions for common installation and sideloading challenges encountered in the field.
        </p>
      </div>

      <div className="space-y-3 max-w-4xl mx-auto">
        {scenarios.map((item, idx) => {
          const isOpen = openIndex === idx;
          const IconComp = item.icon;
          return (
            <div
              key={item.id}
              className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs transition"
            >
              <button
                type="button"
                onClick={() => toggleAccordion(idx)}
                aria-expanded={isOpen}
                aria-controls={`trouble-desc-${item.id}`}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                    <IconComp className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-blue-600 block">
                      Case {item.case}
                    </span>
                    <span className="text-sm sm:text-base font-bold text-slate-900">
                      {item.title}
                    </span>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-blue-600' : ''
                  }`}
                />
              </button>

              <div
                id={`trouble-desc-${item.id}`}
                className={`px-6 pb-5 pt-1 space-y-2 text-xs sm:text-sm border-t border-slate-100 bg-slate-50/60 ${
                  isOpen ? 'block' : 'hidden'
                }`}
              >
                <div>
                  <span className="font-semibold text-slate-800">Cause: </span>
                  <span className="text-slate-600">{item.cause}</span>
                </div>
                <div>
                  <span className="font-semibold text-blue-700">Solution: </span>
                  <span className="text-slate-700">{item.solution}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
