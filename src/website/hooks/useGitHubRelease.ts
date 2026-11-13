/**
 * React State Management Hook: useGitHubRelease
 * Orchestrates GitHub Releases state machine, dual fetching, rate limit countdowns,
 * and session cache revalidation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GitHubReleaseState,
  ReleaseInfo,
  GitHubApiError,
  EmptyReleaseReason,
} from '../types/website';
import {
  fetchLatestRelease,
  fetchReleaseHistory,
  FetchLatestResult,
  FetchHistoryResult,
} from '../services/githubService';
import { getAppConfig } from '../config/appConfig';

export interface UseGitHubReleaseOptions {
  autoFetch?: boolean;
  pollIntervalMs?: number;
  perPageHistory?: number;
}

export interface ResolvedState {
  status: GitHubReleaseState['status'];
  emptyReason?: EmptyReleaseReason;
  latestRelease: ReleaseInfo | null;
  historyReleases: ReleaseInfo[];
  error: GitHubApiError | null;
}

/**
 * Pure state resolver function.
 * Evaluates the results from fetchLatestRelease and fetchReleaseHistory
 * to produce deterministic state machine output.
 */
export function resolveReleaseState(
  latestResult: FetchLatestResult,
  historyResult: FetchHistoryResult,
  previousRelease: ReleaseInfo | null = null,
  owner = 'LogarTraders',
  repo = 'cold-drink-distribution-app'
): ResolvedState {
  const historyReleases = historyResult.releases && historyResult.releases.length > 0
    ? historyResult.releases
    : [];

  const rateLimitInfo = latestResult.rateLimitInfo || historyResult.rateLimitInfo;

  // 1. Rate Limited (HTTP 403)
  if (latestResult.error?.code === 'RATE_LIMITED' || historyResult.error?.code === 'RATE_LIMITED') {
    const err = latestResult.error || historyResult.error!;
    const resetTs = rateLimitInfo?.resetTimestamp || Math.floor(Date.now() / 1000) + 3600;
    const mins = rateLimitInfo?.minutesUntilReset || 60;

    const errorPayload: GitHubApiError = {
      code: 'RATE_LIMITED',
      message: err.message,
      rateLimitInfo,
      minutesUntilReset: mins,
      resetTimestamp: resetTs,
      fallbackUrl: `https://github.com/${owner}/${repo}/releases`,
    };

    return {
      status: 'error',
      emptyReason: undefined,
      // Non-tearing: preserve previous release if available
      latestRelease: previousRelease || latestResult.release,
      historyReleases,
      error: errorPayload,
    };
  }

  // 2. Repository 404
  if (latestResult.error?.code === 'NOT_FOUND') {
    return {
      status: 'empty',
      emptyReason: 'REPO_404',
      latestRelease: null,
      historyReleases,
      error: {
        ...latestResult.error,
        fallbackUrl: `https://github.com/${owner}/${repo}`,
      },
    };
  }

  // 3. Generic Network Error
  if (latestResult.error) {
    return {
      status: 'error',
      emptyReason: undefined,
      latestRelease: previousRelease || null,
      historyReleases,
      error: latestResult.error,
    };
  }

  // 4. Empty Repository (No published releases)
  if (latestResult.emptyReason === 'NO_RELEASES') {
    return {
      status: 'empty',
      emptyReason: 'NO_RELEASES',
      latestRelease: null,
      historyReleases,
      error: null,
    };
  }

  // 5. Release without APK asset
  if (
    latestResult.emptyReason === 'NO_APK' ||
    (latestResult.release && !latestResult.release.apkAsset)
  ) {
    return {
      status: 'empty',
      emptyReason: 'NO_APK',
      latestRelease: latestResult.release,
      historyReleases,
      error: null,
    };
  }

  // 6. Success with verified downloadable APK
  if (latestResult.release && latestResult.release.apkAsset) {
    return {
      status: 'success',
      emptyReason: undefined,
      latestRelease: latestResult.release,
      historyReleases,
      error: null,
    };
  }

  // Default fallback
  return {
    status: 'empty',
    emptyReason: 'NO_RELEASES',
    latestRelease: null,
    historyReleases,
    error: null,
  };
}

