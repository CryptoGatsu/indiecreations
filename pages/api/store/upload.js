import { handleUpload, handleUploadPresigned } from '@vercel/blob/client';
import { issueSignedToken } from '@vercel/blob';
import { readAccount } from '../../../lib/platform/auth';
import { mayUpload } from '../../../lib/platform/storeGames';
import {
  BLOB_TOKEN,
  BLOB_WEBHOOK_PUBLIC_KEY,
  MAX_BUILD_FILE_BYTES,
  MAX_IMAGE_BYTES,
  blobAuth,
  isBlobStorage,
  parseUploadPath,
  storageMode,
} from '../../../lib/platform/storage';

// POST (from @vercel/blob/client upload or uploadPresigned) -> permission to upload ONE file straight to the games
// Blob store: a short client token (token-connected store) or a presigned URL (keyless, OIDC-connected store).
// Only the game's developer gets one, only for a path inside their game (its open draft build, or its media), and only
// for file types the store allows.
const UPLOAD_MINUTES = 30;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!isBlobStorage) return res.status(404).json({ error: 'Uploads are not switched on.' });
  // No completion callbacks are asked for, so every request here comes from a signed-in developer's browser.
  const account = await readAccount(req);
  if (!account || !account.roles.includes('developer')) return res.status(401).json({ error: 'Sign in with a developer account.' });

  // What this developer may upload at `pathname`, or throws.
  const rulesFor = async (pathname) => {
    const target = parseUploadPath(pathname);
    if (!target || !(await mayUpload(account, target))) throw new Error('That upload is not allowed.');
    return {
      allowedContentTypes: [target.contentType],
      maximumSizeInBytes: target.kind === 'media' ? MAX_IMAGE_BYTES : MAX_BUILD_FILE_BYTES,
      addRandomSuffix: false,
      allowOverwrite: target.kind === 'build', // re-uploading a draft build replaces its files
    };
  };

  try {
    if (storageMode === 'blob') {
      const out = await handleUpload({ body: req.body, request: req, token: BLOB_TOKEN, onBeforeGenerateToken: rulesFor });
      return res.status(200).json(out);
    }
    const out = await handleUploadPresigned({
      body: req.body,
      request: req,
      webhookPublicKey: BLOB_WEBHOOK_PUBLIC_KEY || undefined,
      getSignedToken: async (pathname) => {
        const rules = await rulesFor(pathname);
        const token = await issueSignedToken({
          ...blobAuth(),
          pathname,
          operations: ['put'],
          validUntil: Date.now() + UPLOAD_MINUTES * 60 * 1000,
          maximumSizeInBytes: rules.maximumSizeInBytes,
          allowedContentTypes: rules.allowedContentTypes,
        });
        return { token, urlOptions: rules };
      },
    });
    return res.status(200).json(out);
  } catch (err) {
    console.error('store upload refused:', err?.message);
    return res.status(400).json({ error: err.message || 'Upload refused.' });
  }
}
