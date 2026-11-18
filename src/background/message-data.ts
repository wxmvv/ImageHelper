import type { DownloadItem, ImageRecord } from '../core/types.ts';

export function objectPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid message payload');
  return value as Record<string, unknown>;
}

export function tabIdFromPayload(value: unknown): number {
  const { tabId } = objectPayload(value);
  if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId) || tabId < 0)
    throw new Error('Invalid tab ID');
  return tabId;
}

export function downloadItems(value: unknown): DownloadItem[] {
  if (!Array.isArray(value)) throw new Error('Invalid download items');
  return value.map((entry: unknown) => {
    const item = objectPayload(entry);
    if (typeof item.url !== 'string' || typeof item.fileName !== 'string')
      throw new Error('Invalid download item');
    return {
      url: item.url,
      fileName: item.fileName,
      referer: typeof item.referer === 'string' ? item.referer : undefined,
    };
  });
}

const SOURCES = new Set([
  'img',
  'srcset',
  'picture',
  'css-bg',
  'cssom',
  'inline-style',
  'lazy-attr',
  'svg-image',
  'video-poster',
  'input-image',
  'favicon',
  'meta',
  'link',
  'network',
  'page-hook',
]);
export function imageRecords(value: unknown): ImageRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry: unknown): entry is ImageRecord => {
    if (!entry || typeof entry !== 'object') return false;
    const item = entry as Record<string, unknown>;
    return (
      typeof item.id === 'string' &&
      typeof item.url === 'string' &&
      typeof item.ext === 'string' &&
      typeof item.source === 'string' &&
      SOURCES.has(item.source) &&
      typeof item.discoveredAt === 'number' &&
      Number.isFinite(item.discoveredAt) &&
      ['width', 'height', 'renderedWidth', 'renderedHeight', 'bytes'].every(
        (key) =>
          item[key] === undefined ||
          (typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0),
      ) &&
      ['mime', 'alt', 'frameUrl'].every((key) => item[key] === undefined || typeof item[key] === 'string') &&
      ['inViewport', 'hidden'].every((key) => item[key] === undefined || typeof item[key] === 'boolean')
    );
  });
}
