'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/client-api';
import type { Evidence } from '@/lib/types';

type ReadingPageData = {
  evidence: Evidence[];
  role: string | null;
  truncated: boolean;
};

type ReadingPageState = ReadingPageData & {
  key: string;
  loading: boolean;
  error: string | null;
  accessDenied: boolean;
};

function emptyPage(key: string): ReadingPageState {
  return {
    key,
    evidence: [],
    role: null,
    truncated: false,
    loading: false,
    error: null,
    accessDenied: false,
  };
}

export function useReadingPage(
  projectId: string | null | undefined,
  versionId: string | null | undefined,
  page: number,
  active: boolean,
  annotationId?: string,
): ReadingPageData & {
  loading: boolean;
  error: string | null;
  accessDenied: boolean;
  refresh: () => Promise<void>;
} {
  const key = JSON.stringify([projectId, versionId, page, annotationId]);
  const enabled =
    active && !!projectId && !!versionId && Number.isInteger(page) && page > 0;
  const [state, setState] = useState<ReadingPageState>(() => ({
    ...emptyPage(key),
    loading: enabled,
  }));
  const current =
    state.key === key ? state : { ...emptyPage(key), loading: enabled };
  const controls = useRef<{
    key: string;
    refresh: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    setState((previous) =>
      previous.key === key ? { ...previous, loading: false } : emptyPage(key),
    );
    if (!enabled || !projectId || !versionId) return;

    let disposed = false;
    let denied = false;
    let inFlight: Promise<void> | null = null;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const path = `/api/reading?${new URLSearchParams({
      project_id: projectId,
      version_id: versionId,
      page: String(page),
      ...(annotationId ? { annotation_id: annotationId } : {}),
    })}`;
    const visible = () => document.visibilityState === 'visible';

    const syncPolling = () => {
      if (disposed || denied || !visible()) {
        if (timer !== null) clearInterval(timer);
        timer = null;
      } else if (timer === null) {
        timer = setInterval(() => {
          void read(false);
        }, 5000);
      }
    };

    const read = (manual: boolean): Promise<void> => {
      if (disposed || !visible() || (denied && !manual))
        return Promise.resolve();
      if (inFlight) return inFlight;
      if (manual) denied = false;
      const requestController = new AbortController();
      controller = requestController;
      setState((previous) => ({
        ...(previous.key === key ? previous : emptyPage(key)),
        loading: true,
      }));
      inFlight = (async () => {
        try {
          const response = await fetch(path, {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: requestController.signal,
          });
          // Permission failures must still stop polling when a proxy returns a non-JSON body.
          const data = (await response.json().catch(() => {
            throw new ApiError(
              '暂时无法更新本页批注，请重试。',
              response.status,
            );
          })) as ReadingPageData & { error?: string };
          if (!response.ok)
            throw new ApiError(
              data.error || '暂时无法更新本页批注，请重试。',
              response.status,
            );
          if (disposed || requestController.signal.aborted) return;
          setState({
            key,
            evidence: data.evidence,
            role: data.role,
            truncated: data.truncated,
            loading: false,
            error: null,
            accessDenied: false,
          });
        } catch (error) {
          if (disposed || requestController.signal.aborted) return;
          denied =
            error instanceof ApiError &&
            (error.status === 401 ||
              error.status === 403 ||
              error.status === 404);
          setState((previous) => ({
            ...(denied || previous.key !== key ? emptyPage(key) : previous),
            loading: false,
            accessDenied:
              denied || (previous.key === key && previous.accessDenied),
            error:
              error instanceof Error
                ? error.message
                : '暂时无法更新本页批注，请重试。',
          }));
        }
      })().finally(() => {
        inFlight = null;
        controller = null;
        syncPolling();
      });
      return inFlight;
    };

    const currentControls = { key, refresh: () => read(true) };
    controls.current = currentControls;
    const onFocus = () => {
      void read(false);
    };
    const onVisibility = () => {
      syncPolling();
      if (visible()) void read(false);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    syncPolling();
    void read(false);

    return () => {
      disposed = true;
      controller?.abort();
      if (timer !== null) clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      if (controls.current === currentControls) controls.current = null;
    };
  }, [key, enabled, projectId, versionId, page, annotationId]);

  const refresh = useCallback(async () => {
    if (enabled && controls.current?.key === key)
      await controls.current.refresh();
  }, [enabled, key]);

  return {
    evidence: current.evidence,
    role: current.role,
    truncated: current.truncated,
    loading: enabled && current.loading,
    error: current.error,
    accessDenied: current.accessDenied,
    refresh,
  };
}
