import { readAccount } from '../../../lib/platform/auth';
import { mayUpload } from '../../../lib/platform/storeGames';
import { MAX_BUILD_FILE_BYTES, MAX_IMAGE_BYTES, localWrite, parseUploadPath, storageMode } from '../../../lib/platform/storage';

export const config = { api: { bodyParser: false } };

// PUT ?path=games/... (raw file body) -> stores one upload on disk. Local development and tests only
// (STORE_LOCAL_STORAGE); production uploads go straight to Blob (/api/store/upload).
export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).end();
  if (storageMode !== 'local') return res.status(404).end();
  const account = await readAccount(req);
  if (!account || !account.roles.includes('developer')) return res.status(401).json({ error: 'Sign in with a developer account.' });
  const target = parseUploadPath(req.query.path);
  if (!target || !(await mayUpload(account, target))) return res.status(403).json({ error: 'That upload is not allowed.' });
  const limit = target.kind === 'media' ? MAX_IMAGE_BYTES : MAX_BUILD_FILE_BYTES;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) return res.status(413).json({ error: 'That file is too large.' });
    chunks.push(c);
  }
  localWrite(req.query.path, Buffer.concat(chunks));
  return res.status(200).json({ url: `/api/store/local/${req.query.path}`, pathname: req.query.path });
}
