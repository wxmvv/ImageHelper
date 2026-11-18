import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeExtension } from './fake-extension.ts';
import type { ImageRecord, PageInfo } from '../src/core/types.ts';

const fake = fakeExtension();
fake.localData.settings = { maxImagesPerPage: 2 };
const { sessions } = await import('../src/background/sessions.ts');
const { handlers } = await import('../src/background/handlers.ts');
const { openExtractor, registerTabListeners } = await import('../src/background/tabs.ts');
const { handleDownloadFiles } = await import('../src/background/download-files.ts');
const { ensureContentScript, notifyTab } = await import('../src/background/injection.ts');
const page: PageInfo = { tabId: 1, url: 'https://example.test/', title: 'Example', frames: [] };
const image = (id: string): ImageRecord => ({
  id,
  url: `https://example.test/${id}.png`,
  ext: 'png',
  source: 'img',
  discoveredAt: 1,
});

test('sessions dedupe, enrich, cap, track frames, debounce snapshots and restore', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const session = sessions.ensure(1, page);
  const rev = session.rev;
  assert.equal(sessions.addImages(1, 0, [image('a'), image('a')], page.url).length, 1);
  assert.equal(sessions.addImages(1, 1, [{ ...image('a'), width: 100, bytes: 200 }], page.url).length, 0);
  assert.equal(session.images[0]?.width, 100);
  assert.equal(session.images[0]?.bytes, 200);
  assert.equal(sessions.addImages(1, 0, [image('b'), image('c')], page.url).length, 1);
  assert.equal(session.truncated, true);
  sessions.markFrameDone(1, 0);
  assert.equal(session.page.frames[0]?.done, true);
  assert.equal(session.page.frames[0]?.imageCount, 2);
  assert.ok(session.rev > rev);
  assert.equal(fake.sessionData['session:1'], undefined);
  context.mock.timers.tick(500);
  await Promise.resolve();
  assert.equal((fake.sessionData['session:1'] as unknown as { images: unknown[] }).images.length, 2);
  sessions.clear(1);
  await Promise.resolve();
  assert.equal(sessions.get(1), null);
  assert.equal(fake.sessionData['session:1'], undefined);
  fake.sessionData['session:2'] = { ...structuredClone(session), tabId: 2, page: { ...page, tabId: 2 } };
  assert.equal((await sessions.restore(2))?.images.length, 2);
  sessions.clear(2);
});

test('handlers inject, activate, reuse extractors, query current tab and clean sessions', async () => {
  const invoke = async (type: string, payload: unknown) => {
    const handler = handlers[type];
    assert.ok(handler);
    return handler(payload, {});
  };
  assert.equal(((await invoke('settings:get', {})) as { maxImagesPerPage: number }).maxImagesPerPage, 2);
  const result = (await invoke('extract:start', { tabId: 3 })) as { frames: number; extractorTabId: number };
  assert.equal(result.frames, 1);
  assert.deepEqual(fake.calls.injections.at(-1), {
    target: { tabId: 3, allFrames: true },
    files: ['sniffer.js'],
  });
  assert.deepEqual(fake.calls.notifications.at(-1), { type: 'sniffer:activate', full: true });
  assert.equal(await openExtractor(3), result.extractorTabId);
  assert.equal(fake.calls.created.length, 1);
  assert.deepEqual(await invoke('extract:rescan', { tabId: 3 }), { frames: 1 });
  assert.deepEqual(await invoke('page:autoscroll', { tabId: 3 }), { frames: 1 });
  assert.deepEqual(fake.calls.notifications.at(-1), { type: 'sniffer:autoscroll' });
  assert.deepEqual(await invoke('tabs:current', {}), { tabId: 1, title: 'Example', url: page.url });
  await assert.rejects(invoke('extract:start', { tabId: 'bad' }), /Invalid tab/);
  registerTabListeners();
  fake.removed[0]?.(result.extractorTabId);
  assert.ok(sessions.get(3));
  await openExtractor(3);
  assert.equal(fake.calls.created.length, 2);
  fake.updated[0]?.(3, { status: 'loading', url: 'https://other.test/' }, {} as chrome.tabs.Tab);
  assert.equal(sessions.get(3), null);
  sessions.ensure(4, { ...page, tabId: 4 });
  fake.removed[0]?.(4);
  assert.equal(sessions.get(4), null);
  sessions.clear(3);
});

test('download handler counts successes, records failures, waits between items and handles Safari', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = handleDownloadFiles(
    {
      tabId: 1,
      items: [
        { url: 'https://example.test/a.png', fileName: 'a.png' },
        { url: 'javascript:alert(1)', fileName: 'bad.png' },
      ],
    },
    {},
  );
  await Promise.resolve();
  context.mock.timers.tick(120);
  const result = await pending;
  assert.equal(result.started, 1);
  assert.equal(result.failed.length, 1);
  assert.deepEqual(fake.calls.downloads[0], {
    url: 'https://example.test/a.png',
    filename: 'a.png',
    conflictAction: 'uniquify',
    saveAs: false,
  });
  Object.defineProperty(fake.api, 'downloads', { value: undefined });
  const unsupported = await handleDownloadFiles(
    { tabId: 1, items: [{ url: 'https://example.test/a.png', fileName: 'a.png' }] },
    {},
  );
  assert.equal(unsupported.unsupported, true);
  assert.equal(unsupported.failed.length, 1);
});

test('injection and notifications fail safely when APIs reject or are absent', async () => {
  fake.api.scripting.executeScript = async () => {
    throw new Error('restricted');
  };
  fake.api.tabs.sendMessage = async () => {
    throw new Error('no receiver');
  };
  assert.equal(await ensureContentScript(1), false);
  assert.equal(await notifyTab(1, {}), false);
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true });
  assert.equal(await ensureContentScript(1), false);
  assert.equal(await notifyTab(1, {}), false);
});
