import type { ImageRecord, Settings } from '../../core/types.ts';
import { t } from '../../platform/i18n.ts';
import { delegate, h } from '../../ui/dom.ts';
import { toast } from '../../ui/toast.ts';
import { button } from './actions.ts';
import { DownloadEngine } from '../../downloads/engine.ts';
import { store } from './state.ts';
export function createDownloads(root: HTMLElement, settings: Settings) {
  let engine: DownloadEngine | undefined;
  let cancelled = false;
  const text = h('span');
  const meter = h('progress', { attr: { max: 1, value: 0 } });
  const retry = button('extRetry', 'retry');
  retry.hidden = true;
  root.replaceChildren(text, meter, button('extCancel', 'cancel'), retry);
  let failed: ImageRecord[] = [];
  const run = async (records: ImageRecord[]): Promise<void> => {
    if (engine || !records.length) return;
    cancelled = false;
    retry.hidden = true;
    root.hidden = false;
    const page = store.get().page;
    const current = new DownloadEngine(
      page.url,
      (p) => {
        text.textContent =
          t('extDownloading', { done: p.done, total: p.total }) +
          (p.failed ? ' · ' + t('extDownloadFailed', { count: p.failed }) : '');
        meter.max = p.total || 1;
        meter.value = p.done;
      },
      page.title,
    );
    engine = current;
    try {
      const result = await current.run(records, settings.downloadMode, settings.namingTemplate);
      const urls = new Set(result.failed.map((i) => i.url));
      failed = records.filter((i) => urls.has(i.url));
      if (!cancelled) {
        toast(
          t(failed.length ? 'extDownloadFailed' : 'extDownloadDone', {
            count: failed.length || result.ok.length,
          }),
        );
        retry.hidden = !failed.length;
      }
    } catch {
      toast(t('extDownloadError'));
    } finally {
      engine = undefined;
      root.hidden = retry.hidden || cancelled;
      root.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.hidden = !root.hidden;
    }
  };
  const off = delegate(root, '[data-action]', 'click', (_e, el) => {
    if (el.dataset.action === 'cancel') {
      cancelled = true;
      engine?.cancel();
      root.hidden = true;
    }
    if (el.dataset.action === 'retry') {
      root.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.hidden = false;
      void run(failed);
    }
  });
  return {
    run: (records: ImageRecord[]): void => {
      void run(records);
    },
    dispose: (): void => {
      off();
      engine?.cancel();
    },
  };
}
