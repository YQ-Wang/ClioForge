import { env } from 'cloudflare:workers';
import { authConfigured, googleConfigured, type AppEnv } from '@/lib/auth';
import Workspace from './workspace';
import PublicSite from './public-site';
import { isWorkspaceRequest, publicMetadata } from '@/lib/public-site';
import { requestLocale } from '@/lib/i18n/request';
export const dynamic = 'force-dynamic';
type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ searchParams }: PageProps) {
  return isWorkspaceRequest(await searchParams)
    ? { robots: { index: false, follow: false } }
    : publicMetadata('home', await requestLocale());
}
export default async function Home({ searchParams }: PageProps) {
  if (!isWorkspaceRequest(await searchParams))
    return <PublicSite page="home" />;
  const settings = env as unknown as AppEnv;
  return (
    <Workspace
      configured={authConfigured(settings)}
      googleAvailable={googleConfigured(settings)}
    />
  );
}
