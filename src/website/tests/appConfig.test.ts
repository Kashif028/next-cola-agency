import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAppConfig, resetAppConfig, isValidGitHubIdentifier } from '../config/appConfig';

describe('appConfig', () => {
  beforeEach(() => {
    resetAppConfig();
    vi.unstubAllEnvs();
  });

  it('T1.1: returns default configuration when no environment variables are set', () => {
    const config = getAppConfig();
    expect(config.github.owner).toBe('Kashif028');
    expect(config.github.repo).toBe('next-cola-agency');
    expect(config.github.latestApiUrl).toBe(
      'https://api.github.com/repos/Kashif028/next-cola-agency/releases/latest'
    );
    expect(config.github.releasesApiUrl).toBe(
      'https://api.github.com/repos/Kashif028/next-cola-agency/releases'
    );
    expect(config.github.releasesWebUrl).toBe(
      'https://github.com/Kashif028/next-cola-agency/releases'
    );
    expect(config.github.apkFilenamePattern).toBeNull();
    expect(config.github.cacheTtlMs).toBe(300000); // 5 minutes
    expect(config.app.name).toBe('Next Cola Distribution Agency App');
    expect(config.app.contactEmail).toBe('support@nextcola.agency');
  });

  it('T1.2: accepts programmatic overrides', () => {
    const config = getAppConfig({
      github: {
        owner: 'CustomAgency',
        repo: 'next-cola-mobile',
        latestApiUrl: 'https://api.github.com/repos/CustomAgency/next-cola-mobile/releases/latest',
        releasesApiUrl: 'https://api.github.com/repos/CustomAgency/next-cola-mobile/releases',
        releasesWebUrl: 'https://github.com/CustomAgency/next-cola-mobile/releases',
        apkFilenamePattern: null,
        cacheTtlMs: 300000,
      },
    });
    expect(config.github.owner).toBe('CustomAgency');
    expect(config.github.repo).toBe('next-cola-mobile');
  });

  it('T1.3: validates GitHub identifiers to prevent injection', () => {
    expect(isValidGitHubIdentifier('LogarTraders')).toBe(true);
    expect(isValidGitHubIdentifier('cold-drink_app.v1')).toBe(true);
    expect(isValidGitHubIdentifier('../malicious')).toBe(false);
    expect(isValidGitHubIdentifier('owner;rm -rf')).toBe(false);
    expect(isValidGitHubIdentifier('foo bar')).toBe(false);
  });

  it('T1.4: compiles APK filename pattern regex safely', () => {
    vi.stubEnv('VITE_APK_FILENAME_PATTERN', 'universal.*release');
    resetAppConfig();
    const config = getAppConfig();
    expect(config.github.apkFilenamePattern).toBeInstanceOf(RegExp);
    expect(config.github.apkFilenamePattern?.test('app-universal-release.apk')).toBe(true);
    expect(config.github.apkFilenamePattern?.test('app-arm64.apk')).toBe(false);
  });

  it('T1.5: handles invalid regex pattern without throwing', () => {
    vi.stubEnv('VITE_APK_FILENAME_PATTERN', '[unclosed-regex');
    resetAppConfig();
    const config = getAppConfig();
    expect(config.github.apkFilenamePattern).toBeNull();
  });

  it('T1.6: clamps cache TTL to safe boundaries (10s to 1h)', () => {
    vi.stubEnv('VITE_CACHE_TTL_MS', '5000'); // 5s < 10s min
    resetAppConfig();
    let config = getAppConfig();
    expect(config.github.cacheTtlMs).toBe(10000);

    vi.stubEnv('VITE_CACHE_TTL_MS', '10000000'); // > 1h max
    resetAppConfig();
    config = getAppConfig();
    expect(config.github.cacheTtlMs).toBe(3600000);
  });

  it('T1.7: enforces Zero Secrets policy (never contains or transmits tokens)', () => {
    const config = getAppConfig() as unknown as Record<string, unknown>;
    const gh = config.github as Record<string, unknown>;
    expect(gh.token).toBeUndefined();
    expect(gh.apiKey).toBeUndefined();
    expect(gh.secret).toBeUndefined();
  });
});
