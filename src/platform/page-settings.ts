import type { Settings } from '../core/types.ts';
import { applyI18n, setLocale } from './i18n.ts';
import { readSettings } from './storage.ts';

export function applyPageSettings(settings: Settings): void {
  setLocale(settings.language);
  document.documentElement.dataset.theme = settings.theme === 'auto' ? '' : settings.theme;
  applyI18n(document);
}
export function watchSettings(listener: (settings: Settings) => void): () => void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return () => {};
  const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area === 'local' && changes.settings) void readSettings().then(listener);
  };
  chrome.storage.onChanged.addListener(changed);
  return () => chrome.storage.onChanged.removeListener(changed);
}
