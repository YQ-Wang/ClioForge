'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/lib/i18n/provider';
import { THEME_COOKIE, themes, type Theme } from '@/lib/theme';
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({ theme: 'system', setTheme: () => {} });
export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setValue] = useState(initialTheme);
  function setTheme(next: Theme) {
    setValue(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useContext(ThemeContext);
  const { locale } = useI18n();
  const labels =
    locale === 'en'
      ? { light: 'Light', dark: 'Dark', system: 'System' }
      : { light: '浅色', dark: '深色', system: '跟随系统' };
  const icons = { light: Sun, dark: Moon, system: Monitor },
    Icon = icons[theme];
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="theme-toggle"
        aria-label={`${locale === 'en' ? 'Appearance' : '外观'}: ${labels[theme]}`}
        title={locale === 'en' ? 'Change appearance' : '切换外观'}
      >
        <Icon size={18} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (themes.includes(value as Theme)) {
              setTheme(value as Theme);
              setOpen(false);
            }
          }}
        >
          {themes.map((value) => {
            const OptionIcon = icons[value];
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <OptionIcon size={16} aria-hidden="true" />
                {labels[value]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
