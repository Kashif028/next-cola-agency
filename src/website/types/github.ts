/**
 * Raw GitHub REST API v3 Schemas
 * Directly mirrors the JSON payload returned by api.github.com/repos/{owner}/{repo}/releases
 */

export interface GitHubAssetRaw {
  id: number;
  name: string;
  label: string | null;
  content_type: string;
  state: 'uploaded' | 'open';
  size: number; // in bytes
  download_count: number;
  created_at: string;
  updated_at: string;
  browser_download_url: string;
}

export interface GitHubAuthorRaw {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

export interface GitHubReleaseRaw {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null; // markdown release notes
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  html_url: string;
  tarball_url: string | null;
  zipball_url: string | null;
  author?: GitHubAuthorRaw;
  assets: GitHubAssetRaw[];
}

export interface GitHubRateLimitHeaders {
  limit: number;
  remaining: number;
  resetTimestamp: number; // Unix epoch seconds
  minutesUntilReset: number;
}