export function useGitHubRelease(options: UseGitHubReleaseOptions = {}): GitHubReleaseState {
  const {
    autoFetch = true,
    pollIntervalMs = 0,
    perPageHistory = 10,
  } = options;

  const [status, setStatus] = useState<GitHubReleaseState['status']>('idle');
  const [emptyReason, setEmptyReason] = useState<EmptyReleaseReason | undefined>(undefined);
  const [latestRelease, setLatestRelease] = useState<ReleaseInfo | null>(null);
  const [historyReleases, setHistoryReleases] = useState<ReleaseInfo[]>([]);
  const [error, setError] = useState<GitHubApiError | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(true);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestReleaseRef = useRef<ReleaseInfo | null>(null);

  // Keep latestReleaseRef in sync for non-tearing updates
  useEffect(() => {
    latestReleaseRef.current = latestRelease;
  }, [latestRelease]);

  // Component lifecycle: manage mount flag and cleanup timers
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, []);

  // Rate limit countdown tick handler
  const setupRateLimitCountdown = useCallback((resetEpoch: number) => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    countdownTimerRef.current = setInterval(() => {
      if (!isMountedRef.current) return;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const remainingSeconds = Math.max(0, resetEpoch - nowSeconds);
      const minutesUntilReset = remainingSeconds <= 0 ? 0 : Math.max(1, Math.ceil(remainingSeconds / 60));

      if (remainingSeconds <= 0) {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      }

      setError((prev) => {
        if (!prev || prev.code !== 'RATE_LIMITED') return prev;
        return {
          ...prev,
          minutesUntilReset,
          rateLimitInfo: prev.rateLimitInfo
            ? { ...prev.rateLimitInfo, minutesUntilReset }
            : undefined,
        };
      });
    }, 10000);
  }, []);

  // Main dual-fetch coordination procedure
  const loadData = useCallback(
    async (forceRefresh = false) => {
      if (!isMountedRef.current) return;
      const config = getAppConfig();

      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setStatus((prev) => (prev === 'idle' ? 'loading' : prev));
      }

      try {
        const [latestResult, historyResult]: [FetchLatestResult, FetchHistoryResult] =
          await Promise.all([
            fetchLatestRelease(config, forceRefresh),
            fetchReleaseHistory(config, perPageHistory, forceRefresh),
          ]);

        if (!isMountedRef.current) return;

        const resolved = resolveReleaseState(
          latestResult,
          historyResult,
          latestReleaseRef.current,
          config.github.owner,
          config.github.repo
        );

        setStatus(resolved.status);
        setEmptyReason(resolved.emptyReason);
        setLatestRelease(resolved.latestRelease);
        setHistoryReleases(resolved.historyReleases);
        setError(resolved.error);

        if (resolved.error?.code === 'RATE_LIMITED' && resolved.error.resetTimestamp) {
          setupRateLimitCountdown(resolved.error.resetTimestamp);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        setStatus('error');
        setError({
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Unknown network failure',
        });
      } finally {
        if (isMountedRef.current) {
          setIsRefreshing(false);
        }
      }
    },
    [perPageHistory, setupRateLimitCountdown]
  );

  useEffect(() => {
    if (autoFetch) {
      loadData(false);
    }
  }, [autoFetch, loadData]);

  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) return;
    const interval = setInterval(() => {
      loadData(false);
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [pollIntervalMs, loadData]);

  const refetch = useCallback(
    async (forceRefresh = true): Promise<void> => {
      await loadData(forceRefresh);
    },
    [loadData]
  );

  return {
    status,
    emptyReason,
    latestRelease,
    historyReleases,
    error,
    refetch,
    isRefreshing,
  };
}
