import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ImageRecord } from '../src/core/types.ts';
import { Reporter } from '../src/content/reporter.ts';

type Message = { id?: string; type: string; payload: { images?: ImageRecord[]; truncated?: boolean } };
function setup() {
  Object.defineProperty(globalThis, 'document', {
    value: { baseURI: 'https://example.test/path/' },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'location', {
    value: { href: 'https://example.test/page' },
    configurable: true,
  });
  const batches: Message[] = [];
  let available = true;
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        sendMessage(message: Message, callback: (value: unknown) => void) {
          if (!available) {
            callback(undefined);
            return;
          }
          if (message.type === 'settings:get') callback({ __ih: 1, id: message.id, ok: true, data: {} });
          else {
            batches.push(message);
            callback(undefined);
          }
        },
      },
    },
  });
  return {
    batches,
    fail: () => {
      available = false;
    },
    recover: () => {
      available = true;
    },
  };
}

test('reporter filters, resolves, dedupes, enriches and caps image records', async () => {
  const { batches } = setup();
  const reporter = new Reporter({ maxImages: 2, includeDataUrls: false });
  reporter.push(
    [
      '',
      'javascript:alert(1)',
      'about:blank',
      'chrome-extension://id/a.png',
      'blob:https://example.test/a',
      'data:image/png;base64,AAAA',
    ].map((url) => ({ url, source: 'img' })),
  );
  assert.equal(reporter.count, 0);
  reporter.push([
    { url: './a.png#one', source: 'network', bytes: 42 },
    { url: './a.png#two', source: 'img', width: 10, height: 10, hidden: true },
    { url: './a.png', source: 'img', hidden: false },
    { url: './a.png', source: 'img', hidden: true },
    { url: '/b.png', source: 'cssom' },
    { url: '/c.png', source: 'img' },
  ]);
  await reporter.flushNow();
  assert.equal(reporter.count, 2);
  assert.equal(reporter.truncated, true);
  assert.equal(batches.length, 1);
  assert.equal(batches[0]?.payload.truncated, true);
  const record = batches[0]?.payload.images?.[0];
  assert.equal(record?.url, 'https://example.test/path/a.png');
  assert.equal(record?.width, 10);
  assert.equal(record?.bytes, 42);
  assert.equal(record?.hidden, false);
  assert.equal(record?.frameUrl, 'https://example.test/page');
  assert.equal(record?.ext, 'png');
  assert.ok(record?.id && record.discoveredAt);
  reporter.push([{ url: './a.png', source: 'img', width: 10 }]);
  await reporter.flushNow();
  assert.equal(batches.length, 1);
});

test('reporter allows small image data URLs and rejects placeholders and large data', async () => {
  const { batches } = setup();
  const reporter = new Reporter({ maxImages: 10, includeDataUrls: true });
  reporter.push(
    [
      'data:image/png;base64,AAAA',
      'data:image/gif;base64,R0lGODlhAQAAAA',
      'data:text/plain,hello',
      'data:image/png;base64,' + 'A'.repeat(200000),
    ].map((url) => ({ url, source: 'page-hook' })),
  );
  await reporter.flushNow();
  assert.equal(reporter.count, 1);
  assert.equal(batches[0]?.payload.images?.[0]?.url, 'data:image/png;base64,AAAA');
});

test('reporter retains failed batches and retries after 300ms', async (context) => {
  const transport = setup();
  context.mock.timers.enable({ apis: ['setTimeout'] });
  transport.fail();
  const reporter = new Reporter({ maxImages: 10, includeDataUrls: false });
  reporter.push([{ url: '/a.png', source: 'img' }]);
  await reporter.flushNow();
  assert.equal(transport.batches.length, 0);
  transport.recover();
  context.mock.timers.tick(300);
  await reporter.flushNow();
  assert.equal(transport.batches.length, 1);
});

test('reporter drops a batch with a warning after five retries', async (context) => {
  const transport = setup();
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const warnings: unknown[] = [];
  context.mock.method(console, 'warn', (...args: unknown[]) => {
    warnings.push(args);
  });
  transport.fail();
  const reporter = new Reporter({ maxImages: 10, includeDataUrls: false });
  reporter.push([{ url: '/a.png', source: 'img' }]);
  for (let attempt = 0; attempt < 6; attempt++) await reporter.flushNow();
  assert.equal(warnings.length, 1);
  transport.recover();
  await reporter.flushNow();
  assert.equal(transport.batches.length, 0);
});
