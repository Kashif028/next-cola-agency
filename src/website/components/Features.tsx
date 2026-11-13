import React from 'react';
import { Server, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';

export interface FeaturesProps {
  className?: string;
}

export const Features: React.FC<FeaturesProps> = ({ className = '' }) => {
  const features = [
    {
      id: 'feat-direct',
      title: 'Direct Distribution',
      description: 'Official direct download from agency repository without intermediate app stores.',
      icon: Server,
    },
    {
      id: 'feat-sync',
      title: 'Automated Releases Sync',
      description: 'Live integration with GitHub Releases ensures instant access to new field updates.',
      icon: RefreshCw,
    },
    {
      id: 'feat-integrity',
      title: 'Cryptographic Integrity',
      description: 'Every build provides verified SHA-256 digests and direct secure HTTPS downloads.',
      icon: ShieldCheck,
    },
    {
      id: 'feat-field',
      title: 'Field Optimized',
      description: 'Designed for quick sideloading on field staff Android tablets and handhelds.',
      icon: Smartphone,
    },
  ];

  return (
    <section id="features" aria-labelledby="features-heading" className={`space-y-8 ${className}`}>
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h2 id="features-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Official Distribution Highlights
        </h2>
        <p className="text-sm sm:text-base text-slate-600">
          Streamlined, reliable APK distribution engineered for field logistics operations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((item) => {
          const IconComp = item.icon;
          return (
            <div
              key={item.id}
              className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition flex flex-col space-y-3"
            >
              <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold">
                <IconComp className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {item.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
