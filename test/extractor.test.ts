import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFilter, normalizeFilter } from '../src/core/filter.ts';
import { differenceHash } from '../src/core/dhash.ts';
import type { ImageRecord } from '../src/core/types.ts';
import { store } from '../src/pages/extractor/state.ts';
import { selectAll, selectRange, invertSelection, removeSelected } from '../src/pages/extractor/selection.ts';
import { fetchImage } from '../src/downloads/fetch.ts';
const image = (id: string, bytes = 10): ImageRecord => ({
  id,
  url: `https://example.test/${id}.png`,
  ext: 'png',
  source: 'img',
  discoveredAt: 1,
  width: 100,
  height: 100,
  bytes,
});

test('extractor state batches notifications, caches derived rows and preserves hidden selections', async () => {
  const images = [image('a'), image('b', 20), image('c', 30)];
  store.patch({ images, filter: defaultFilter(), selected: new Set(), hash: new Map() });
  await Promise.resolve();
  let notifications = 0;
  const off = store.subscribe(() => notifications++);
  const visible = store.derived().visible;
  selectRange('a', 'b', images);
  store.patch({ scanning: true });
  assert.equal(store.derived().visible, visible);
  assert.equal(store.derived().selectedBytes, 30);
  assert.equal(store.derived().totalBytes, 60);
  await Promise.resolve();
  assert.equal(notifications, 1);
  store.patch({ filter: { ...defaultFilter(), include: '/c.' } });
  assert.deepEqual(
    store.derived().visible.map((i) => i.id),
    ['c'],
  );
  assert.equal(store.get().selected.size, 2);
  selectAll(images);
  invertSelection([images[0]!]);
  removeSelected();
  assert.deepEqual(
    store.get().images.map((i) => i.id),
    ['a'],
  );
  assert.equal(store.get().selected.size, 0);
  off();
});

test('similar groups retain largest image and can expand without deleting originals', () => {
  const a = image('a');
  const b = { ...image('b'), width: 200 };
  store.patch({
    images: [a, b],
    filter: { ...defaultFilter(), dedupe: 'similar' },
    hash: new Map([
      ['a', '0000000000000000'],
      ['b', '0000000000000000'],
    ]),
    expanded: new Set(),
  });
  assert.deepEqual(store.derived().visible, [b]);
  assert.equal(store.derived().groups.get('b')?.length, 2);
  store.patch({ expanded: new Set(['b']) });
  assert.equal(store.derived().visible.length, 2);
  assert.equal(store.get().images.length, 2);
});

test('persisted filters reject malformed values and dHash compares adjacent luminance', () => {
  const defaults = defaultFilter(300, 100);
  const filter = normalizeFilter(
    { minWidth: -1, minHeight: 'bad', formats: ['png', 1], sort: 'bad', similarThreshold: 99 },
    defaults,
  );
  assert.equal(filter.minWidth, 300);
  assert.equal(filter.minHeight, 100);
  assert.deepEqual(filter.formats, ['png']);
  assert.equal(filter.sort, 'order');
  assert.equal(filter.similarThreshold, 16);
  const pixels = new Uint8ClampedArray(9 * 8 * 4);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 9; x++) pixels.fill(255 - x * 20, (y * 9 + x) * 4, (y * 9 + x) * 4 + 3);
  assert.equal(differenceHash(pixels), 'ffffffffffffffff');
});

test('image fetch retries twice, preserves non-image bytes and decodes data URLs', async (context) => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    assert.equal(options.credentials, 'include');
    assert.equal(options.referrer, 'https://example.test/');
    assert.equal(options.cache, 'force-cache');
    return ++calls < 3
      ? new Response('error', { status: 503 })
      : new Response('raw bytes', { headers: { 'content-type': 'text/plain' } });
  });
  assert.equal(
    await (
      await fetchImage('https://example.test/a.png', 'https://example.test/', new AbortController().signal)
    ).text(),
    'raw bytes',
  );
  assert.equal(calls, 3);
  assert.equal(
    await (await fetchImage('data:image/png;base64,aGVsbG8=', '', new AbortController().signal)).text(),
    'hello',
  );
  assert.equal(
    await (await fetchImage('data:image/svg+xml,%3Csvg%2F%3E', '', new AbortController().signal)).text(),
    '<svg/>',
  );
  await assert.rejects(fetchImage('javascript:alert(1)', '', new AbortController().signal), /Unsupported/);
});

test('cancelling a fetch aborts in-flight work without retrying', async (context) => {
  const controller = new AbortController();
  let calls = 0;
  context.mock.method(globalThis, 'fetch', (_url: string, options: RequestInit) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  });
  const pending = fetchImage('https://example.test/a.png', '', controller.signal);
  controller.abort();
  await assert.rejects(pending, /aborted/);
  assert.equal(calls, 1);
});
