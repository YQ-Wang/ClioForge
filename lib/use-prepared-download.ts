'use client';
import { useEffect, useRef, useState } from 'react';

// Keep an explicit link after asynchronous exports. Browsers can decline the
// automatic download even when generating the file succeeded.
export function usePreparedDownload() {
  const [download, setDownload] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const active = useRef(false);
  const url = useRef<string | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
    };
  }, []);
  function prepare(blob: Blob, name: string) {
    if (!active.current) return;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = URL.createObjectURL(blob);
    setDownload({ url: url.current, name });
    const link = document.createElement('a');
    link.href = url.current;
    link.download = name;
    link.click();
  }
  return { download, prepare };
}
