import type { ImageRecord, Settings } from '../../core/types.ts';
import { t } from '../../platform/i18n.ts';
import { delegate, h, on } from '../../ui/dom.ts';
import { icon } from '../../ui/icons.ts';
import { button, copyLinks, openImage } from './actions.ts';
import { createCard } from './card.ts';
import { clearSelection, selectRange, toggle } from './selection.ts';
import { store } from './state.ts';
import { createThumbnails } from './thumbnails.ts';
export function bindGrid(
  root: HTMLElement,
  loaded: HTMLElement,
  settings: Settings,
  preview: (id: string) => void,
  download: (images: ImageRecord[]) => void,
  reset: () => void,
  rescan: () => void,
): () => void {
  const cards = new Map<string, { record: ImageRecord; el: HTMLElement }>();
  const thumbnails = createThumbnails((done, total) => {
    loaded.hidden = done >= total;
    loaded.textContent = t('extLoaded', { done, total });
  });
  let previous: ImageRecord[] = [];
  let previousFilter = store.get().filter;
  let anchor = '';
  let frame = 0;
  let menu: HTMLElement | undefined;
  const dismiss = (): void => {
    menu?.remove();
    menu = undefined;
  };
  const action = (name: string, image: ImageRecord): void => {
    if (name === 'preview') preview(image.id);
    if (name === 'download') download([image]);
    if (name === 'copy') void copyLinks(image.url);
    if (name === 'open') openImage(image.url);
    if (name === 'remove') {
      const selected = new Set(store.get().selected);
      selected.delete(image.id);
      store.patch({ images: store.get().images.filter((i) => i.id !== image.id), selected });
    }
    if (name === 'group') {
      const expanded = new Set(store.get().expanded);
      if (expanded.has(image.id)) expanded.delete(image.id);
      else expanded.add(image.id);
      store.patch({ expanded });
    }
  };
  const render = (): void => {
    const state = store.get();
    const { visible, groups } = store.derived();
    if (visible !== previous) {
      cancelAnimationFrame(frame);
      const appendOnly =
        previousFilter === state.filter && previous.length > 0 && previous.every((i, n) => i === visible[n]);
      if (!appendOnly) {
        root.replaceChildren();
        thumbnails.reset();
      }
      if (previousFilter !== state.filter) window.scrollTo(0, 0);
      previousFilter = state.filter;
      let cursor = appendOnly ? previous.length : 0;
      previous = visible;
      const ids = new Set(state.images.map((i) => i.id));
      for (const id of cards.keys()) if (!ids.has(id)) cards.delete(id);
      root.classList.toggle('is-rendering', visible.length > cursor + 60);
      if (!visible.length) {
        root.append(
          h(
            'div',
            { class: 'ih-empty' },
            icon('image', 32),
            h('h2', {
              class: 'ih-empty__title',
              text: t(state.images.length ? 'extNoMatch' : 'extEmptyTitle'),
            }),
            !state.images.length ? h('p', { class: 'ih-empty__desc', text: t('extEmptyDesc') }) : null,
            button(
              state.images.length ? 'extResetFilters' : 'extRescan',
              state.images.length ? 'reset' : 'rescan',
            ),
          ),
        );
      }
      const chunk = (): void => {
        const batch = document.createDocumentFragment();
        const end = Math.min(cursor + 60, visible.length);
        for (; cursor < end; cursor++) {
          const image = visible[cursor];
          if (!image) continue;
          let entry = cards.get(image.id);
          if (!entry || entry.record !== image) {
            entry = { record: image, el: createCard(image) };
            cards.set(image.id, entry);
          }
          batch.append(entry.el);
          thumbnails.observe(entry.el.querySelector<HTMLImageElement>('img')!);
          const group = entry.el.querySelector<HTMLButtonElement>('.ih-card__group')!;
          group.hidden = !groups.has(image.id);
          group.textContent = t(state.expanded.has(image.id) ? 'extCollapseGroup' : 'extExpandGroup', {
            count: groups.get(image.id)?.length ?? 0,
          });
        }
        root.append(batch);
        syncSelection();
        if (cursor < visible.length) frame = requestAnimationFrame(chunk);
        else root.classList.remove('is-rendering');
      };
      chunk();
    }
    syncSelection();
  };
  const syncSelection = (): void => {
    const selected = store.get().selected;
    for (const [id, { el }] of cards) {
      const checked = selected.has(id);
      el.classList.toggle('is-selected', checked);
      el.querySelector<HTMLInputElement>('input')!.checked = checked;
      el.setAttribute('aria-selected', String(checked));
    }
  };
  const off = [
    store.subscribe(render),
    delegate(root, '[data-action]', 'click', (e, el) => {
      e.stopPropagation();
      const name = el.dataset.action ?? '';
      if (name === 'reset') reset();
      if (name === 'rescan') rescan();
      const image = store.get().images.find((i) => i.id === el.closest<HTMLElement>('.ih-card')?.dataset.id);
      if (image) action(name, image);
    }),
    delegate(root, '.ih-card', 'click', (e, el) => {
      if ((e.target as Element).closest('[data-action]')) return;
      const id = el.dataset.id ?? '';
      const mouse = e as MouseEvent;
      if (mouse.shiftKey) selectRange(anchor, id, store.derived().visible);
      else if (
        mouse.ctrlKey ||
        mouse.metaKey ||
        (e.target as Element).matches('input') ||
        settings.clickAction === 'select'
      )
        toggle(id);
      else preview(id);
      anchor = id;
    }),
    delegate(root, '.ih-card', 'dblclick', (_e, el) => {
      const image = store.get().images.find((i) => i.id === el.dataset.id);
      if (image) openImage(image.url);
    }),
    delegate(root, '.ih-card', 'contextmenu', (e, el) => {
      e.preventDefault();
      dismiss();
      const image = store.get().images.find((i) => i.id === el.dataset.id);
      if (!image) return;
      menu = h(
        'div',
        {
          class: 'ih-context-menu',
          attr: { role: 'menu' },
          style: {
            left: Math.min((e as MouseEvent).clientX, innerWidth - 220) + 'px',
            top: Math.min((e as MouseEvent).clientY, innerHeight - 180) + 'px',
          },
        },
        button('extDownloadOne', 'download'),
        button('extCopyLink', 'copy'),
        button('extOpenTab', 'open'),
        button('extRemove', 'remove'),
      );
      menu.addEventListener(
        'click',
        (event) => {
          const target = (event.target as Element).closest<HTMLElement>('[data-action]');
          if (target) action(target.dataset.action ?? '', image);
          dismiss();
        },
        { once: true },
      );
      document.body.append(menu);
      menu.querySelector('button')?.focus();
    }),
    on(document, 'click', (e) => {
      if (menu && !menu.contains(e.target as Node)) dismiss();
    }),
    on(document, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') dismiss();
    }),
  ];
  clearSelection();
  render();
  return () => {
    off.forEach((fn) => fn());
    cancelAnimationFrame(frame);
    thumbnails.dispose();
    dismiss();
  };
}
