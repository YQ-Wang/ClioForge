import type { Metadata } from 'next';
import type { Locale } from './i18n/core';

export type PublicPage = 'home' | 'adams' | 'guide';
export const publicPages = {
  home: {
    path: '/',
    en: 'ClioForge: Open-source AI research IDE',
    zh: 'ClioForge 参伍: 开源 AI 人文研究工作台',
  },
  adams: {
    path: '/research/adams',
    en: 'Reading the Adams letters with evidence | ClioForge',
    zh: '从 Adams 书信到可核对的论证 | ClioForge',
  },
  guide: {
    path: '/guide',
    en: 'From sources to a reviewed draft | ClioForge',
    zh: '从原始材料到审读后的草稿 | ClioForge',
  },
} as const;
export const WORKSPACE_URL = '/?view=projects';
// This only selects the entrance/cache policy. Better Auth still verifies the session.
export function hasSessionCookie(header: string | null) {
  return /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(
    header || '',
  );
}
const workspaceKeys = new Set([
  'view',
  'project',
  'tab',
  'version',
  'page',
  'annotation',
  'evidence',
  'mission',
  'task',
  'discussion',
  'invitation',
  'settings',
  'tasks',
  'error',
  'error_description',
  'token',
  'code',
  'state',
  'drive',
]);
export function isWorkspaceRequest(params: Record<string, unknown>) {
  return Object.keys(params).some((key) => workspaceKeys.has(key));
}
export function publicTitle(page: PublicPage, locale: Locale) {
  return publicPages[page][locale === 'en' ? 'en' : 'zh'];
}
export function publicMetadata(page: PublicPage, locale: Locale): Metadata {
  const title = publicTitle(page, locale);
  const description =
    locale === 'en'
      ? 'An open-source workspace for history and humanities: read sources, review evidence and work with AI while keeping citations and research judgments traceable.'
      : '为历史与人文学者构建的开源工作台：阅读材料、审读证据、与 AI 协作，让引用和研究判断有据可循。';
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: 'ClioForge',
      type: 'website',
    },
    twitter: { card: 'summary', title, description },
  };
}
