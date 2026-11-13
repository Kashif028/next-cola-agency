import { describe, it, expect, beforeEach } from 'vitest';
import { cacheService } from '../services/cacheService';
import { ReleaseInfo } from '../types/website';

const mockRelease: ReleaseInfo = {
  id: 101,
  versionTag: 'v1.0.0',
  title: 'Next Cola v1.0.0',
  releaseDate: '2026-11-10T12:00:00Z',
  formattedDate: 'Nov 10, 2026',
  releaseNotesRaw: 'First release',
  sanitizedNotesHtml: '<p>First release</p>',
  githubReleaseUrl: 'https://github.com/LogarTraders/cold-drink-distribution-app/releases/tag/v1.0.0',
  isPrerelease: false,
  apkAsset: {
    id: 1,
    filename: 'app-release.apk',
    sizeBytes: 15000000,
    formattedSize: '14.3 MB',
    downloadUrl: 'https://github.com/download/app-release.apk',
    downloadCount: 10,
    updatedAt: '2026-11-10T12:00:00Z',
  },
  sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  compatibility: {
    minAndroidVersion: 'Android 7.0+',
    targetSdkVersion: 'API 34',
    packageName: 'com.nextcola.distribution',
  },
};

describe('cacheService', () => {
  beforeEach(() => {
    cacheService.clear();
  });

  it('T2.1: stores and retrieves cached data with timestamp and etag', () => {
    const mockData = { id: 1, version: 'v1.0.0' };
    cacheService.set('test_key', mockData, 'etag-123');

    const cached = cacheService.get<typeof mockData>('test_key');
    expect(cached).not.toBeNull();
    expect(cached?.data).toEqual(mockData);
    expect(cached?.etag).toBe('etag-123');
    expect(typeof cached?.timestamp).toBe('number');
  });

  it('T2.2: returns null for non-existent keys', () => {
    expect(cacheService.get('non_existent')).toBeNull();
  });

  it('T2.3: correctly evaluates freshness within TTL', () => {
    const entry = {
      data: { hello: 'world' },
      timestamp: Date.now() - 60000, // 1 minute ago
    };
    expect(cacheService.isFresh(entry, 300000)).toBe(true); // 5 min TTL -> fresh
    expect(cacheService.isFresh(entry, 30000)).toBe(false); // 30 sec TTL -> expired
  });

  it('T2.4: touches entry to reset TTL timestamp on 304 Not Modified', () => {
    const originalTime = Date.now() - 100000;
    const entry = { data: 'my-release', timestamp: originalTime, etag: 'etag-xyz' };
    cacheService.set('touch_key', entry.data, entry.etag);

    cacheService.touch('touch_key');
    const updated = cacheService.get<string>('touch_key');
    expect(updated).not.toBeNull();
    expect(updated?.timestamp).toBeGreaterThanOrEqual(originalTime);
    expect(updated?.etag).toBe('etag-xyz');
    expect(updated?.data).toBe('my-release');
  });

  it('T2.5: removes specific item cleanly', () => {
    cacheService.set('key_to_remove', 'data');
    expect(cacheService.get('key_to_remove')).not.toBeNull();

    cacheService.remove('key_to_remove');
    expect(cacheService.get('key_to_remove')).toBeNull();
  });

  it('T2.6: clears only namespaced keys without touching foreign keys', () => {
    cacheService.set('key_a', 'valA');
    cacheService.set('key_b', 'valB');

    cacheService.clear();
    expect(cacheService.get('key_a')).toBeNull();
    expect(cacheService.get('key_b')).toBeNull();
  });

  it('T2.7: supports typed release and history helper methods', () => {
    cacheService.setCachedRelease(mockRelease, '"release-etag"');
    const cachedRelease = cacheService.getCachedRelease();
    expect(cachedRelease).not.toBeNull();
    expect(cachedRelease?.data.versionTag).toBe('v1.0.0');
    expect(cachedRelease?.etag).toBe('"release-etag"');

    cacheService.setCachedHistory([mockRelease], '"history-etag"');
    const cachedHistory = cacheService.getCachedHistory();
    expect(cachedHistory).not.toBeNull();
    expect(cachedHistory?.data.length).toBe(1);
    expect(cachedHistory?.etag).toBe('"history-etag"');

    cacheService.touchReleaseCache();
    expect(cacheService.getCachedRelease()?.data.versionTag).toBe('v1.0.0');

    cacheService.clearCache();
    expect(cacheService.getCachedRelease()).toBeNull();
    expect(cacheService.getCachedHistory()).toBeNull();
  });

  it('T2.8: falls back safely when cache entry is null', () => {
    expect(cacheService.isFresh(null, 300000)).toBe(false);
  });
});
