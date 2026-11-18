import { shortcutFromKey } from '../core/shortcut.ts';
import { sendToBackground } from '../platform/rpc.ts';
import { readSettings } from '../platform/storage.ts';

export function bindExtractionShortcut(): () => void {
  let shortcut = '';
  let disposed = false;
  let busy = false;
  const refresh = (): void => {
    void readSettings()
      .then((settings) => {
        if (!disposed) shortcut = settings.extractionShortcut;
      })
      .catch(() => {});
  };
  const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area === 'local' && changes.settings) refresh();
  };
  const keydown = (event: KeyboardEvent): void => {
    if (
      !shortcut ||
      busy ||
      event.repeat ||
      event.isComposing ||
      event.defaultPrevented ||
      shortcutFromKey(event) !== shortcut
    )
      return;
    if (
      event
        .composedPath()
        .some(
          (node) =>
            node instanceof HTMLElement &&
            (node.isContentEditable ||
              ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) ||
              node.getAttribute('role') === 'textbox'),
        )
    )
      return;
    event.preventDefault();
    busy = true;
    void sendToBackground<Record<string, never>, { ok: boolean }>('extract:shortcut', {})
      .catch(() => {})
      .finally(() => {
        busy = false;
      });
  };
  refresh();
  document.addEventListener('keydown', keydown);
  if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(changed);
  return () => {
    disposed = true;
    document.removeEventListener('keydown', keydown);
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(changed);
  };
}
