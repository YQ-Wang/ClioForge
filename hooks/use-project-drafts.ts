'use client';
import { useEffect, useState } from 'react';
import { draftPrefix, readDrafts, type DraftRecord } from '@/lib/drafts';

export function useProjectDrafts(userId: string, projectId: string) {
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  useEffect(() => {
    const refresh = () => {
      try {
        setDrafts(readDrafts(localStorage, draftPrefix(userId, projectId)));
      } catch {
        setDrafts([]);
      }
    };
    refresh();
    window.addEventListener('foliotrace-drafts', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('foliotrace-drafts', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [userId, projectId]);
  return drafts;
}
