import { NextResponse } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from './lib/session';
import { ACTIVE_BUILD } from './lib/build';

// The playtest build lives in /public/game, so without this anyone with the
// URL could load it. Only requests carrying a valid holder session get through.
export async function middleware(req) {
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  // With no build live, the game files stay closed to everyone, holders included.
  if (session && ACTIVE_BUILD) return NextResponse.next();

  return NextResponse.redirect(new URL('/playtest', req.url));
}

export const config = {
  matcher: ['/game/:path*', '/play'],
};
