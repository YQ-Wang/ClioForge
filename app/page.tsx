import { env } from 'cloudflare:workers';
import {
  authConfigured,
  createAuth,
  googleConfigured,
  type AppEnv,
} from '@/lib/auth';
import { headers } from 'next/headers';
import { requestLocale } from '@/lib/i18n/request';
import {
  hasSessionCookie,
  isWorkspaceRequest,
  publicMetadata,
} from '@/lib/public-site';
import PublicSite from './public-site';
import Workspace from './workspace';
export const dynamic = 'force-dynamic';
type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ searchParams }: HomeProps) {
  return isWorkspaceRequest(await searchParams)
    ? { robots: { index: false, follow: false } }
    : publicMetadata('home', await requestLocale());
}
export default async function Home({ searchParams }: HomeProps) {
  const settings = env as unknown as AppEnv;
  if (!isWorkspaceRequest(await searchParams)) {
    const requestHeaders = await headers();
    let signedIn = false;
    if (
      authConfigured(settings) &&
      hasSessionCookie(requestHeaders.get('cookie'))
    ) {
      try {
        signedIn = !!(await createAuth(settings).api.getSession({
          headers: requestHeaders,
        }));
      } catch {
        // Public information remains available when the account service is unavailable.
      }
    }
    if (!signedIn) return <PublicSite page="home" />;
  }
  return (
    <Workspace
      configured={authConfigured(settings)}
      googleAvailable={googleConfigured(settings)}
    />
  );
}
