import React from 'react';
import { Mail, Phone, ExternalLink, ShieldCheck } from 'lucide-react';

export interface FooterProps {
  appName?: string;
  contactEmail?: string;
  contactPhone?: string;
  githubOwner?: string;
  githubRepo?: string;
}

export const Footer: React.FC<FooterProps> = ({
  appName = 'Cold Drink Distribution Agency App',
  contactEmail = 'support@colddrinkdist.example.com',
  contactPhone = '+92 300 1234567',
  githubOwner = 'LogarTraders',
  githubRepo = 'cold-drink-distribution-app',
}) => {
  const quickLinks = [
    { label: 'Home', href: '#home' },
    { label: 'Features', href: '#features' },
    { label: 'Download App', href: '#download' },
    { label: 'Installation Guide', href: '#installation' },
    { label: 'Version History', href: '#versions' },
  ];

  const cleanPhone = contactPhone.replace(/[^0-9+]/g, '');
  const mailtoHref = `mailto:${contactEmail}?subject=Cold%20Drink%20App%20Inquiry`;
  const telHref = `tel:${cleanPhone}`;
  const repoUrl = `https://github.com/${githubOwner}/${githubRepo}`;

  return (
    <footer
      id="footer"
      role="contentinfo"
      className="bg-slate-900 text-slate-300 py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-800"
    >
      {/* Contact section anchor */}
      <div id="contact" className="sr-only">
        Contact and Support Information
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Col 1: About Portal */}
        <div className="space-y-3 md:col-span-1">
          <div className="flex items-center space-x-2 text-white font-bold text-base">
            <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center text-white text-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span>{appName}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Official APK distribution portal for the Android Cold Drink Distribution Agency application. Download official Android binaries directly from repository releases.
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Direct HTTPS downloads directly from official repository with zero user tracking, cookies, or telemetry.
          </p>
        </div>

        {/* Col 2: Quick Links */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Quick Navigation
          </h3>
          <ul className="space-y-2 text-xs">
            {quickLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className="hover:text-red-400 transition"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Col 3: Support Desk */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Distribution Support Desk
          </h3>
          <p className="text-xs text-slate-400">
            Contact distribution desk for field access assistance.
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <a
                href={mailtoHref}
                className="text-slate-300 hover:text-white transition underline"
              >
                {contactEmail}
              </a>
            </div>
            <div className="flex items-center space-x-2">
              <Phone className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <a
                href={telHref}
                className="text-slate-300 hover:text-white transition font-mono"
              >
                {contactPhone}
              </a>
            </div>
          </div>
        </div>

        {/* Col 4: Repository & Legal */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Open Source Release
          </h3>
          <p className="text-xs text-slate-400">
            Binary releases and verifiable source code are publicly hosted on GitHub.
          </p>
          <div>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition"
            >
              <span>GitHub Repository</span>
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <p>© 2026 Cold Drink Distribution Agency. All rights reserved.</p>
        <p className="text-[11px] text-slate-600">
          Official Release Channel • Direct Cryptographic Verification
        </p>
      </div>
    </footer>
  );
};
