'use client';
import { useEffect, useState } from 'react';
import {
  readReviewDraft,
  removeReviewDraft,
  sameReviewDraft,
  type ReviewDraft,
} from '@/lib/review-draft';

export function useReviewDraft(key: string, revision: number) {
  const [state, setState] = useState<{
    key: string;
    value: ReviewDraft;
  } | null>(null);
  const [storageError, setStorageError] = useState(false);
  const fallback: ReviewDraft = { humanText: '', reason: '', revision };
  const value = state?.key === key ? state.value : fallback;
  useEffect(() => {
    try {
      const stored = readReviewDraft(localStorage.getItem(key));
      setState({
        key,
        value: stored || { humanText: '', reason: '', revision },
      });
    } catch {
      setStorageError(true);
    }
    // A background refresh must not silently rebase an in-progress review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  function update(patch: Partial<ReviewDraft>) {
    const next = { ...value, ...patch };
    if (!value.humanText && !value.reason) next.revision = revision;
    setState({ key, value: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  function clearIf(expected: ReviewDraft) {
    try {
      if (!removeReviewDraft(localStorage, key, expected)) return;
      setStorageError(false);
    } catch {
      setStorageError(true);
      return;
    }
    setState((current) =>
      current?.key === key && sameReviewDraft(current.value, expected)
        ? { key, value: fallback }
        : current,
    );
  }
  return { value, update, clear: () => clearIf(value), clearIf, storageError };
}
