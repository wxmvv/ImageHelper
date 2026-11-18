import { readSettings } from '../platform/storage.ts';
import { startExtraction } from './handlers.ts';

let registered = false;
export function registerCommands(): void {
  if (registered || typeof chrome === 'undefined' || !chrome.commands?.onCommand) return;
  registered = true;
  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'extract-current-page') return;
    void (async () => {
      if (!(await readSettings()).extractionShortcut) return;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) await startExtraction(tab.id);
    })().catch((error: unknown) => console.warn('Extraction failed', error));
  });
}
