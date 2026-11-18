import { defaultFilter } from '../../core/filter.ts';
import type { FilterState } from '../../core/types.ts';
import { t } from '../../platform/i18n.ts';
import { writeExtractorFilter } from '../../platform/storage.ts';
import { debounce, delegate, h, on } from '../../ui/dom.ts';
import { store } from './state.ts';
export function updateFilter(patch: Partial<FilterState>): void {
  const filter = { ...store.get().filter, ...patch };
  if (JSON.stringify(filter) === JSON.stringify(store.get().filter)) return;
  store.patch({ filter });
  void writeExtractorFilter(filter);
}
export function resetFilters(): void {
  updateFilter(defaultFilter());
}
function chip(text: string, data: Record<string, string>): HTMLButtonElement {
  return h('button', { class: 'ih-chip', text, attr: { type: 'button', 'aria-pressed': false }, data });
}
function formatChip(label: string, count: number, format: string): HTMLButtonElement {
  const el = chip(label, { format });
  el.append(h('span', { class: 'ih-chip__count', text: String(count) }));
  return el;
}
function group(key: string, ...children: HTMLElement[]): HTMLElement {
  return h(
    'div',
    { class: 'ih-filter-group' },
    h('span', { class: 'ih-filter-label', text: t(key) }),
    ...children,
  );
}
export function bindFilters(root: HTMLElement) {
  const formats = group('extFormat');
  const sizes = [100, 300, 500, 1000].map((n) => chip('≥' + n, { size: String(n) }));
  const custom = chip(t('extCustom'), { custom: 'true' });
  const width = h('input', {
    class: 'ih-input',
    attr: { type: 'number', min: 0, placeholder: t('optMinWidth'), 'aria-label': t('optMinWidth') },
  });
  const height = h('input', {
    class: 'ih-input',
    attr: { type: 'number', min: 0, placeholder: t('optMinHeight'), 'aria-label': t('optMinHeight') },
  });
  const customFields = h('div', { class: 'ih-custom-size', attr: { hidden: true } }, width, height);
  const include = h('input', {
    class: 'ih-input',
    attr: { type: 'search', placeholder: t('extInclude'), 'aria-label': t('extInclude') },
  });
  const exclude = h('input', {
    class: 'ih-input',
    attr: { type: 'search', placeholder: t('extExclude'), 'aria-label': t('extExclude') },
  });
  const regex = chip(t('extRegex'), { regex: 'true' });
  regex.title = t('extRegexHint');
  const dedupes = (['url', 'similar', 'off'] as const).map((mode, i) =>
    chip(t(['extDedupeUrl', 'extDedupeSimilar', 'extDedupeOff'][i] ?? ''), { dedupe: mode }),
  );
  const threshold = h('input', {
    attr: { type: 'range', min: 0, max: 16, 'aria-label': t('extSimilarityThreshold') },
  });
  const hashing = h('span', { class: 'ih-hashing' });
  const similarity = h('div', { class: 'ih-similarity', attr: { hidden: true } }, threshold, hashing);
  const sort = h(
    'select',
    { class: 'ih-select', attr: { 'aria-label': t('extSort') } },
    ...(['size-desc', 'size-asc', 'width-desc', 'order'] as const).map((value, i) =>
      h('option', {
        attr: { value },
        text: t(['extSortSizeDesc', 'extSortSizeAsc', 'extSortWidthDesc', 'extSortOrder'][i] ?? ''),
      }),
    ),
  );
  root.replaceChildren(
    formats,
    group('extSize', ...sizes, custom, customFields),
    group('extKeyword', include, exclude, regex),
    group('extDedupe', ...dedupes, similarity),
    group('extSort', sort),
  );
  let oldImages = store.get().images;
  let initialized = false;
  const render = (): void => {
    const { filter, images } = store.get();
    if (!initialized || oldImages !== images) {
      initialized = true;
      oldImages = images;
      const counts = store.derived().counts;
      const order = ['png', 'jpg', 'webp', 'gif', 'svg', 'avif', 'ico', 'bmp'];
      counts.sort(
        (a, b) =>
          (order.indexOf(a.ext) < 0 ? 99 : order.indexOf(a.ext)) -
          (order.indexOf(b.ext) < 0 ? 99 : order.indexOf(b.ext)),
      );
      formats.replaceChildren(
        h('span', { class: 'ih-filter-label', text: t('extFormat') }),
        formatChip(t('extAll'), images.length, ''),
        ...counts.map(({ ext, count }) => formatChip(ext, count, ext)),
      );
    }
    for (const el of root.querySelectorAll<HTMLButtonElement>('.ih-chip')) {
      const active =
        el.dataset.format !== undefined
          ? (filter.formats[0] ?? '') === el.dataset.format
          : el.dataset.size
            ? filter.minWidth === Number(el.dataset.size) && filter.minHeight === Number(el.dataset.size)
            : el.dataset.regex
              ? filter.useRegex
              : el.dataset.dedupe
                ? filter.dedupe === el.dataset.dedupe
                : !customFields.hidden;
      el.classList.toggle('ih-chip--on', active);
      el.setAttribute('aria-pressed', String(active));
    }
    if (document.activeElement !== include) include.value = filter.include;
    if (document.activeElement !== exclude) exclude.value = filter.exclude;
    if (document.activeElement !== width) width.value = String(filter.minWidth);
    if (document.activeElement !== height) height.value = String(filter.minHeight);
    sort.value = filter.sort;
    threshold.value = String(filter.similarThreshold);
    similarity.hidden = filter.dedupe !== 'similar';
    const progress = store.get().hashing;
    hashing.textContent = progress ? `${progress.done}/${progress.total}` : String(filter.similarThreshold);
  };
  const keyword = (): void => updateFilter({ include: include.value, exclude: exclude.value });
  const delayed = debounce(keyword, 250);
  const dimensions = (): void =>
    updateFilter({
      minWidth: Math.max(0, Number(width.value) || 0),
      minHeight: Math.max(0, Number(height.value) || 0),
    });
  const off = [
    store.subscribe(render),
    delegate(root, '.ih-chip', 'click', (_e, el) => {
      const { format, size, regex: re, dedupe, custom: show } = el.dataset;
      if (format !== undefined)
        updateFilter({ formats: !format || store.get().filter.formats.includes(format) ? [] : [format] });
      if (size) updateFilter({ minWidth: Number(size), minHeight: Number(size) });
      if (re) updateFilter({ useRegex: !store.get().filter.useRegex });
      if (dedupe === 'url' || dedupe === 'similar' || dedupe === 'off') updateFilter({ dedupe });
      if (show) {
        customFields.hidden = !customFields.hidden;
        render();
        if (!customFields.hidden) width.focus();
      }
    }),
    on(include, 'input', delayed),
    on(exclude, 'input', delayed),
    on(include, 'change', () => {
      delayed.cancel();
      keyword();
    }),
    on(exclude, 'change', () => {
      delayed.cancel();
      keyword();
    }),
    on(sort, 'change', () => updateFilter({ sort: sort.value as FilterState['sort'] })),
    on(threshold, 'input', () => updateFilter({ similarThreshold: Number(threshold.value) })),
    on(customFields, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') dimensions();
    }),
    on(customFields, 'change', dimensions),
  ];
  render();
  return {
    search: include,
    dispose(): void {
      delayed.cancel();
      off.forEach((fn) => fn());
    },
  };
}
