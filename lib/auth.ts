import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@/db/schema';
import { localeFromHeaders, translate, type Locale } from './i18n/core';
export type AppEnv = Pick<Cloudflare.Env, 'DB' | 'FILES'> &
  Partial<Pick<Cloudflare.Env, 'EMAIL' | 'JOB_QUEUE'>> & {
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    FOLIOTRACE_ENCRYPTION_KEY?: string;
    AUTH_ALLOW_UNVERIFIED_LOCAL?: string;
    EMAIL_FROM?: string;
    GOOGLE_DRIVE_CLIENT_ID?: string;
    GOOGLE_DRIVE_CLIENT_SECRET?: string;
    GOOGLE_PICKER_API_KEY?: string;
    GOOGLE_CLOUD_PROJECT_NUMBER?: string;
  };
export function authConfigured(env: AppEnv) {
  return (
    !!env.DB &&
    !!env.BETTER_AUTH_URL &&
    (env.BETTER_AUTH_SECRET?.length || 0) >= 32
  );
}
export function googleConfigured(env: AppEnv) {
  return !!(env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET);
}
export function createAuth(
  env: AppEnv,
  background?: (task: Promise<unknown>) => void,
) {
  if (!authConfigured(env)) throw new Error('Authentication not configured');
  const origin = new URL(env.BETTER_AUTH_URL!).origin;
  const local =
    ['localhost', '127.0.0.1'].includes(new URL(origin).hostname) &&
    env.AUTH_ALLOW_UNVERIFIED_LOCAL === '1';
  async function send(
    to: string,
    subject: string,
    url: string,
    locale: Locale,
  ) {
    if (!env.EMAIL || !env.EMAIL_FROM)
      throw new Error('Email service not configured');
    await env.EMAIL.send({
      from: { email: env.EMAIL_FROM, name: 'ClioForge' },
      to,
      subject: `ClioForge · ${translate(locale, subject)}`,
      text: `ClioForge 参伍\n\n${translate(locale, subject)}\n${url}\n\n${translate(locale, '如果不是你发起的请求，请忽略这封邮件。')}`,
    });
  }
  function deliver(
    to: string,
    subject: string,
    url: string,
    request?: Request,
  ) {
    const pending = send(to, subject, url, localeFromHeaders(request?.headers));
    if (background) {
      background(pending);
      return Promise.resolve();
    }
    return pending;
  }
  return betterAuth({
    appName: 'ClioForge',
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    socialProviders: googleConfigured(env)
      ? {
          google: {
            clientId: env.GOOGLE_DRIVE_CLIENT_ID!,
            clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET!,
            prompt: 'select_account',
          },
        }
      : {},
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, allowDifferentEmails: false },
    },
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: 'sqlite',
      schema,
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: !local,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) => {
        await deliver(user.email, '重置密码', url, request);
      },
    },
    emailVerification: {
      sendOnSignUp: !local,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }, request) => {
        await deliver(user.email, '验证邮箱', url, request);
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30 },
    session: { expiresIn: 60 * 60 * 24 * 7 },
    telemetry: { enabled: false },
  });
}
