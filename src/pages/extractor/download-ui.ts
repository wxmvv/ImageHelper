import type { ImageRecord, Settings } from '../../core/types.ts';
import { t } from '../../platform/i18n.ts';
import { isIOS } from '../../platform/ios.ts';
import { createPreparedDownload } from '../../platform/prepared-download.ts';
import { delegate, h } from '../../ui/dom.ts';
import { toast } from '../../ui/toast.ts';
import { button } from './actions.ts';
import { DownloadEngine } from '../../downloads/engine.ts';
import { store } from './state.ts';
export function createDownloads(root: HTMLElement, settings: Settings) {
  let engine: DownloadEngine | undefined;
  let cancelled = false;
  const prepared = isIOS() ? createPreparedDownload() : undefined;
  const text = h('span');
  const meter = h('progress', { attr: { max: 1, value: 0 } });
  const retry = button('extRetry', 'retry');
  const cancel = button('extCancel', 'cancel');
  retry.hidden = true;
  root.replaceChildren(text, meter, cancel, retry, ...(prepared ? [prepared.control] : []));
  let failed: ImageRecord[] = [];
  const run = async (records: ImageRecord[]): Promise<void> => {
    if (engine || !records.length) return;
    cancelled = false;
    prepared?.clear();
    meter.hidden = false;
    retry.hidden = true;
    cancel.hidden = false;
    cancel.querySelector<HTMLElement>('.ih-button__text')!.textContent = t('extCancel');
    cancel.setAttribute('aria-label', t('extCancel'));
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
      prepared?.save,
    );
    engine = current;
    try {
      const mode = prepared ? (records.length > 1 ? 'zip' : 'files') : settings.downloadMode;
      const result = await current.run(records, mode, settings.namingTemplate);
      const urls = new Set(result.failed.map((i) => i.url));
      failed = prepared && urls.size ? records : records.filter((i) => urls.has(i.url));
      if (!cancelled) {
        if (prepared && !prepared.control.hidden) {
          text.textContent = t('extDownloadReady');
          if (urls.size) text.textContent += ' · ' + t('extDownloadFailed', { count: urls.size });
        } else {
          toast(
            t(urls.size ? 'extDownloadFailed' : 'extDownloadDone', {
              count: urls.size || result.ok.length,
            }),
          );
        }
        retry.hidden = !failed.length;
      }
    } catch {
      toast(t('extDownloadError'));
    } finally {
      engine = undefined;
      const ready = prepared?.control.hidden === false;
      root.hidden = cancelled || (retry.hidden && !ready);
      cancel.hidden = !ready;
      if (ready) {
        meter.hidden = true;
        cancel.querySelector<HTMLElement>('.ih-button__text')!.textContent = t('extDismiss');
        cancel.setAttribute('aria-label', t('extDismiss'));
      }
    }
  };
  const off = delegate(root, '[data-action]', 'click', (_e, el) => {
    if (el.dataset.action === 'cancel') {
      cancelled = true;
      engine?.cancel();
      prepared?.clear();
      root.hidden = true;
    }
    if (el.dataset.action === 'retry') {
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
      prepared?.dispose();
    },
  };
}
