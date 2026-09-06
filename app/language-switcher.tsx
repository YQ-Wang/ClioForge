'use client';
import { Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <fieldset
      className="language-switcher"
      aria-label={locale === 'en' ? 'Interface language' : '界面语言'}
    >
      <Languages size={17} aria-hidden="true" />
      <button
        type="button"
        lang="zh-CN"
        aria-pressed={locale === 'zh-CN'}
        onClick={() => setLocale('zh-CN')}
      >
        中文
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
      >
        English
      </button>
    </fieldset>
  );
}
