import { formatBytes, formatDimensions } from '../../core/format.ts';
import type { ImageRecord } from '../../core/types.ts';
import { t } from '../../platform/i18n.ts';
import { delegate, h, on } from '../../ui/dom.ts';
import { copyLinks, iconButton, openImage } from './actions.ts';
import { store } from './state.ts';
export function createLightbox(root: HTMLElement, download: (images: ImageRecord[]) => void) {
  const img = h('img', {
    class: 'ih-lightbox__image',
    attr: { draggable: false, alt: '', referrerpolicy: 'no-referrer' },
  });
  const counter = h('span', { class: 'ih-lightbox__counter' });
  const info = h('span', { class: 'ih-lightbox__info' });
  const url = h('span', { class: 'ih-lightbox__url' });
  const prev = iconButton('extPrevious', 'prev', 'chevron-down');
  const next = iconButton('extNext', 'next', 'chevron-down');
  prev.classList.add('ih-lightbox__prev');
  next.classList.add('ih-lightbox__next');
  const closeButton = iconButton('extClose', 'close', 'close');
  closeButton.classList.add('ih-lightbox__close');
  const bar = h(
    'div',
    { class: 'ih-lightbox__bar' },
    info,
    url,
    h(
      'div',
      { class: 'ih-lightbox__actions' },
      iconButton('extDownloadOne', 'download', 'download'),
      iconButton('extCopyLink', 'copy', 'copy'),
      iconButton('extOpenTab', 'open', 'external'),
    ),
  );
  root.setAttribute('aria-label', t('extPreview'));
  root.setAttribute('tabindex', '-1');
  root.replaceChildren(img, prev, next, counter, closeButton, bar);
  let id = '';
  let scale = 1;
  let x = 0;
  let y = 0;
  let drag: { x: number; y: number; px: number; py: number } | undefined;
  let focus: HTMLElement | null = null;
  const current = (): ImageRecord | undefined => store.derived().visible.find((i) => i.id === id);
  const transform = (): void => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };
  const render = (): void => {
    const record = current();
    if (!record) {
      close();
      return;
    }
    img.src = record.url;
    img.alt = record.alt ?? '';
    const images = store.derived().visible;
    const index = images.findIndex((i) => i.id === id);
    counter.textContent = `${index + 1}/${images.length}`;
    prev.disabled = index === 0;
    next.disabled = index === images.length - 1;
    info.textContent = `${counter.textContent} · ${formatDimensions(record.width, record.height)} · ${formatBytes(record.bytes)} · ${record.ext}`;
    url.textContent = record.url.length > 44 ? record.url.slice(0, 43) + '…' : record.url;
    url.title = record.url;
    scale = 1;
    x = y = 0;
    transform();
  };
  const close = (): void => {
    root.hidden = true;
    document.body.classList.remove('is-locked');
    img.removeAttribute('src');
    drag = undefined;
    focus?.focus();
  };
  const step = (delta: number): void => {
    const images = store.derived().visible;
    const index = images.findIndex((i) => i.id === id);
    id = images[Math.max(0, Math.min(images.length - 1, index + delta))]?.id ?? '';
    render();
  };
  const off = [
    delegate(root, '[data-action]', 'click', (_e, el) => {
      const action = el.dataset.action;
      if (action === 'close') close();
      if (action === 'prev') step(-1);
      if (action === 'next') step(1);
      const record = current();
      if (!record) return;
      if (action === 'download') download([record]);
      if (action === 'copy') void copyLinks(record.url);
      if (action === 'open') openImage(record.url);
    }),
    on(root, 'click', (e) => {
      if (e.target === root) close();
    }),
    on(
      root,
      'wheel',
      (e) => {
        e.preventDefault();
        const event = e as WheelEvent;
        const nextScale = Math.max(0.2, Math.min(8, scale * Math.exp(-event.deltaY * 0.002)));
        const px = event.clientX - innerWidth / 2;
        const py = event.clientY - innerHeight / 2;
        x = px - ((px - x) * nextScale) / scale;
        y = py - ((py - y) * nextScale) / scale;
        scale = nextScale;
        transform();
      },
      { passive: false },
    ),
    on(img, 'dblclick', () => {
      scale = scale === 1 ? 2 : 1;
      x = y = 0;
      transform();
    }),
    on(img, 'pointerdown', (e) => {
      const event = e as PointerEvent;
      drag = { x, y, px: event.clientX, py: event.clientY };
      img.setPointerCapture(event.pointerId);
    }),
    on(img, 'pointermove', (e) => {
      if (drag) {
        x = drag.x + (e as PointerEvent).clientX - drag.px;
        y = drag.y + (e as PointerEvent).clientY - drag.py;
        transform();
      }
    }),
    on(img, 'pointerup', () => {
      drag = undefined;
    }),
    on(img, 'pointercancel', () => {
      drag = undefined;
    }),
    on(document, 'keydown', (e) => {
      if (root.hidden) return;
      const event = e as KeyboardEvent;
      if (['ArrowLeft', 'ArrowRight', 'Escape', 'Tab'].includes(event.key)) event.preventDefault();
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const controls = [...root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = controls.indexOf(document.activeElement as HTMLButtonElement);
        controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
      }
    }),
    store.subscribe(() => {
      if (!root.hidden && !current()) close();
    }),
  ];
  return {
    open(imageId: string): void {
      id = imageId;
      focus = document.activeElement as HTMLElement;
      root.hidden = false;
      document.body.classList.add('is-locked');
      render();
      root.focus();
    },
    close,
    isOpen: (): boolean => !root.hidden,
    dispose(): void {
      close();
      off.forEach((fn) => fn());
    },
  };
}
