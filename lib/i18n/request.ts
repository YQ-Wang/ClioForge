import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, resolveLocale } from './core';
export async function requestLocale() {
  return resolveLocale(
    (await cookies()).get(LOCALE_COOKIE)?.value ??
      (await cookies()).get('canwoo_locale')?.value,
    (await headers()).get('accept-language') || '',
  );
}
