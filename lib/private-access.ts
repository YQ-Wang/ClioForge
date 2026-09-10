import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';

export type PrivateAccessEnv = {
  PRIVATE_GITHUB_ACCESS?: string;
  PRIVATE_GITHUB_USER_IDS?: string;
  PRIVATE_GITHUB_CLIENT_ID?: string;
  PRIVATE_GITHUB_CLIENT_SECRET?: string;
  PRIVATE_GITHUB_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
};

export const PRIVATE_AUTH_PATH = '/api/private-auth';
const loginPath = '/private-access';

export function privateAccessRequired(env: PrivateAccessEnv, request: Request) {
  const host = new URL(request.url).hostname.replace(/\.$/, '');
  return (
    env.PRIVATE_GITHUB_ACCESS === '1' || /(^|\.)clioforge\.com$/i.test(host)
  );
}

export function allowedGitHubIds(value: string | undefined) {
  const ids = (value || '').split(',').map((id) => id.trim());
  return ids.length && ids.every((id) => /^[1-9]\d*$/.test(id))
    ? new Set(ids)
    : new Set<string>();
}

function configuration(env: PrivateAccessEnv) {
  const ids = allowedGitHubIds(env.PRIVATE_GITHUB_USER_IDS);
  if (
    env.PRIVATE_GITHUB_ACCESS !== '1' ||
    !ids.size ||
    !env.PRIVATE_GITHUB_CLIENT_ID ||
    !env.PRIVATE_GITHUB_CLIENT_SECRET ||
    (env.PRIVATE_GITHUB_AUTH_SECRET?.length || 0) < 32
  )
    return null;
  try {
    const origin = new URL(env.BETTER_AUTH_URL || '');
    if (origin.protocol !== 'https:' || origin.username || origin.password)
      return null;
    return { origin: origin.origin, ids };
  } catch {
    return null;
  }
}

export function createPrivateAuth(env: PrivateAccessEnv) {
  const config = configuration(env);
  if (!config) throw new Error('Private access is not configured');
  return betterAuth({
    appName: 'ClioForge Private Access',
    baseURL: config.origin,
    basePath: PRIVATE_AUTH_PATH,
    secret: env.PRIVATE_GITHUB_AUTH_SECRET,
    trustedOrigins: [config.origin],
    socialProviders: {
      github: {
        clientId: env.PRIVATE_GITHUB_CLIENT_ID!,
        clientSecret: env.PRIVATE_GITHUB_CLIENT_SECRET!,
        mapProfileToUser(profile) {
          const githubId = String(profile.id);
          if (!config.ids.has(githubId))
            throw new APIError('FORBIDDEN', {
              message: 'GitHub account is not invited',
            });
          return { githubId };
        },
      },
    },
    user: {
      additionalFields: {
        // Only the server-side GitHub profile reaches this field; all user-write endpoints are blocked.
        githubId: { type: 'string', required: true },
      },
    },
    account: {
      storeStateStrategy: 'cookie',
      storeAccountCookie: false,
      accountLinking: { enabled: false },
    },
    session: {
      expiresIn: 8 * 60 * 60,
      cookieCache: {
        enabled: true,
        strategy: 'jwe',
        maxAge: 8 * 60 * 60,
        refreshCache: false,
        version: 'private-github-v1',
      },
    },
    advanced: {
      cookiePrefix: 'clioforge-private',
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      },
    },
    onAPIError: { errorURL: config.origin + loginPath + '?error=access' },
    logger: { disabled: true },
    telemetry: { enabled: false },
  });
}

export function privateResponse(response: Response) {
  // Preserve streaming and WebSocket responses rather than buffering the body.
  if (response.status === 101) return response;
  response = new Response(response.body, response);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'same-origin');
  return response;
}

function message(request: Request, status: number, text: string) {
  return privateResponse(
    new Response(request.method === 'HEAD' ? null : text, {
      status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    }),
  );
}

