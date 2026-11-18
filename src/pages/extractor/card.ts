import { formatBytes, formatDimensions } from '../../core/format.ts';
import type { ImageRecord } from '../../core/types.ts';
import { t } from '../../platform/i18n.ts';
import { h } from '../../ui/dom.ts';
import { iconButton } from './actions.ts';
export function createCard(image: ImageRecord): HTMLElement {
  const thumb = h('img', {
    class: 'ih-card__thumb',
    attr: { alt: image.alt ?? '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' },
    data: { src: image.url },
  });
  const card = h(
    'article',
    { class: 'ih-card', attr: { tabindex: 0, 'aria-label': image.alt || image.url }, data: { id: image.id } },
    thumb,
    h('input', { class: 'ih-card__check', attr: { type: 'checkbox', 'aria-label': t('extSelectImage') } }),
    h('span', { class: 'ih-card__format ih-badge', text: image.ext }),
    h(
      'div',
      { class: 'ih-card__meta' },
      image.width && image.height
        ? h('span', {
            class: 'ih-badge ih-card__dimensions',
            text: formatDimensions(image.width, image.height),
          })
        : null,
      image.bytes && image.bytes > 0
        ? h('span', { class: 'ih-badge ih-card__bytes', text: formatBytes(image.bytes) })
        : null,
    ),
    h(
      'div',
      { class: 'ih-card__actions' },
      iconButton('extDownloadOne', 'download', 'download'),
      iconButton('extCopyLink', 'copy', 'copy'),
      iconButton('extOpenTab', 'open', 'external'),
    ),
    h('button', { class: 'ih-card__group ih-chip', attr: { hidden: true }, data: { action: 'group' } }),
  );
  return card;
}
