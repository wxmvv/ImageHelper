import { sessions } from './sessions.ts';
import { broadcast } from '../platform/rpc.ts';

const extractors = new Map<number, number>();
let registered = false;

export async function openExtractor(tabId: number): Promise<number> {
  const existing = extractors.get(tabId);
  if (existing !== undefined) {
    try {
      await chrome.tabs.update(existing, { active: true });
      return existing;
    } catch {
      extractors.delete(tabId);
    }
  }
  if (typeof chrome === 'undefined' || !chrome.tabs?.create || !chrome.runtime?.getURL)
    throw new Error('Tabs API unavailable');
  const created = await chrome.tabs.create({ url: chrome.runtime.getURL('extractor.html?tabId=' + tabId) });
  if (created.id === undefined) throw new Error('Extractor tab could not be opened');
  extractors.set(tabId, created.id);
  return created.id;
}

export function registerTabListeners(): void {
  if (registered || typeof chrome === 'undefined' || !chrome.tabs) return;
  registered = true;
  chrome.tabs.onRemoved?.addListener((tabId) => {
    if (extractors.has(tabId)) extractors.delete(tabId);
    for (const [source, extractor] of extractors) if (extractor === tabId) extractors.delete(source);
    sessions.clear(tabId);
  });
  chrome.tabs.onUpdated?.addListener((tabId, change, tab) => {
    const session = sessions.get(tabId);
    const url = change.url ?? tab.url;
    if (change.status === 'loading' && url && session && url !== session.page.url) {
      sessions.clear(tabId);
      broadcast('session:reset', { tabId });
    }
  });
}
