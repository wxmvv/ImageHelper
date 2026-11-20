import { renderRow } from './results.ts';
import type { MultiRun } from '../../core/messages.ts';
import type { ImageRecord } from '../../core/types.ts';
import { DownloadEngine } from '../../downloads/engine.ts';
import { t } from '../../platform/i18n.ts';
import { isIOS } from '../../platform/ios.ts';
import { applyPageSettings, watchSettings } from '../../platform/page-settings.ts';
import { createPreparedDownload } from '../../platform/prepared-download.ts';
import { onRuntimeMessage, sendToBackground } from '../../platform/rpc.ts';
import { readSettings } from '../../platform/storage.ts';
import { delegate, h } from '../../ui/dom.ts';
import { icon } from '../../ui/icons.ts';
import { toast } from '../../ui/toast.ts';

async function bootstrap(): Promise<void> {
  let settings = await readSettings();
  let run: MultiRun | undefined;
  let runId = new URLSearchParams(location.search).get('runId') ?? '';
  let draft = '';
  let starting = false;
  let engine: DownloadEngine | undefined;
  const prepared = isIOS() ? createPreparedDownload() : undefined;
  let downloadText = '';
  let records: ImageRecord[] = [];
  let closed = false;
  const root = document.getElementById('app')!;
  const render = (): void => {
    draft = root.querySelector<HTMLTextAreaElement>('textarea')?.value ?? draft;
    applyPageSettings(settings);
    if (prepared) prepared.control.textContent = t('extSaveFile');
    document.title = t('multiTitle');
    const running = !!run && run.finishedAt === undefined;
    const total = run?.items.length ?? 0;
    const completed =
      run?.items.filter((item) => item.status === 'done' || item.status === 'failed').length ?? 0;
    root.replaceChildren(
      h(
        'main',
        { class: 'ih-multi' },
        h('header', { class: 'ih-multi__heading' }, icon('logo', 24), h('h1', { text: t('multiTitle') })),
        h('p', { class: 'ih-multi__hint', text: t('multiHint') }),
        h('textarea', {
          class: 'ih-input ih-multi__urls',
          attr: {
            'aria-label': t('multiUrls'),
            placeholder: t('multiPlaceholder'),
            disabled: starting || running,
          },
          text: draft,
        }),
        h(
          'div',
          { class: 'ih-multi__actions' },
          h(
            'button',
            {
              class: 'ih-button ih-button--primary',
              data: { action: 'start' },
              attr: { disabled: starting || running || !!engine },
            },
            icon('image'),
            t('multiStart'),
          ),
          running
            ? h('progress', {
                class: 'ih-multi__run-progress',
                attr: {
                  max: total,
                  value: completed,
                  'aria-label': t('multiProgress', { done: completed, total }),
                },
              })
            : null,
          running
            ? h('span', {
                attr: { role: 'status' },
                text: t('multiProgress', { done: completed, total }),
              })
            : null,
          running
            ? h('button', { class: 'ih-button', data: { action: 'cancel' }, text: t('extCancel') })
            : null,
        ),
        h(
          'div',
          { class: 'ih-multi__results' },
          h(
            'table',
            {},
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                ...['multiUrl', 'multiStatus', 'multiCount', 'multiAction'].map((key) =>
                  h('th', { attr: { scope: 'col' }, text: t(key) }),
                ),
              ),
            ),
            h('tbody', {}, ...(run?.items ?? []).map(renderRow)),
          ),
        ),
        h(
          'footer',
          { class: 'ih-multi__summary' },
          h('span', {
            attr: { role: 'status', id: 'summary' },
            text: t('multiFound', { count: records.length }),
          }),
          h(
            'div',
            { class: 'ih-multi__summary-actions' },
            prepared?.control.hidden === false
              ? prepared.control
              : h(
                  'button',
                  {
                    class: 'ih-button ih-button--primary',
                    data: { action: 'download' },
                    attr: { disabled: !records.length || running || !!engine },
                  },
                  icon('download'),
                  t('multiDownload'),
                ),
            h(
              'button',
              {
                class: 'ih-button',
                data: { action: 'copy' },
                attr: { disabled: !records.length || running },
              },
              icon('copy'),
              t('extCopyLinks'),
            ),
          ),
        ),
        h('p', {
          class: 'ih-multi__progress',
          attr: { role: 'status' },
          text: prepared?.control.hidden === false ? t('extDownloadReady') : downloadText,
        }),
      ),
    );
  };
  const request = <T>(type: string, payload: unknown = { runId }): Promise<T> =>
    sendToBackground<unknown, T>(type, payload);
  const refresh = async (): Promise<void> => {
    if (!runId || closed) return;
    try {
      run = await request<MultiRun>('multi:status');
      records = (await request<{ images: ImageRecord[] }>('multi:images')).images;
      if (!closed) render();
    } catch {
      if (!closed) {
        toast(t('multiMissing'));
        runId = '';
      }
    }
  };
  const action = async (el: HTMLElement): Promise<void> => {
    try {
      if (el.dataset.action === 'start') {
        draft = root.querySelector('textarea')!.value;
        const urls = [
          ...new Set(
            draft
              .split(/\r?\n/)
              .map((url) => url.trim())
              .filter(Boolean),
          ),
        ];
        if (
          !urls.length ||
          urls.some((url) => {
            try {
              new URL(url);
              return false;
            } catch {
              return true;
            }
          })
        ) {
          toast(t('multiEmpty'));
          return;
        }
        starting = true;
        prepared?.clear();
        render();
        try {
          const reply = await request<{ runId: string }>('multi:start', { urls });
          runId = reply.runId;
          history.replaceState(null, '', '?runId=' + encodeURIComponent(runId));
          await refresh();
        } finally {
          starting = false;
          render();
        }
      }
      if (el.dataset.action === 'cancel') {
        await request('multi:cancel');
        await refresh();
      }
      if (el.dataset.action === 'open') {
        const url = run?.items[Number(el.dataset.index)]?.url;
        if (url && /^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
      }
      if (el.dataset.action === 'copy') {
        try {
          await navigator.clipboard.writeText(records.map((i) => i.url).join('\n'));
          toast(t('extCopied'));
        } catch {
          toast(t('extCopyFailed'));
        }
      }
      if (el.dataset.action === 'download' && !engine && records.length) {
        engine = new DownloadEngine(
          '',
          (p) => {
            downloadText = t('extDownloading', { done: p.done, total: p.total });
            const text = root.querySelector('.ih-multi__progress');
            if (text) text.textContent = downloadText;
          },
          t('multiTitle'),
          prepared?.save,
        );
        render();
        try {
          const result = await engine.run(records, 'zip', settings.namingTemplate, true);
          if (result.failed.length || !prepared)
            toast(
              t(result.failed.length ? 'extDownloadFailed' : 'extDownloadDone', {
                count: result.failed.length || result.ok.length,
              }),
            );
        } finally {
          engine = undefined;
          downloadText = '';
          render();
        }
      }
    } catch {
      toast(t('multiError'));
    }
  };
  render();
  const off = [
    delegate(root, '[data-action]', 'click', (_event, el) => {
      void action(el);
    }),
    watchSettings((value) => {
      settings = value;
      render();
    }),
    onRuntimeMessage((type, payload) => {
      if (type === 'multi:progress' && (payload as { runId?: string } | null)?.runId === runId)
        void refresh();
    }),
  ];
  // Polling recovers completion when a final broadcast races the status response.
  const timer = setInterval(() => {
    if (runId && !run?.finishedAt) void refresh();
  }, 1000);
  await refresh();
  window.addEventListener(
    'pagehide',
    () => {
      closed = true;
      clearInterval(timer);
      off.forEach((fn) => fn());
      engine?.cancel();
      prepared?.dispose();
    },
    { once: true },
  );
}
void bootstrap().catch(() => toast(t('multiError')));
