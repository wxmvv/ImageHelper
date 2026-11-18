import { startExtraction } from './handlers.ts';

const MENU_ID = 'extract-current-page';
let registered = false;

export function createContextMenu(): void {
  try {
    if (typeof chrome === 'undefined' || !chrome.contextMenus?.create || !chrome.i18n?.getMessage) return;
    chrome.contextMenus.create(
      { id: MENU_ID, title: chrome.i18n.getMessage('popupExtract'), contexts: ['page'] },
      () => {
        // Reinstallation may leave an existing menu with the same identifier.
        void chrome.runtime?.lastError;
      },
    );
  } catch (error) {
    console.warn('Context menu unavailable', error);
  }
}

export function registerContextMenu(): void {
  if (registered || typeof chrome === 'undefined' || !chrome.contextMenus?.onClicked) return;
  registered = true;
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID && tab?.id !== undefined) {
      void startExtraction(tab.id).catch((error: unknown) => console.warn('Extraction failed', error));
    }
  });
}
