import { env } from 'cloudflare:workers';
import { authConfigured, googleConfigured, type AppEnv } from '@/lib/auth';
import Workspace from './workspace';
export const dynamic = 'force-dynamic';
export const metadata = {
  robots: { index: false, follow: false },
};
export default function Home() {
  const settings = env as unknown as AppEnv;
  return (
    <Workspace
      configured={authConfigured(settings)}
      googleAvailable={googleConfigured(settings)}
    />
  );
}
