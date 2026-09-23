import { issueSignedToken, presignUrl } from '@vercel/blob';
import { SESSION_COOKIE, readSessionToken } from '../../../lib/session';
import { checkHolder } from '../../../lib/holder';
import { DOWNLOAD_BUILD } from '../../../lib/build';
import { recordDownload } from '../../../lib/downloadStore';

// The playtest download. The zip lives in a private Blob store, so it can't be fetched by URL; a verified holder
// is redirected to a signed link for that one file, good for five minutes. Share it and it soon stops working.
const LINK_MINUTES = 5;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  if (!DOWNLOAD_BUILD) return res.redirect(302, '/playtest');

  const session = await readSessionToken(req.cookies[SESSION_COOKIE]);
  if (!session) return res.redirect(302, '/playtest');

  // Holdings are checked again at download time (a session lasts hours); if the chain can't be reached, the
  // check made at sign-in stands.
  try {
    const { holder } = await checkHolder(session.address);
    if (!holder) return res.redirect(302, '/playtest?link=notholder');
  } catch (err) {
    console.error('holder re-check failed, using the session:', err);
  }

  // Count it for the tracker. Logging never holds up a download: a slow or failed write is skipped.
  try {
    await Promise.race([recordDownload(session.address, DOWNLOAD_BUILD), new Promise((r) => setTimeout(r, 2000))]);
  } catch (err) {
    console.error('logging the download failed:', err);
  }

  try {
    const validUntil = Date.now() + LINK_MINUTES * 60 * 1000;
    const token = await issueSignedToken({ pathname: DOWNLOAD_BUILD.pathname, operations: ['get'], validUntil });
    const { presignedUrl } = await presignUrl(token, {
      operation: 'get',
      pathname: DOWNLOAD_BUILD.pathname,
      access: 'private',
      validUntil,
    });
    return res.redirect(302, presignedUrl);
  } catch (err) {
    console.error('signing the download failed:', err);
    return res.status(502).json({ error: 'The download is unavailable right now. Please try again in a minute.' });
  }
}
