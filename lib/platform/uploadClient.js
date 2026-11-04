// Browser-only: unpacks a build zip and uploads files to the store's storage, one file at a time per request.
import { unzip } from 'fflate';
import { BUILD_TYPES, IMAGE_TYPES, MAX_BUILD_BYTES, MAX_BUILD_FILES, MAX_IMAGE_BYTES, cleanBuildPath, extOf } from './files';

const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/;

// { files: [{ path, data: Uint8Array, contentType }], size } from a build zip, or throws with a plain message.
// If everything sits in one top folder (a zipped "Build" folder), that folder becomes the top level.
export async function readBuildZip(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise((resolve, reject) => unzip(buf, (err, out) => (err ? reject(err) : resolve(out))));
  let paths = Object.keys(entries).filter((p) => !p.endsWith('/') && !JUNK.test(p));
  if (!paths.length) throw new Error('The zip is empty.');
  if (!paths.includes('index.html')) {
    const tops = new Set(paths.map((p) => p.split('/')[0]));
    const [top] = [...tops];
    if (tops.size === 1 && paths.every((p) => p.includes('/')) && paths.includes(`${top}/index.html`)) {
      paths = paths.map((p) => p.slice(top.length + 1));
      for (const p of paths) entries[p] = entries[`${top}/${p}`];
    }
  }
  if (!paths.includes('index.html')) throw new Error('The build needs an index.html at its top level.');
  if (paths.length > MAX_BUILD_FILES) throw new Error(`A build can have at most ${MAX_BUILD_FILES} files.`);
  const bad = paths.filter((p) => !cleanBuildPath(p));
  if (bad.length) {
    throw new Error(
      `These files can't be in a web build: ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? ` and ${bad.length - 8} more` : ''}.`
    );
  }
  const files = paths.map((p) => ({ path: p, data: entries[p], contentType: BUILD_TYPES[extOf(p)] }));
  const size = files.reduce((s, f) => s + f.data.length, 0);
  if (size > MAX_BUILD_BYTES) throw new Error(`A build can be at most ${Math.round(MAX_BUILD_BYTES / 1048576)} MB.`);
  return { files, size };
}

export function checkImage(file) {
  const type = IMAGE_TYPES[extOf(file.name)];
  if (!type) throw new Error('Images must be PNG, JPG, WebP or GIF.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Images can be at most 5 MB.');
  return type;
}

// Uploads one file to `pathname`; returns its public URL.
export async function uploadFile(storage, pathname, data, contentType) {
  const body = data instanceof Blob ? data : new Blob([data], { type: contentType });
  if (storage === 'blob' || storage === 'blob-presigned') {
    const { upload, uploadPresigned } = await import('@vercel/blob/client');
    const out = await (storage === 'blob' ? upload : uploadPresigned)(pathname, body, {
      access: 'public',
      handleUploadUrl: '/api/store/upload',
      contentType,
      multipart: body.size > 20 * 1024 * 1024,
    });
    return out.url;
  }
  if (storage === 'local') {
    const res = await fetch(`/api/store/upload-local?path=${encodeURIComponent(pathname)}`, { method: 'PUT', body });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Upload failed.');
    return out.url;
  }
  throw new Error('Uploads are not switched on yet.');
}

// Runs fn over items, `limit` at a time, reporting how many are done.
export async function eachLimit(items, limit, fn, onProgress) {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
      done++;
      onProgress?.(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export const randomName = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
