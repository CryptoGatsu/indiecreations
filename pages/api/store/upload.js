import { handleUpload } from '@vercel/blob/client';
import { readAccount } from '../../../lib/platform/auth';
import { mayUpload } from '../../../lib/platform/storeGames';
import { BLOB_TOKEN, MAX_BUILD_FILE_BYTES, MAX_IMAGE_BYTES, parseUploadPath, storageMode } from '../../../lib/platform/storage';

// POST (from @vercel/blob/client upload) -> a short-lived token to upload ONE file straight to the games Blob store.
// Only the game's developer gets one, only for a path inside their game (its open draft build, or its media), and only
// for file types the store allows.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (storageMode !== 'blob') return res.status(404).json({ error: 'Uploads are not switched on.' });
  const account = await readAccount(req);
  if (!account || !account.roles.includes('developer')) return res.status(401).json({ error: 'Sign in with a developer account.' });
  try {
    const out = await handleUpload({
      body: req.body,
      request: req,
      token: BLOB_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        const target = parseUploadPath(pathname);
        if (!target || !(await mayUpload(account, target))) throw new Error('That upload is not allowed.');
        return {
          allowedContentTypes: [target.contentType],
          maximumSizeInBytes: target.kind === 'media' ? MAX_IMAGE_BYTES : MAX_BUILD_FILE_BYTES,
          addRandomSuffix: false,
          allowOverwrite: target.kind === 'build', // re-uploading a draft build replaces its files
        };
      },
    });
    return res.status(200).json(out);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Upload refused.' });
  }
}
