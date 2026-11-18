import type { MultiRun } from '../../core/messages.ts';
import { t } from '../../platform/i18n.ts';
import { h } from '../../ui/dom.ts';
import { icon } from '../../ui/icons.ts';

export function renderRow(item: MultiRun['items'][number], index: number): HTMLElement {
  const statuses = {
    pending: 'multiPending',
    running: 'multiRunning',
    done: 'multiDone',
    failed: 'multiFailed',
  };
  return h(
    'tr',
    { data: { status: item.status } },
    h(
      'td',
      { class: 'ih-multi__url' },
      h('span', { text: item.url }),
      item.status === 'failed' && item.error
        ? h('small', {
            text: t(item.error) === item.error ? t('multiPageFailed') : t(item.error),
          })
        : null,
    ),
    h('td', {}, h('span', { class: 'ih-multi__status', text: t(statuses[item.status]) })),
    h('td', { class: 'ih-multi__count', text: String(item.images) }),
    h(
      'td',
      {},
      h(
        'button',
        {
          class: 'ih-button ih-button--ghost ih-button--icon',
          data: { action: 'open', index: String(index) },
          attr: {
            disabled: !/^https?:\/\//i.test(item.url),
            title: t('extOpenTab'),
            'aria-label': t('extOpenTab'),
          },
        },
        icon('external'),
      ),
    ),
  );
}
