import { env } from 'cloudflare:workers';
import { authConfigured, googleConfigured, type AppEnv } from '@/lib/auth';
import Workspace from './workspace';
import { headers } from 'next/headers';
import DomainMove from './migrate-drafts/transfer';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const host = (await headers()).get('host')?.split(':')[0];
  if (host === 'canwoo.com' || host === 'www.canwoo.com') return <DomainMove />;
  const settings = env as unknown as AppEnv;
  return (
    <Workspace
      configured={authConfigured(settings)}
      googleAvailable={googleConfigured(settings)}
    />
  );
}
