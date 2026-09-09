import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (
    request.nextUrl.pathname === '/' ||
    request.nextUrl.pathname.startsWith('/api/')
  )
    response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
