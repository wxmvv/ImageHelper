import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startMulti, multiStatus, multiImages, cancelMulti } from '../src/background/multi-run.ts';
import { sessions } from '../src/background/sessions.ts';
import { fakeExtension } from './fake-extension.ts';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
test('multi runs cap concurrency, dedupe results, close tabs and evict old completed runs', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const fake = fakeExtension();
  let active = 0;
  let maximum = 0;
  const closed: number[] = [];
  Object.assign(fake.api.tabs.onUpdated, { removeListener: () => {} });
  Object.assign(fake.api.tabs, {
    async create() {
      maximum = Math.max(maximum, ++active);
      return { id: 900 + active };
    },
    async get(id: number) {
      return { id, status: 'complete', url: 'https://example.test' };
    },
    async remove(id: number) {
      active--;
      closed.push(id);
    },
    async sendMessage(id: number) {
      sessions.addImages(
        id,
        0,
        [{ id: 'same', url: 'https://example.test/photo.png', source: 'img', ext: 'png', discoveredAt: 0 }],
        'https://example.test',
      );
    },
  });
  const first = startMulti({ urls: Array.from({ length: 7 }, (_, i) => `https://example.test/${i}`) });
  for (let tick = 0; tick < 16; tick++) {
    await flush();
    context.mock.timers.tick(500);
  }
  await flush();
  assert.equal(maximum, 3);
  assert.equal(closed.length, 7);
  assert.ok(multiStatus(first).finishedAt);
  assert.ok(multiStatus(first).items.every((i) => i.status === 'done' && i.images === 1));
  assert.equal(multiImages(first).images.length, 1);
  for (let i = 0; i < 3; i++) {
    startMulti({ urls: ['chrome://version'] });
    await flush();
  }
  assert.throws(() => multiStatus(first), /multiMissing/);
});
test('multi load timeout and cancellation clean up listeners and pending items', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const fake = fakeExtension();
  const listeners = new Set<unknown>();
  const closed: number[] = [];
  let next = 1000;
  Object.assign(fake.api.tabs.onUpdated, {
    addListener: (listener: unknown) => listeners.add(listener),
    removeListener: (listener: unknown) => listeners.delete(listener),
  });
  Object.assign(fake.api.tabs, {
    async create() {
      return { id: next++ };
    },
    async get(id: number) {
      return { id, status: 'loading' };
    },
    async remove(id: number) {
      closed.push(id);
    },
  });
  const timeout = startMulti({ urls: ['https://example.test/slow'] });
  await flush();
  context.mock.timers.tick(20000);
  await flush();
  assert.equal(multiStatus(timeout).items[0]?.error, 'multiTimeout');
  assert.equal(listeners.size, 0);
  const cancelled = startMulti({ urls: Array.from({ length: 7 }, () => 'https://example.test/slow') });
  await flush();
  cancelMulti(cancelled);
  await flush();
  assert.ok(multiStatus(cancelled).finishedAt);
  assert.ok(multiStatus(cancelled).items.every((i) => i.status === 'failed' && i.error === 'multiCancelled'));
  assert.equal(listeners.size, 0);
  assert.equal(closed.length, 4);
  assert.throws(() => startMulti({ urls: [3] }), /multiEmpty/);
});
