const EXTENSIONS = new Set([
  'jpg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
  'bmp',
  'ico',
  'tif',
  'tiff',
  'heic',
  'heif',
  'apng',
  'jxl',
]);
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/apng': 'apng',
  'image/jxl': 'jxl',
};

function clean(raw: string): string {
  return raw
    .trim()
    .replace(/\\\//g, '/')
    .replace(/\\u002f/gi, '/')
    .replace(/\\x2f/gi, '/');
}

export function absolutize(raw: string, base: string): string | null {
  try {
    const value = clean(raw);
    return value ? new URL(value, base).href : null;
  } catch {
    return null;
  }
}

export function normalizeUrl(url: string): string {
  return clean(url).split('#')[0] ?? '';
}

export function isSupportedProtocol(url: string): boolean {
  return /^(https?|data|blob):/i.test(url.trim());
}

function extension(value: string): string {
  // Values like "jpeg?w=500" come from malformed query strings in page payloads.
  const ext =
    value
      .toLowerCase()
      .replace(/^\./, '')
      .split(/[^a-z0-9]/)[0] ?? '';
  if (ext === 'jpeg') return 'jpg';
  return EXTENSIONS.has(ext) ? ext : 'img';
}

export function extFromMime(mime: string): string {
  return MIME_EXTENSIONS[mime.split(';')[0]?.trim().toLowerCase() ?? ''] ?? 'img';
}

/** Query keys some CDNs use to declare the format (`?format=webp`, `&f=JPEG`, …). */
const FORMAT_KEYS = new Set(['format', 'fmt', 'fm', 'ext', 'type', 'f', 'output']);

function extensionFromPairs(pairs: Iterable<[string, string]>): string {
  for (const [key, value] of pairs) {
    if (!FORMAT_KEYS.has(key.trim().toLowerCase())) continue;
    const ext = value.includes('/') ? extFromMime(value) : extension(value);
    if (ext !== 'img') return ext;
  }
  return 'img';
}

/**
 * Some CDNs (`img0.baidu.com/it/u=…&f=JPEG`) put format hints in the *path*,
 * because they never emit a real query string.
 */
function pathPairs(pathname: string): Array<[string, string]> {
  return pathname
    .split('&')
    .map((part) => {
      const index = part.indexOf('=');
      if (index < 0) return null;
      const key = part.slice(0, index).split('/').pop() ?? '';
      return [key, part.slice(index + 1)] as [string, string];
    })
    .filter((pair): pair is [string, string] => pair !== null);
}

export function extFromUrl(url: string): string {
  const value = clean(url);
  if (/^data:/i.test(value)) return extFromMime(value.slice(5).split(/[;,]/)[0] ?? '');
  try {
    const parsed = new URL(value, 'https://image.invalid');
    const fromQuery = extensionFromPairs(parsed.searchParams);
    if (fromQuery !== 'img') return fromQuery;
    const fromPath = extensionFromPairs(pathPairs(parsed.pathname));
    if (fromPath !== 'img') return fromPath;
    const path = decodeURIComponent(parsed.pathname);
    return extension(path.match(/\.([a-z0-9]+)$/i)?.[1] ?? '');
  } catch {
    return 'img';
  }
}

/** Beacon/log endpoints that show up in JSON payloads but never serve pixels. */
const TRACKING_SEGMENTS =
  /\/(?:api|ajax|beacon|collect|metrics|analytics|pixel|report|track|tracking|log|logs|stats|ztbox)(?:\/|$|\.)/i;

export function isTrackingEndpoint(url: string): boolean {
  try {
    return TRACKING_SEGMENTS.test(new URL(url, 'https://image.invalid').pathname);
  } catch {
    return false;
  }
}

export function isImageUrl(url: string): boolean {
  if (/^data:image\//i.test(url.trim()) || extFromUrl(url) !== 'img') return true;
  try {
    return /\/(?:images?|img|photos?|pictures?)(?:\/|$)/i.test(
      new URL(clean(url), 'https://image.invalid').pathname,
    );
  } catch {
    return false;
  }
}

export function fileNameFromUrl(url: string): string {
  if (/^(data|blob):/i.test(url.trim())) return 'image';
  try {
    const last = new URL(clean(url), 'https://image.invalid').pathname.split('/').pop() ?? '';
    return decodeURIComponent(last) || 'image';
  } catch {
    return 'image';
  }
}
