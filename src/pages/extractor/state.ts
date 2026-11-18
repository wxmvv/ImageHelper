import { applyFilters, countByFormat, defaultFilter, similarGroups } from '../../core/filter.ts';
import type { FilterState, ImageRecord, PageInfo } from '../../core/types.ts';
export interface ExtractorState {
  tabId: number;
  page: PageInfo;
  images: ImageRecord[];
  rev: number;
  selected: Set<string>;
  filter: FilterState;
  scanning: boolean;
  autoScrolling: boolean;
  hash: Map<string, string>;
  hashing: { done: number; total: number } | null;
  expanded: Set<string>;
}
let state: ExtractorState = {
  tabId: -1,
  page: { tabId: -1, title: '', url: '', frames: [] },
  images: [],
  rev: -1,
  selected: new Set(),
  filter: defaultFilter(),
  scanning: false,
  autoScrolling: false,
  hash: new Map(),
  hashing: null,
  expanded: new Set(),
};
const listeners = new Set<(s: ExtractorState) => void>();
let queued = false;
let cache:
  | {
      images: ImageRecord[];
      filter: FilterState;
      hash: Map<string, string>;
      expanded: Set<string>;
      visible: ImageRecord[];
      groups: Map<string, ImageRecord[]>;
      counts: Array<{ ext: string; count: number }>;
      totalBytes: number;
    }
  | undefined;
export const store = {
  get: (): ExtractorState => state,
  patch(patch: Partial<ExtractorState>): void {
    state = { ...state, ...patch };
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      for (const fn of listeners) fn(state);
    });
  },
  subscribe(listener: (s: ExtractorState) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  derived() {
    const { images, filter, hash, expanded } = state;
    if (
      !cache ||
      cache.images !== images ||
      cache.filter !== filter ||
      cache.hash !== hash ||
      cache.expanded !== expanded
    ) {
      let visible = applyFilters(images, filter);
      const groups = new Map<string, ImageRecord[]>();
      if (filter.dedupe === 'similar') {
        const keep = new Set<string>();
        for (const group of similarGroups(visible, hash, filter.similarThreshold)) {
          const first = group[0];
          if (!first) continue;
          keep.add(first.id);
          if (group.length > 1) groups.set(first.id, group);
          if (expanded.has(first.id)) for (const image of group) keep.add(image.id);
        }
        visible = visible.filter((image) => keep.has(image.id));
      }
      cache = {
        images,
        filter,
        hash,
        expanded,
        visible,
        groups,
        counts: countByFormat(images),
        totalBytes: images.reduce((sum, i) => sum + (i.bytes ?? 0), 0),
      };
    }
    return {
      visible: cache.visible,
      groups: cache.groups,
      counts: cache.counts,
      totalBytes: cache.totalBytes,
      selectedBytes: state.images.reduce(
        (sum, i) => sum + (state.selected.has(i.id) ? (i.bytes ?? 0) : 0),
        0,
      ),
    };
  },
};
