'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { workspaceRoute } from '@/lib/navigation';
const changed = 'canwoo:navigation';
function subscribe(notify: () => void) {
  window.addEventListener('popstate', notify);
  window.addEventListener(changed, notify);
  return () => {
    window.removeEventListener('popstate', notify);
    window.removeEventListener(changed, notify);
  };
}
export function navigateWorkspace(path: string, replace = false) {
  if (path === location.pathname + location.search) return;
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new Event(changed));
}
export function useWorkspaceSearch() {
  return useSyncExternalStore(
    subscribe,
    () => location.search,
    () => '',
  );
}
export function useWorkspaceRoute() {
  const search = useWorkspaceSearch();
  return useMemo(() => workspaceRoute(search), [search]);
}
