'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { LOCALE_COOKIE, translate, type Locale } from './core';
const LanguageContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
} | null>(null);
export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('Missing I18nProvider');
  const { locale, setLocale } = context;
  const t = useCallback(
    (text: string, values?: Record<string, string | number | undefined>) =>
      translate(locale, text, values),
    [locale],
  );
  return { locale, setLocale, t };
}
