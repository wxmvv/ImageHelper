import type { MultiRun, MultiRunItem } from '../core/messages.ts';
import type { ImageRecord } from '../core/types.ts';
import { broadcast } from '../platform/rpc.ts';
import { ensureContentScript, notifyTab } from './injection.ts';
import { objectPayload } from './message-data.ts';
import { sessions } from './sessions.ts';

interface RunState {
  run: MultiRun;
  images: Map<string, ImageRecord>;
  controller: AbortController;
}
const runs = new Map<string, RunState>();

function progress(state: RunState, item: MultiRunItem): void {
  broadcast('multi:progress', {
    runId: state.run.runId,
    item,
    totals: {
      done: state.run.items.filter((i) => i.status === 'done' || i.status === 'failed').length,
      total: state.run.items.length,
      images: state.images.size,
    },
  });
}
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
function loaded(tabId: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(updated);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const updated = (id: number, info: chrome.tabs.OnUpdatedInfo): void => {
      if (id === tabId && info.status === 'complete') finish();
    };
    const abort = (): void => finish(new Error('multiCancelled'));
    const timer = setTimeout(() => finish(new Error('multiTimeout')), 20000);
    chrome.tabs.onUpdated.addListener(updated);
    signal.addEventListener('abort', abort, { once: true });
    void chrome.tabs.get(tabId).then(
      (tab) => {
        if (tab.status === 'complete') finish();
      },
      () => finish(new Error('multiPageFailed')),
    );
    if (signal.aborted) abort();
  });
}
async function extract(state: RunState, item: MultiRunItem): Promise<void> {
  const signal = state.controller.signal;
  item.status = 'running';
  progress(state, item);
  try {
    if (!/^https?:\/\//i.test(item.url)) throw new Error('popupRestricted');
    if (typeof chrome === 'undefined' || !chrome.tabs?.create || !chrome.tabs.onUpdated)
      throw new Error('multiPageFailed');
    signal.throwIfAborted();
    const tab = await chrome.tabs.create({ url: item.url, active: false });
    if (tab.id === undefined) throw new Error('multiPageFailed');
    item.tabId = tab.id;
    await loaded(tab.id, signal);
    signal.throwIfAborted();
    const current = await chrome.tabs.get(tab.id);
    if (!/^https?:\/\//i.test(current.url ?? '')) throw new Error('popupRestricted');
    sessions.ensure(tab.id, { tabId: tab.id, url: item.url, title: current.title ?? '', frames: [] });
    if (
      !(await ensureContentScript(tab.id)) ||
      !(await notifyTab(tab.id, { type: 'sniffer:activate', full: true }))
    )
      throw new Error('multiPageFailed');
    let previous = -1;
    let stable = 0;
    for (let tick = 0; tick < 16 && stable < 2; tick++) {
      await wait(500, signal);
      const count = sessions.get(tab.id)?.images.length ?? 0;
      stable = count === previous ? stable + 1 : 0;
      previous = count;
    }
    const images = sessions.get(tab.id)?.images ?? [];
    for (const image of images) {
      if (!state.images.has(image.url)) state.images.set(image.url, { ...image, frameUrl: item.url });
    }
    item.images = images.length;
    item.status = 'done';
  } catch (error) {
    item.status = 'failed';
    item.error = signal.aborted
      ? 'multiCancelled'
      : error instanceof Error
        ? error.message
        : 'multiPageFailed';
  } finally {
    if (item.tabId !== undefined) {
      try {
        await chrome.tabs.remove(item.tabId);
      } catch {
        /* The user may have closed the tab. */
      }
      sessions.clear(item.tabId);
    }
    progress(state, item);
  }
}
async function execute(state: RunState): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (!state.controller.signal.aborted) {
      const item = state.run.items[cursor++];
      if (!item) return;
      await extract(state, item);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  state.run.finishedAt = Date.now();
  for (const item of state.run.items) {
    if (item.status === 'pending') {
      item.status = 'failed';
      item.error = 'multiCancelled';
    }
    progress(state, item);
  }
}
export function startMulti(payload: unknown): { runId: string } {
  const { urls } = objectPayload(payload);
  if (!Array.isArray(urls) || !urls.length || urls.some((url: unknown) => typeof url !== 'string'))
    throw new Error('multiEmpty');
  if (runs.size >= 3) {
    const completed = [...runs].find(([, state]) => state.run.finishedAt !== undefined);
    if (!completed) throw new Error('multiBusy');
    runs.delete(completed[0]);
  }
  const runId = crypto.randomUUID();
  const state: RunState = {
    run: {
      runId,
      startedAt: Date.now(),
      items: (urls as string[]).map((url) => ({ url, status: 'pending', images: 0 })),
    },
    images: new Map(),
    controller: new AbortController(),
  };
  runs.set(runId, state);
  void execute(state);
  return { runId };
}
function getState(payload: unknown): RunState {
  const { runId } = objectPayload(payload);
  const state = typeof runId === 'string' ? runs.get(runId) : undefined;
  if (!state) throw new Error('multiMissing');
  return state;
}
export function multiStatus(payload: unknown): MultiRun {
  return getState(payload).run;
}
export function multiImages(payload: unknown): { images: ImageRecord[] } {
  return { images: [...getState(payload).images.values()] };
}
export function cancelMulti(payload: unknown): { ok: true } {
  getState(payload).controller.abort();
  return { ok: true };
}
