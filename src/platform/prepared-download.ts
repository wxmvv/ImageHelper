import { h, on } from '../ui/dom.ts';
import { toast } from '../ui/toast.ts';
import { t } from './i18n.ts';

export function createPreparedDownload() {
  const control = h('button', {
    class: 'ih-button ih-button--primary',
    attr: { hidden: true, type: 'button' },
    data: { action: 'save-file' },
  });
  let file: File | undefined;
  const share = async (current: File): Promise<void> => {
    const data = { files: [current] };
    try {
      if (typeof navigator.share !== 'function' || (navigator.canShare && !navigator.canShare(data)))
        throw new Error('File sharing unavailable');
      control.disabled = true;
      // The tap supplies fresh activation for Safari's native Save to Files action.
      await navigator.share(data);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast(t('extDownloadError'));
    } finally {
      if (file === current) control.disabled = false;
    }
  };
  const unbind = on(control, 'click', () => {
    if (file && !control.disabled) void share(file);
  });
  const clear = (): void => {
    file = undefined;
    control.hidden = true;
    control.disabled = false;
  };
  return {
    control,
    clear,
    save(blob: Blob, fileName: string): void {
      file = new File([blob], fileName, { type: blob.type });
      control.textContent = t('extSaveFile');
      control.hidden = false;
    },
    dispose(): void {
      unbind();
      clear();
    },
  };
}
