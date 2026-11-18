import { h } from '../../ui/dom.ts';
export function createLayout(root: HTMLElement) {
  const header = h('header', { class: 'ih-header' });
  const filters = h('div', { class: 'ih-filters' });
  const grid = h('main', { class: 'ih-grid', attr: { id: 'grid' } });
  const loaded = h('div', { class: 'ih-loaded', attr: { role: 'status' } });
  const selection = h('footer', { class: 'ih-selectionbar', attr: { hidden: true } });
  const progress = h('div', { class: 'ih-progress', attr: { hidden: true, role: 'status' } });
  const lightbox = h('div', {
    class: 'ih-lightbox',
    attr: { hidden: true, role: 'dialog', 'aria-modal': 'true' },
  });
  root.replaceChildren(header, filters, grid, loaded, selection, progress, lightbox);
  return { header, filters, grid, loaded, selection, progress, lightbox };
}
