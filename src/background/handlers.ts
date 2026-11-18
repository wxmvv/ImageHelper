import { startMulti, multiStatus, multiImages, cancelMulti } from './multi-run.ts';
import type { PageSession } from '../core/types.ts';
import { readSettings } from '../platform/storage.ts';
import { broadcast, type MessageHandler } from '../platform/rpc.ts';
import { handleDownloadFiles } from './download-files.ts';
import { ensureContentScript, notifyTab } from './injection.ts';
import { downloadItems, objectPayload, tabIdFromPayload } from './message-data.ts';
import { sessions } from './sessions.ts';
import { openExtractor } from './tabs.ts';

export async function ensurePageSession(tabId: number): Promise<PageSession> {
  const existing = await sessions.restore(tabId);
  if (existing) return existing;
  if (typeof chrome === 'undefined' || !chrome.tabs?.get) throw new Error('Tabs API unavailable');
  const tab = await chrome.tabs.get(tabId);
  return sessions.ensure(tabId, {
    tabId,
    url: tab.url ?? '',
    title: tab.title ?? '',
    favIconUrl: tab.favIconUrl,
    frames: [],
  });
}

async function activate(tabId: number): Promise<number> {
  const session = await ensurePageSession(tabId);
  if (!(await ensureContentScript(tabId))) return 0;
  return (await notifyTab(tabId, { type: 'sniffer:activate', full: true }))
    ? Math.max(1, session.page.frames.length)
    : 0;
}

export async function startExtraction(
  tabId: number,
): Promise<{ frames: number; ok: boolean; extractorTabId?: number }> {
  const frames = await activate(tabId);
  if (!frames) return { frames, ok: false };
  return { frames, ok: true, extractorTabId: await openExtractor(tabId) };
}

export const handlers: Record<string, MessageHandler> = {
  'multi:start': startMulti,
  'multi:status': multiStatus,
  'multi:images': multiImages,
  'multi:cancel': cancelMulti,
  'settings:get': () => readSettings(),
  'extract:shortcut': (_payload, sender) => {
    if (sender.tab?.id === undefined) throw new Error('No source tab');
    return startExtraction(sender.tab.id);
  },
  'extract:start': (payload) => startExtraction(tabIdFromPayload(payload)),
  'extract:rescan': async (payload) => ({ frames: await activate(tabIdFromPayload(payload)) }),
  'page:autoscroll': async (payload) => {
    const tabId = tabIdFromPayload(payload);
    const session = await ensurePageSession(tabId);
    const sent = await notifyTab(tabId, { type: 'sniffer:autoscroll' });
    return { frames: sent ? Math.max(1, session.page.frames.length) : 0 };
  },
  'page:stopscroll': async (payload) => ({
    frames: (await notifyTab(tabIdFromPayload(payload), { type: 'sniffer:stopscroll' })) ? 1 : 0,
  }),
  'session:get': async (payload) => ({ session: await ensurePageSession(tabIdFromPayload(payload)) }),
  'session:clear': (payload) => {
    const tabId = tabIdFromPayload(payload);
    sessions.clear(tabId);
    broadcast('session:reset', { tabId });
    return { ok: true };
  },
  'extractor:open': async (payload) => ({ tabId: await openExtractor(tabIdFromPayload(payload)) }),
  'download:files': (payload, sender) => {
    const raw = objectPayload(payload);
    return handleDownloadFiles({ tabId: tabIdFromPayload(payload), items: downloadItems(raw.items) }, sender);
  },
  'tabs:current': async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) throw new Error('Tabs API unavailable');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('No active tab');
    return { tabId: tab.id, title: tab.title ?? '', url: tab.url ?? '' };
  },
};
