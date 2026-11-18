import type { FilterState, ImageRecord } from './types.ts';

function matcher(value: string, regex: boolean): (url: string) => boolean {
  if (regex) {
    try {
      const pattern = new RegExp(value, 'i');
      return (url) => pattern.test(url);
    } catch {
      /* Invalid expressions still work as literal searches. */
    }
  }
  const keyword = value.toLowerCase();
  return (url) => url.toLowerCase().includes(keyword);
}

function completeness(image: ImageRecord): number {
  return Object.values(image).filter((value) => value !== undefined && value !== '').length;
}

export function applyFilters(images: ImageRecord[], f: FilterState): ImageRecord[] {
  const include = matcher(f.include, f.useRegex);
  const exclude = matcher(f.exclude, f.useRegex);
  const formats = new Set(f.formats);
  const result: ImageRecord[] = [];
  const urls = new Map<string, number>();
  for (const image of images) {
    if (
      (formats.size && !formats.has(image.ext)) ||
      (image.width ?? 0) < f.minWidth ||
      (image.height ?? 0) < f.minHeight ||
      (image.bytes ?? 0) < f.minBytes ||
      (f.hideHidden && image.hidden) ||
      (f.include && !include(image.url)) ||
      (f.exclude && exclude(image.url))
    )
      continue;
    const previous = urls.get(image.url);
    if (f.dedupe === 'url' && previous !== undefined) {
      const old = result[previous];
      if (old && completeness(image) > completeness(old)) result[previous] = image;
    } else {
      urls.set(image.url, result.length);
      result.push(image);
    }
  }
  if (f.sort !== 'order') {
    const score = (image: ImageRecord): number => {
      if (f.sort === 'width-desc') return -(image.width ?? 0);
      if (f.sort === 'height-desc') return -(image.height ?? 0);
      return (image.bytes ?? 0) * (f.sort === 'size-asc' ? 1 : -1);
    };
    result.sort((a, b) => score(a) - score(b));
  }
  return result;
}

export function countByFormat(images: ImageRecord[]): Array<{ ext: string; count: number }> {
  const counts = new Map<string, number>();
  for (const { ext } of images) counts.set(ext, (counts.get(ext) ?? 0) + 1);
  return Array.from(counts, ([ext, count]) => ({ ext, count })).sort((a, b) => b.count - a.count);
}

export function isDefaultFilter(f: FilterState): boolean {
  return (
    !f.formats.length &&
    f.minWidth === 0 &&
    f.minHeight === 0 &&
    f.minBytes === 0 &&
    !f.include &&
    !f.exclude &&
    !f.useRegex &&
    f.sort === 'order' &&
    f.dedupe === 'url' &&
    f.similarThreshold === 6 &&
    !f.hideHidden
  );
}

function distance(a: bigint, b: bigint): number {
  let bits = a ^ b;
  let count = 0;
  while (bits) {
    bits &= bits - 1n;
    count++;
  }
  return count;
}

export function similarGroups(
  images: ImageRecord[],
  hashes: Map<string, string>,
  threshold: number,
): ImageRecord[][] {
  const parents = images.map((_, index) => index);
  const root = (index: number): number => {
    while (parents[index] !== index) {
      const parent = parents[index];
      if (parent === undefined) break;
      index = parent;
    }
    return index;
  };
  const values = images.map((image) => {
    const hash = hashes.get(image.id);
    return hash && /^[a-f0-9]{16}$/i.test(hash) ? BigInt(`0x${hash}`) : null;
  });
  for (let i = 0; i < images.length; i++) {
    const a = values[i];
    if (a == null) continue;
    for (let j = 0; j < i; j++) {
      const b = values[j];
      if (b != null && distance(a, b) <= threshold) parents[root(i)] = root(j);
    }
  }
  const groups = new Map<number, ImageRecord[]>();
  images.forEach((image, index) => {
    const key = root(index);
    const group = groups.get(key) ?? [];
    group.push(image);
    groups.set(key, group);
  });
  return Array.from(groups.values(), (group) =>
    group.sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)),
  ).sort((a, b) => (a[0]?.discoveredAt ?? 0) - (b[0]?.discoveredAt ?? 0));
}

export function defaultFilter(minWidth = 0, minHeight = 0, minBytes = 0): FilterState {
  return {
    formats: [],
    minWidth,
    minHeight,
    minBytes,
    include: '',
    exclude: '',
    useRegex: false,
    sort: 'order',
    dedupe: 'url',
    similarThreshold: 6,
    hideHidden: false,
  };
}
export function normalizeFilter(raw: unknown, defaults = defaultFilter()): FilterState {
  const result = { ...defaults };
  if (!raw || typeof raw !== 'object') return result;
  const input = raw as Record<string, unknown>;
  if (Array.isArray(input.formats))
    result.formats = input.formats.filter((v): v is string => typeof v === 'string');
  for (const key of ['minWidth', 'minHeight', 'minBytes', 'similarThreshold'] as const) {
    const v = input[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0)
      result[key] = Math.min(
        key === 'similarThreshold' ? 16 : key === 'minBytes' ? 104857600 : 100000,
        Math.floor(v),
      );
  }
  for (const key of ['include', 'exclude'] as const)
    if (typeof input[key] === 'string') result[key] = input[key];
  for (const key of ['useRegex', 'hideHidden'] as const)
    if (typeof input[key] === 'boolean') result[key] = input[key];
  if (input.dedupe === 'url' || input.dedupe === 'similar' || input.dedupe === 'off')
    result.dedupe = input.dedupe;
  if (
    input.sort === 'order' ||
    input.sort === 'size-desc' ||
    input.sort === 'size-asc' ||
    input.sort === 'width-desc' ||
    input.sort === 'height-desc'
  )
    result.sort = input.sort;
  return result;
}
