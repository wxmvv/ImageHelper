import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DownloadEngine, alignExtension, buildFileNames } from '../src/downloads/engine.ts';
import type { ImageRecord } from '../src/core/types.ts';
import { fakeExtension } from './fake-extension.ts';
const records = (count: number): ImageRecord[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i),
    url: `https://example.test/${i}.png`,
    ext: 'png',
    source: 'img',
    discoveredAt: i,
  }));

test('ZIP engine limits concurrency to four, streams entries and reports packing/saving', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  Object.defineProperty(globalThis, 'document', { value: { title: 'Test page' }, configurable: true });
  const fake = fakeExtension();
  const originalFetch = globalThis.fetch;
  let active = 0;
  let maximum = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--;
    return new Response('image bytes', { headers: { 'content-type': 'image/png' } });
  });
  const phases: string[] = [];
  const engine = new DownloadEngine('https://example.test/page', (p) => phases.push(p.phase));
  const result = await engine.run(records(9), 'zip', '{name}.{ext}');
  assert.equal(maximum, 4);
  assert.equal(result.ok.length, 9);
  assert.deepEqual(result.failed, []);
  assert.ok(phases.includes('packing'));
  assert.equal(phases.at(-1), 'saving');
  assert.equal(fake.calls.downloads.length, 1);
  const download = fake.calls.downloads[0] as { url: string };
  const zip = new DataView(await (await originalFetch(download.url)).arrayBuffer());
  assert.equal(zip.getUint32(0, true), 0x04034b50);
  assert.equal(zip.getUint16(zip.byteLength - 12, true), 9);
  URL.revokeObjectURL(download.url);
  Reflect.deleteProperty(globalThis, 'document');
});

test('ZIP cancellation aborts all four requests and never saves partial data', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  Object.defineProperty(globalThis, 'document', { value: { title: 'Test' }, configurable: true });
  const fake = fakeExtension();
  let started = 0;
  let aborted = 0;
  context.mock.method(
    globalThis,
    'fetch',
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        started++;
        options.signal?.addEventListener(
          'abort',
          () => {
            aborted++;
            reject(new Error('cancelled'));
          },
          { once: true },
        );
      }),
  );
  const engine = new DownloadEngine('https://example.test/', () => {});
  const pending = engine.run(records(10), 'zip', '{index}.{ext}');
  engine.cancel();
  const result = await pending;
  assert.equal(started, 4);
  assert.equal(aborted, 4);
  assert.equal(fake.calls.downloads.length, 0);
  assert.equal(result.ok.length, 0);
  assert.equal(result.failed.length, 0);
  Reflect.deleteProperty(globalThis, 'document');
});

test('alignExtension trusts the response mime over the URL hint', () => {
  assert.equal(alignExtension('photo.jpg', 'image/webp'), 'photo.webp');
  assert.equal(alignExtension('photo', 'image/jpeg'), 'photo.jpg');
  assert.equal(alignExtension('photo.jpg', 'text/html'), 'photo.jpg');
  assert.equal(alignExtension('photo.jpg', 'image/svg+xml'), 'photo.svg');
});

test('preparing one file supplies its actual MIME type and filename to the mobile save control', async (context) => {
  const fake = fakeExtension();
  context.mock.method(globalThis, 'fetch', async () => {
    return new Response('image bytes', { headers: { 'content-type': 'image/webp' } });
  });
  const files: { blob: Blob; name: string }[] = [];
  const engine = new DownloadEngine(
    'https://example.test/page',
    () => {},
    'Example',
    (blob, name) => {
      files.push({ blob, name });
    },
  );
  const [image] = records(1);
  assert.ok(image);
  const result = await engine.run([image], 'files', '{name}.{ext}');
  assert.deepEqual(result, { ok: [image.url], failed: [] });
  assert.equal(files.length, 1);
  assert.equal(files[0]?.name, '0.webp');
  assert.equal(files[0]?.blob.type, 'image/webp');
  assert.equal(await files[0]?.blob.text(), 'image bytes');
  assert.equal(fake.calls.downloads.length, 0);
});

test('buildFileNames renders metadata, sanitizes names and resolves duplicates', () => {
  const input = records(2).map((record) => ({
    ...record,
    url: 'https://example.test/photo.png',
    width: 640,
    height: 480,
  }));
  assert.deepEqual(buildFileNames(input, '{name}.{ext}', 'Example'), ['photo.png', 'photo-2.png']);
  assert.deepEqual(buildFileNames(input.slice(0, 1), '{page}_{host}_{index}.{ext}', 'A/B'), [
    'AB_example.test_001.png',
  ]);
});
