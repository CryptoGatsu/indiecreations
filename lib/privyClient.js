// Browser-safe: whether store accounts (Privy sign-in) are switched on. NEXT_PUBLIC_PRIVY_APP_ID is set in Vercel;
// without it the site keeps its wallet-message sign-in exactly as before.
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';
// Privy refuses to start (and takes the page down with it) unless the app ID is its 25-character form, so a mistyped
// value switches accounts off instead.
export const privyEnabled = /^[a-z0-9]{25}$/.test(PRIVY_APP_ID);
if (PRIVY_APP_ID && !privyEnabled) console.error('NEXT_PUBLIC_PRIVY_APP_ID is not a Privy app ID; store accounts stay off.');
