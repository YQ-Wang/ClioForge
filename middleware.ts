import { NextRequest, NextResponse } from 'next/server';
import { hasSessionCookie, isWorkspaceRequest } from './lib/public-site';

export function middleware(request: NextRequest) {
  if (request.nextUrl.hostname !== 'www.clioforge.com') {
    const response = NextResponse.next();
    if (request.nextUrl.pathname === '/') {
      response.headers.set('Cache-Control', 'private, no-store');
      if (
        isWorkspaceRequest(Object.fromEntries(request.nextUrl.searchParams)) ||
        hasSessionCookie(request.headers.get('cookie'))
      )
        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
    return response;
  }
  const target = new URL(request.url);
  target.protocol = 'https:';
  target.host = 'clioforge.com';
  return NextResponse.redirect(target, 308);
}
