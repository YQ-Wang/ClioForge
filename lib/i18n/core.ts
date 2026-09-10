import english from './en.json';
export type Locale = 'zh-CN' | 'en';
export const LOCALE_COOKIE = 'clioforge_locale';
export function localeFromHeaders(headers?: Pick<Headers, 'get'>): Locale {
  const parts =
    headers
      ?.get('cookie')
      ?.split(';')
      .map((part) => part.trim()) || [];
  const preference = [LOCALE_COOKIE, 'canwoo_locale']
    .map((name) =>
      parts.find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1),
    )
    .find((value) => value !== undefined);
  return resolveLocale(preference, headers?.get('accept-language') || '');
}
const messages: Record<string, string> = english;
export function resolveLocale(cookie?: string, acceptLanguage = ''): Locale {
  if (cookie === 'zh-CN' || cookie === 'en') return cookie;
  const preferences = acceptLanguage
    .split(',')
    .map((part) => {
      const [language, ...options] = part.trim().split(';');
      const q = options.find((option) => option.trim().startsWith('q='));
      return {
        language: language.toLowerCase(),
        weight: q ? Number(q.trim().slice(2)) : 1,
      };
    })
    .filter(
      ({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1,
    )
    .sort((a, b) => b.weight - a.weight);
  for (const { language } of preferences) {
    if (/^zh(?:-|$)/.test(language)) return 'zh-CN';
    if (/^en(?:-|$)/.test(language)) return 'en';
  }
  return 'zh-CN';
}
export function translate(
  locale: Locale,
  text: string,
  values: Record<string, string | number | undefined> = {},
) {
  const message = locale === 'en' ? (messages[text] ?? text) : text;
  // Replace placeholders once; source text containing braces is never interpreted again.
  return message.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key] ?? '') : placeholder,
  );
}
