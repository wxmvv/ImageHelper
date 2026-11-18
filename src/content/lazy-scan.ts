import { parseSrcset } from '../core/srcset.ts';
import type { RawImage } from './types.ts';

export const LAZY_ATTRIBUTES: readonly string[] = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-lazy',
  'data-url',
  'data-image',
  'data-bg',
  'data-background',
  'data-thumb',
  'data-echo',
  'data-srcset',
  'data-original-src',
  'data-actualsrc',
];

export function normalizeLazyValue(value: string): string[] {
  const text = value.trim();
  if (!text || ['about:blank', '#', '{}', 'undefined', 'null'].includes(text)) return [];
  if (text.startsWith('[')) {
    try {
      const values: unknown = JSON.parse(text);
      return Array.isArray(values)
        ? values.flatMap((item: unknown) => (typeof item === 'string' ? normalizeLazyValue(item) : []))
        : [];
    } catch {
      return [];
    }
  }
  const urls = [...text.matchAll(/url\(\s*['"]?([^'")]+?)\s*['"]?\)/gi)];
  if (urls.length) return urls.flatMap((match) => normalizeLazyValue(match[1] ?? ''));
  return parseSrcset(text)
    .map(({ url }) => url.replace(/^['"]|['"]$/g, ''))
    .filter((url) => !!url && !['about:blank', '#', '{}', 'undefined', 'null'].includes(url));
}

export function scanLazyAttrs(root: Document | ShadowRoot = document): RawImage[] {
  const images: RawImage[] = [];
  const selector = LAZY_ATTRIBUTES.map((attr) => `[${attr}]`).join(',');
  for (const el of root.querySelectorAll(selector)) {
    for (const attr of LAZY_ATTRIBUTES) {
      for (const url of normalizeLazyValue(el.getAttribute(attr) ?? ''))
        images.push({ url, source: 'lazy-attr' });
    }
  }
  return images;
}
