import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './platform.css';
import './product.css';
import './brand.css';
import './theme.css';
import './reading.css';
import './interactions.css';
import './auth.css';
import './public-site.css';
import { cookies } from 'next/headers';
import { resolveTheme, THEME_COOKIE } from '@/lib/theme';
import { ThemeProvider } from './theme-switcher';
import { I18nProvider } from '@/lib/i18n/provider';
import { requestLocale } from '@/lib/i18n/request';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return {
    robots: { index: false, follow: false },
    icons: { icon: '/icon.svg?v=atelier4' },
    title:
      locale === 'en'
        ? 'ClioForge: Research Workspace'
        : 'ClioForge 参伍: 研究工作台',
    description:
      locale === 'en'
        ? 'Connect original sources, research questions and traceable evidence.'
        : '连接原始材料、研究问题和可追溯的证据。',
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await requestLocale();
  const theme = resolveTheme(
    (await cookies()).get(THEME_COOKIE)?.value ??
      (await cookies()).get('canwoo-theme')?.value,
  );
  return (
    <html lang={locale} data-theme={theme}>
      <body className={`${geist.variable} ${geistMono.variable} antialiased`}>
        <I18nProvider initialLocale={locale}>
          <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
