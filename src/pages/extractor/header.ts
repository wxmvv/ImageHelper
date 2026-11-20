import { formatBytes } from '../../core/format.ts';
import type { ImageRecord } from '../../core/types.ts';
import { t } from '../../platform/i18n.ts';
import { delegate, h } from '../../ui/dom.ts';
import { icon } from '../../ui/icons.ts';
import { button, copyLinks, iconButton } from './actions.ts';
import { clearSelection, invertSelection, removeSelected, selectAll, selectedRecords } from './selection.ts';
import { store } from './state.ts';
export function bindHeader(
  root: HTMLElement,
  filters: HTMLElement,
  selection: HTMLElement,
  download: (images: ImageRecord[]) => void,
  command: (type: string) => void,
) {
  const title = h('h1');
  const url = h('a', {
    class: 'ih-header__url',
    attr: { href: '#', title: t('extCopyLink') },
    data: { action: 'copy-page' },
  });
  const stats = h('div', { class: 'ih-header__stats', attr: { 'aria-live': 'polite' } });
  const scanning = h('div', { class: 'ih-header__scanning' });
  const rescan = button('extRescan', 'rescan', 'refresh');
  const scroll = button('extAutoScroll', 'scroll', 'scroll');
  const scrollText = scroll.querySelector<HTMLElement>('.ih-button__text')!;
  const filterToggle = button('extFilters', 'filters', 'filter');
  filterToggle.classList.add('ih-header__filter-toggle');
  filterToggle.setAttribute('aria-controls', filters.id);
  filterToggle.setAttribute('aria-expanded', 'false');
  const showFilters = (visible: boolean): void => {
    filters.classList.toggle('is-open', visible);
    filterToggle.setAttribute('aria-expanded', String(visible));
  };
  const selected = button('extDownloadSelected', 'download', 'download', true);
  const arrow = iconButton('extDownloadMenu', 'menu', 'chevron-down');
  arrow.setAttribute('aria-expanded', 'false');
  const items = h(
    'div',
    { class: 'ih-download-menu__items', attr: { hidden: true } },
    button('extDownloadAll', 'all'),
    button('extDownloadFiltered', 'filtered'),
  );
  const menu = h('div', { class: 'ih-download-menu' }, arrow, items);
  const closeMenu = () => {
    items.hidden = true;
    arrow.setAttribute('aria-expanded', 'false');
  };
  root.replaceChildren(
    h('div', { class: 'ih-header__brand' }, icon('logo', 20), h('span', { text: t('extBrand') })),
    h('div', { class: 'ih-header__page' }, h('div', {}, title, url)),
    h('div', { class: 'ih-header__status' }, stats, scanning),
    h(
      'div',
      { class: 'ih-header__actions' },
      rescan,
      scroll,
      filterToggle,
      h('div', { class: 'ih-download-segment' }, selected, menu),
      iconButton('optTitle', 'options', 'settings'),
    ),
  );
  const selectedText = h('span', { class: 'ih-selectionbar__count' });
  selection.replaceChildren(
    selectedText,
    button('extSelectAll', 'select-all', 'check'),
    button('extInvert', 'invert', 'invert'),
    button('extClear', 'clear', 'close'),
    button('extDownloadOne', 'download', 'download', true),
    button('extCopyLinks', 'copy', 'copy'),
    button('extRemove', 'remove', 'trash'),
  );
  const render = (): void => {
    const s = store.get();
    const d = store.derived();
    title.textContent = s.page.title || t('extTitle');
    title.title = title.textContent;
    url.textContent = s.page.url;
    stats.textContent = t('extSummary', {
      count: s.images.length,
      selected: s.selected.size,
      size: formatBytes(d.totalBytes),
    });
    scanning.textContent = s.scanning ? t('extScanning', { frames: s.page.frames.length }) : '';
    rescan.disabled = s.scanning || s.autoScrolling;
    scroll.disabled = s.scanning;
    const scrollLabel = t(s.autoScrolling ? 'extStopScroll' : 'extAutoScroll');
    scrollText.textContent = scrollLabel;
    scroll.setAttribute('aria-label', scrollLabel);
    scroll.title = scrollLabel;
    selected.disabled = !s.selected.size || s.scanning || s.autoScrolling;
    arrow.disabled = s.scanning || s.autoScrolling || !s.images.length;
    if (arrow.disabled) closeMenu();
    selected.title = t(s.selected.size ? 'extDownloadSelected' : 'extSelectFirst');
    selection.hidden = !s.selected.size;
    selection.dataset.count = String(s.selected.size);
    selectedText.textContent = t('extSelectionSummary', {
      count: s.selected.size,
      size: formatBytes(d.selectedBytes),
    });
    items.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.disabled = arrow.disabled || (b.dataset.action === 'filtered' && !d.visible.length);
    });
  };
  const handler = (e: Event, el: HTMLElement): void => {
    e.preventDefault();
    if (el.dataset.action === 'menu') {
      items.hidden = !items.hidden;
      arrow.setAttribute('aria-expanded', String(!items.hidden));
      return;
    }
    const s = store.get();
    const visible = store.derived().visible;
    const images = selectedRecords(s.images, s.selected);
    const action = el.dataset.action;
    if (action === 'rescan') command('extract:rescan');
    if (action === 'scroll') command(s.autoScrolling ? 'page:stopscroll' : 'page:autoscroll');
    if (action === 'options') command('options');
    if (action === 'filters') showFilters(!filters.classList.contains('is-open'));
    if (action === 'copy-page') void copyLinks(s.page.url);
    if (action === 'download') download(images);
    if (action === 'all') download(s.images);
    if (action === 'filtered') download(visible);
    if (action === 'select-all') selectAll(visible);
    if (action === 'invert') invertSelection(visible);
    if (action === 'clear') clearSelection();
    if (action === 'remove') removeSelected();
    if (action === 'copy') void copyLinks(images.map((i) => i.url).join('\n'));
    closeMenu();
  };
  const off = [
    delegate(root, '[data-action]', 'click', handler),
    delegate(selection, '[data-action]', 'click', handler),
    store.subscribe(render),
  ];
  render();
  return {
    showFilters,
    dispose: () => off.forEach((fn) => fn()),
  };
}
