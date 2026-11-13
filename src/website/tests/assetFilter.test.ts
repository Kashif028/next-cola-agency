import { describe, it, expect } from 'vitest';
import {
  isApkAsset,
  selectPrimaryApk,
  formatFileSize,
  formatReleaseDate,
} from '../services/githubService';
import { GitHubAssetRaw } from '../types/github';

function makeMockAsset(name: string, size = 25000000): GitHubAssetRaw {
  return {
    id: Math.floor(Math.random() * 10000),
    name,
    label: null,
    content_type: 'application/vnd.android.package-archive',
    state: 'uploaded',
    size,
    download_count: 50,
    created_at: '2026-11-10T12:00:00Z',
    updated_at: '2026-11-10T12:00:00Z',
    browser_download_url: `https://github.com/downloads/${name}`,
  };
}

describe('assetFilter & helpers', () => {
  it('T4.1: accepts valid .apk extensions case-insensitively', () => {
    expect(isApkAsset('app-release.apk')).toBe(true);
    expect(isApkAsset('NEXT_COLA_V1.2.APK')).toBe(true);
    expect(isApkAsset('distribution-app.Apk')).toBe(true);
  });

  it('T4.2: rejects source code archives', () => {
    expect(isApkAsset('source-code.zip')).toBe(false);
    expect(isApkAsset('release.tar.gz')).toBe(false);
    expect(isApkAsset('v1.0.0.tgz')).toBe(false);
    expect(isApkAsset('archive.tar.bz2')).toBe(false);
    expect(isApkAsset('bundle.7z')).toBe(false);
    expect(isApkAsset('source.tar')).toBe(false);
  });

  it('T4.3: rejects desktop and OS binaries', () => {
    expect(isApkAsset('installer.exe')).toBe(false);
    expect(isApkAsset('setup.msi')).toBe(false);
    expect(isApkAsset('app.dmg')).toBe(false);
    expect(isApkAsset('package.deb')).toBe(false);
    expect(isApkAsset('app.rpm')).toBe(false);
  });

  it('T4.4: rejects checksum and signature files', () => {
    expect(isApkAsset('app-release.apk.sha256')).toBe(false);
    expect(isApkAsset('checksums.txt')).toBe(false);
    expect(isApkAsset('signature.asc')).toBe(false);
    expect(isApkAsset('release.apk.sig')).toBe(false);
  });

  it('T4.5: selects universal APK when multiple APKs exist', () => {
    const assets = [
      makeMockAsset('app-arm64-v8a.apk'),
      makeMockAsset('app-universal-release.apk'),
      makeMockAsset('app-armeabi-v7a.apk'),
    ];
    const selected = selectPrimaryApk(assets);
    expect(selected?.name).toBe('app-universal-release.apk');
  });

  it('T4.6: selects release keyword APK when no universal is present', () => {
    const assets = [
      makeMockAsset('app-debug.apk'),
      makeMockAsset('app-arm64-release.apk'),
    ];
    const selected = selectPrimaryApk(assets);
    expect(selected?.name).toBe('app-arm64-release.apk');
  });

  it('T4.7: prioritizes configured pattern when supplied', () => {
    const assets = [
      makeMockAsset('app-universal.apk'),
      makeMockAsset('app-custom-flavour.apk'),
    ];
    const pattern = /custom-flavour/i;
    const selected = selectPrimaryApk(assets, pattern);
    expect(selected?.name).toBe('app-custom-flavour.apk');
  });

  it('T4.8: returns null when release contains no APK assets', () => {
    const assets = [
      makeMockAsset('notes.txt'),
      makeMockAsset('source.zip'),
    ];
    expect(selectPrimaryApk(assets)).toBeNull();
    expect(selectPrimaryApk([])).toBeNull();
  });

  it('T4.9: formats file size into human-readable strings', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(25690112)).toBe('24.5 MB');
    expect(formatFileSize(1073741824)).toBe('1.00 GB');
  });

  it('T4.10: formats release date safely and returns "Not provided" for invalid input', () => {
    expect(formatReleaseDate('2026-11-10T14:30:00Z')).toMatch(/Nov 10, 2026/);
    expect(formatReleaseDate(null)).toBe('Not provided');
    expect(formatReleaseDate('invalid-date')).toBe('Not provided');
  });
});
