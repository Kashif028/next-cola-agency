/**
 * Application Configuration Loader
 * Handles environment variable loading with sensible fallbacks and strict validation.
 * Enforces Zero Secret Exposure: NEVER accepts, embeds, or transmits GitHub PATs or API keys.
 */

import { AppConfig } from '../types/website';

export type { AppConfig };

const DEFAULT_OWNER = 'Kashif028';
const DEFAULT_REPO = 'next-cola-agency';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)
const MIN_CACHE_TTL_MS = 10 * 1000; // 10 seconds
const MAX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Validates a GitHub repository or owner identifier to prevent path traversal or URL manipulation.
 * Valid characters: alphanumeric, hyphen, underscore, period.
 */
export function isValidGitHubIdentifier(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_.-]+$/.test(id);
}

/**
 * Parses and validates cache TTL from string or number.
 */
function parseCacheTtl(rawTtl: unknown): number {
  if (typeof rawTtl === 'number' && !isNaN(rawTtl)) {
    return Math.min(Math.max(rawTtl, MIN_CACHE_TTL_MS), MAX_CACHE_TTL_MS);
  }
  if (typeof rawTtl === 'string' && rawTtl.trim()) {
    const parsed = parseInt(rawTtl.trim(), 10);
    if (!isNaN(parsed)) {
      return Math.min(Math.max(parsed, MIN_CACHE_TTL_MS), MAX_CACHE_TTL_MS);
    }
  }
  return DEFAULT_CACHE_TTL_MS;
}

/**
 * Safely compiles a regular expression from string, returning null if invalid.
 */
function parseApkPattern(patternStr?: string): RegExp | null {
  if (!patternStr || !patternStr.trim()) return null;
  try {
    return new RegExp(patternStr.trim(), 'i');
  } catch {
    console.warn(`[appConfig] Invalid VITE_APK_FILENAME_PATTERN regex: "${patternStr}". Falling back to default.`);
    return null;
  }
}

let cachedConfig: AppConfig | null = null;

/**
 * Returns the application configuration.
 * Environment variables override default values.
 */
export function getAppConfig(overrides?: Partial<AppConfig>): AppConfig {
  if (cachedConfig && !overrides) {
    return cachedConfig;
  }

  // Read environment variables via Vite import.meta.env
  const meta = typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: Record<string, string | undefined> })
    : undefined;
  const env = meta?.env || ({} as Record<string, string | undefined>);

  // Security check: Guard against accidental PAT injection
  if (env.VITE_GITHUB_TOKEN || env.GITHUB_TOKEN) {
    console.warn(
      '[appConfig] Security Warning: GitHub Personal Access Tokens must never be included in frontend builds. Ignoring token.'
    );
  }

  const rawOwner = (env.VITE_GITHUB_OWNER || DEFAULT_OWNER).trim();
  const rawRepo = (env.VITE_GITHUB_REPO || DEFAULT_REPO).trim();

  const owner = isValidGitHubIdentifier(rawOwner) ? rawOwner : DEFAULT_OWNER;
  const repo = isValidGitHubIdentifier(rawRepo) ? rawRepo : DEFAULT_REPO;

  const latestApiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const releasesApiUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;
  const defaultWebUrl = `https://github.com/${owner}/${repo}/releases`;

  const webUrlCandidate = (env.VITE_GITHUB_RELEASES_URL || defaultWebUrl).trim();
  const releasesWebUrl = webUrlCandidate.startsWith('https://') ? webUrlCandidate : defaultWebUrl;

  const apkFilenamePattern = parseApkPattern(env.VITE_APK_FILENAME_PATTERN);
  const cacheTtlMs = parseCacheTtl(env.VITE_CACHE_TTL_MS);

  const config: AppConfig = {
    github: {
      owner,
      repo,
      latestApiUrl,
      releasesApiUrl,
      releasesWebUrl,
      apkFilenamePattern,
      cacheTtlMs,
      ...(overrides?.github || {}),
    },
    app: {
      name: env.VITE_APP_NAME || 'Next Cola Distribution Agency App',
      tagline:
        env.VITE_APP_TAGLINE ||
        'Access your Next Cola Distribution Agency application through a simple and convenient Android download experience.',
      contactEmail: env.VITE_CONTACT_EMAIL || 'support@nextcola.agency',
      contactPhone: env.VITE_CONTACT_PHONE || '+92 300 1234567',
      ...(overrides?.app || {}),
    },
  };

  if (!overrides) {
    cachedConfig = config;
  }
  return config;
}

/**
 * Resets cached configuration (primarily for test environments).
 */
export function resetAppConfig(): void {
  cachedConfig = null;
}