function loginPage(request: Request) {
  const error = new URL(request.url).searchParams.has('error');
  return privateResponse(
    new Response(
      request.method === 'HEAD'
        ? null
        : `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>ClioForge: Private access</title>
<style>html{color-scheme:light dark;font-family:ui-sans-serif,system-ui,sans-serif;background:light-dark(#f5f6f8,#14171c);color:light-dark(#20242b,#e7eaf0)}body{margin:0;min-height:100svh;display:grid;place-items:center}main{box-sizing:border-box;margin:24px;padding:40px;max-width:440px;border:1px solid light-dark(#e0e4eb,#343a46);border-radius:24px;background:light-dark(#fff,#1d222a)}h1{font-size:28px;letter-spacing:-1px;margin:0 0 24px}p{line-height:1.7;color:light-dark(#5b6471,#b6becb)}button{font:inherit;font-weight:600;width:100%;padding:14px 20px;margin:18px 0 0;border:0;border-radius:12px;background:#315edb;color:white;cursor:pointer}button:hover{background:#264db8}button:focus-visible{outline:3px solid #9eb6ff;outline-offset:3px}.small{font-size:13px}.error{color:light-dark(#a32626,#ffb5b5)}</style></head>
<body><main><h1>ClioForge</h1><p>Private research workspace<br>仅限受邀研究者访问</p>${error ? '<p class="error" role="alert">Sign-in could not be completed. Use an invited GitHub account and try again.<br>登录未完成，请使用受邀的 GitHub 账号重试。</p>' : ''}<form method="post" action="${loginPath}/login"><button type="submit">Continue with GitHub · 使用 GitHub 继续</button></form><p class="small">Your GitHub identity is checked before this installation can be opened. Project permissions still apply.<br>通过账号验证后方可进入；研究项目仍按原有权限访问。</p></main></body></html>`,
      {
        status: 401,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://github.com; frame-ancestors 'none'; base-uri 'none'",
          'X-Content-Type-Options': 'nosniff',
        },
      },
    ),
  );
}

/** Return null only after an invited GitHub session has been verified. */
export async function privateAccessGate(
  request: Request,
  env: PrivateAccessEnv,
): Promise<Response | null> {
  if (!privateAccessRequired(env, request)) return null;
  const config = configuration(env);
  if (!config)
    return message(request, 503, 'Private access is not configured.\n');
  const url = new URL(request.url);
  if (url.origin !== config.origin) {
    if (
      url.hostname === 'www.' + new URL(config.origin).hostname &&
      ['GET', 'HEAD'].includes(request.method)
    )
      return privateResponse(
        new Response(null, {
          status: 308,
          headers: { Location: config.origin + url.pathname + url.search },
        }),
      );
    return message(request, 403, 'Access denied.\n');
  }
  if (url.pathname === '/robots.txt')
    return message(request, 200, 'User-agent: *\nAllow: /\n');
  const auth = createPrivateAuth(env);
  try {
    if (url.pathname === loginPath + '/login') {
      if (request.method !== 'POST')
        return message(request, 405, 'Method not allowed.\n');
      if (request.headers.get('Origin') !== config.origin)
        return message(request, 403, 'Access denied.\n');
      const result = await auth.api.signInSocial({
        body: {
          provider: 'github',
          callbackURL: config.origin,
          errorCallbackURL: config.origin + loginPath + '?error=access',
        },
        headers: request.headers,
        asResponse: true,
      });
      if (!result.ok)
        return message(request, 503, 'Sign-in is temporarily unavailable.\n');
      const data = (await result.json()) as { url?: string };
      const destination = new URL(data.url || '');
      if (destination.origin !== 'https://github.com')
        throw new Error('Invalid identity provider URL');
      const headers = new Headers(result.headers);
      headers.set('Location', destination.href);
      headers.delete('Content-Type');
      return privateResponse(new Response(null, { status: 303, headers }));
    }
    if (
      url.pathname === PRIVATE_AUTH_PATH + '/callback/github' &&
      request.method === 'GET'
    )
      return privateResponse(await auth.handler(request));
    // No public sign-up, profile editing, alternate IdPs or token endpoints.
    if (
      url.pathname.startsWith(PRIVATE_AUTH_PATH + '/') ||
      url.pathname === PRIVATE_AUTH_PATH
    )
      return message(request, 404, 'Not found.\n');
    if (url.pathname === loginPath && ['GET', 'HEAD'].includes(request.method))
      return loginPage(request);
    const session = await auth.api.getSession({ headers: request.headers });
    if (session && config.ids.has(session.user.githubId)) return null;
    if (
      ['GET', 'HEAD'].includes(request.method) &&
      !url.pathname.startsWith('/api/') &&
      request.headers.get('Accept')?.includes('text/html')
    )
      return loginPage(request);
    return message(request, 401, 'GitHub sign-in required.\n');
  } catch {
    return message(
      request,
      403,
      'Sign-in could not be verified. Please return to /private-access and try again.\n',
    );
  }
}
