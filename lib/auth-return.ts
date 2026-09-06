import { accountSections, projectSections } from './navigation';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ids = new Set([
  'project',
  'version',
  'annotation',
  'evidence',
  'mission',
  'task',
  'discussion',
  'invitation',
]);
const tabs = new Set<string>(projectSections.map((item) => item.id));
const settings = new Set<string>(accountSections.map((item) => item.id));

// Auth returns to a workspace location, never another origin or an API route.
// Only navigation parameters survive; OAuth errors and reset credentials do not.
export function authReturnPath(value: string): string {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return '/';
  let url: URL;
  try {
    url = new URL(value, 'https://canwoo.invalid');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://canwoo.invalid' || url.pathname !== '/')
    return '/';
  const params = new URLSearchParams();
  for (const [key, item] of url.searchParams) {
    if (params.has(key)) continue;
    const valid = ids.has(key)
      ? uuid.test(item)
      : key === 'tab'
        ? tabs.has(item)
        : key === 'settings'
          ? settings.has(item)
          : key === 'view'
            ? ['inbox', 'guide'].includes(item)
            : key === 'tasks'
              ? ['list', 'board', 'flow'].includes(item)
              : key === 'page'
                ? /^[1-9]\d*$/.test(item) && Number.isSafeInteger(Number(item))
                : false;
    if (valid) params.set(key, item);
  }
  return params.size ? `/?${params}` : '/';
}
