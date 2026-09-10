export const THEME_COOKIE = 'clioforge-theme';
export const themes = ['light', 'dark', 'system'] as const;
export type Theme = (typeof themes)[number];
export function resolveTheme(value?: string): Theme {
  return themes.includes(value as Theme) ? (value as Theme) : 'system';
}
