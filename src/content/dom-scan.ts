import { largestCandidate, parseSrcset } from '../core/srcset.ts';
import { isImageUrl } from '../core/url.ts';
import { isCssHidden } from './css-scan.ts';
import { scanLazyAttrs } from './lazy-scan.ts';
import type { RawImage, ScanSettings } from './types.ts';
export { LAZY_ATTRIBUTES } from './lazy-scan.ts';

/** Shadow roots are separate trees; components (YouTube, Reddit, …) keep images inside them. */
const MAX_ROOTS = 64;
const MAX_SRCSET_CANDIDATES = 24;

function collectRoots(): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [document];
  for (let index = 0; index < roots.length && roots.length < MAX_ROOTS; index++) {
    const current = roots[index];
    if (!current) continue;
    for (const el of current.querySelectorAll('*')) {
      const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (shadow && roots.length < MAX_ROOTS) roots.push(shadow);
    }
  }
  return roots;
}

function geometry(el: Element): Partial<RawImage> {
  const rect = el.getBoundingClientRect();
  const visible = el.checkVisibility?.({ checkOpacity: false, checkVisibilityCSS: true }) ?? !isCssHidden(el);
  return {
    renderedWidth: rect.width,
    renderedHeight: rect.height,
    hidden: rect.width === 0 || rect.height === 0 || visible === false,
    inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
  };
}

export function scanDom(_settings: ScanSettings): RawImage[] {
  const images: RawImage[] = [];
  let srcsetCandidates = 0;
  const add = (
    url: string | null,
    source: RawImage['source'],
    el: Element,
    extra: Partial<RawImage> = {},
  ): void => {
    if (url) images.push({ url, source, ...geometry(el), ...extra });
  };

  for (const root of collectRoots()) {
    for (const img of root.querySelectorAll('img')) {
      const extra = {
        width: img.naturalWidth || undefined,
        height: img.naturalHeight || undefined,
        alt: img.alt,
      };
      // An absent src resolves to the page URL in some engines.
      add(img.currentSrc || img.getAttribute('src'), 'img', img, extra);
      for (const candidate of parseSrcset(img.getAttribute('srcset') ?? '')) {
        if (srcsetCandidates >= MAX_SRCSET_CANDIDATES) break;
        add(candidate.url, 'srcset', img);
        srcsetCandidates++;
      }
    }
    for (const el of root.querySelectorAll('picture > source[srcset]'))
      add(largestCandidate(el.getAttribute('srcset') ?? ''), 'picture', el);
    for (const el of root.querySelectorAll('svg image'))
      add(el.getAttribute('href') || el.getAttribute('xlink:href'), 'svg-image', el);
    for (const [selector, attr, source] of [
      ['video[poster]', 'poster', 'video-poster'],
      ['input[type="image"][src]', 'src', 'input-image'],
      ['link[rel~="icon"]', 'href', 'favicon'],
      ['meta[property="og:image"],meta[name="twitter:image"],meta[itemprop="image"]', 'content', 'meta'],
    ] as const)
      for (const el of root.querySelectorAll(selector)) add(el.getAttribute(attr), source, el);
    for (const el of root.querySelectorAll('a[href]')) {
      const url = el.getAttribute('href');
      if (url && isImageUrl(url)) add(url, 'link', el);
    }
    for (const el of root.querySelectorAll('[style]')) {
      for (const match of (el.getAttribute('style') ?? '').matchAll(/url\(\s*['"]?([^'")]+)/gi))
        add(match[1]?.trim() ?? null, 'inline-style', el);
    }
    images.push(...scanLazyAttrs(root));
  }
  return images;
}
