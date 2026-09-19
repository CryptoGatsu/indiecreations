import { NextResponse } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from './lib/session';

// The playtest build lives in /public/game, so without this anyone with the
// URL could load it. Only requests carrying a valid holder session get through.
export async function middleware(req) {
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  return NextResponse.redirect(new URL('/playtest', req.url));
}

export const config = {
  matcher: '/game/:path*',
};
