'use client';
import { useEffect, useState } from 'react';
import { draftRecord, type DraftValue } from '@/lib/drafts';
export function useLocalDraft(key: string, fallback: DraftValue) {
  const [state, setState] = useState<{
    key: string;
    value: DraftValue;
    restored: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key),
        parsed = raw ? draftRecord.safeParse(JSON.parse(raw)) : null;
      setState({
        key,
        value: parsed?.success ? parsed.data.value : fallback,
        restored: !!parsed?.success,
      });
    } catch {
      setState({ key, value: fallback, restored: false });
      setError('本机草稿不可用；请及时保存，切换前复制未保存内容。');
    }
    // Only a change of draft identity loads a stored value; ordinary refreshes must preserve edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  function update(value: DraftValue) {
    setState({ key, value, restored: state?.restored || false });
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ updatedAt: new Date().toISOString(), value }),
      );
      setError('');
      window.dispatchEvent(new Event('foliotrace-drafts'));
    } catch {
      setError('本机草稿写入失败；请保存到项目后再离开。');
    }
  }
  function clear() {
    try {
      localStorage.removeItem(key);
      window.dispatchEvent(new Event('foliotrace-drafts'));
      setError('');
    } catch {
      setError('无法清除本机草稿。');
    }
    setState({ key, value: fallback, restored: false });
  }
  return {
    value: state?.key === key ? state.value : fallback,
    loaded: state?.key === key,
    restored: state?.key === key && state.restored,
    error,
    update,
    clear,
  };
}
