import { NextRequest, NextResponse } from 'next/server';
import { LEGACY_HOST, migratedURL } from './lib/domain-migration';

export function middleware(request: NextRequest) {
  const { hostname, pathname } = request.nextUrl;
  if (hostname === 'www.clioforge.com')
    return NextResponse.redirect(migratedURL(request.url), 308);
  if (hostname !== LEGACY_HOST && hostname !== 'www.canwoo.com')
    return NextResponse.next();
  if (!['GET', 'HEAD'].includes(request.method))
    return NextResponse.json(
      {
        error:
          'ClioForge has moved. Open https://clioforge.com and sign in again.',
      },
      { status: 409 },
    );
  // Let the old homepage inspect local drafts before offering the move.
  if (
    pathname === '/' ||
    pathname === '/migrate-drafts' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/brand/') ||
    ['/icon.svg', '/favicon.svg', '/favicon.ico'].includes(pathname)
  )
    return NextResponse.next();
  return NextResponse.redirect(migratedURL(request.url), 307);
}
