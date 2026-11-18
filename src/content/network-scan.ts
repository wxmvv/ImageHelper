import { isImageUrl } from '../core/url.ts';
import type { RawImage } from './types.ts';

const INITIATORS = new Set(['img', 'css', 'link', 'video', 'audio', 'fetch', 'xmlhttprequest', 'other']);
type ResourceEntry = Pick<
  PerformanceResourceTiming,
  'name' | 'initiatorType' | 'encodedBodySize' | 'decodedBodySize' | 'transferSize'
> & { contentType?: string };

export function collectResourceEntries(
  entries: readonly PerformanceEntry[] | readonly ResourceEntry[] = performance.getEntriesByType('resource'),
): RawImage[] {
  return entries.flatMap((entry) => {
    const resource = entry as ResourceEntry;
    if (
      !INITIATORS.has(resource.initiatorType) ||
      (!isImageUrl(resource.name) && !resource.contentType?.includes('image'))
    )
      return [];
    return [
      {
        url: resource.name,
        source: 'network' as const,
        bytes: resource.encodedBodySize || resource.decodedBodySize || resource.transferSize,
        mime: resource.contentType,
      },
    ];
  });
}

export function observeResourceEntries(onNew: (images: RawImage[]) => void): void {
  try {
    const observer = new PerformanceObserver((list) => onNew(collectResourceEntries(list.getEntries())));
    observer.observe({ type: 'resource', buffered: true });
  } catch {
    onNew(collectResourceEntries());
  }
}
