import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.hostname !== 'www.clioforge.com')
    return NextResponse.next();
  const target = new URL(request.url);
  target.protocol = 'https:';
  target.host = 'clioforge.com';
  return NextResponse.redirect(target, 308);
}
