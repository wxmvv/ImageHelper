import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeExtension } from './fake-extension.ts';
import {
  readSettings,
  writeSettings,
  readSession,
  writeSession,
  removeSession,
} from '../src/platform/storage.ts';
import { registerHandlers, sendToBackground, broadcast } from '../src/platform/rpc.ts';

test('storage falls back from rejected session storage and normalizes settings', async (context) => {
  const fake = fakeExtension();
  context.mock.method(console, 'warn', () => {});
  fake.localData.settings = { minWidth: 500, theme: 'invalid' };
  assert.equal((await readSettings()).minWidth, 500);
  assert.equal((await writeSettings({ language: 'zh_CN' })).theme, 'auto');
  assert.equal((await readSettings()).language, 'zh_CN');
  await writeSession('one', { value: 1 });
  assert.deepEqual(fake.sessionData.one, { value: 1 });
  fake.localData.recovered = { value: 3 };
  assert.deepEqual(await readSession('recovered'), { value: 3 });
  fake.api.storage.session.get = async () => {
    throw new Error('unavailable');
  };
  fake.api.storage.session.set = async () => {
    throw new Error('unavailable');
  };
  await writeSession('fallback', { value: 2 });
  assert.deepEqual(fake.localData.fallback, { value: 2 });
  assert.deepEqual(await readSession('fallback'), { value: 2 });
  await removeSession('fallback');
  assert.equal(await readSession('fallback'), null);
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true });
  assert.equal(await readSession('missing'), null);
  assert.equal((await readSettings()).maxImagesPerPage, 5000);
  await writeSession('missing', true);
});

test('RPC envelopes, errors, duplicate handlers, missing responses and timeout', async (context) => {
  const fake = fakeExtension();
  registerHandlers({
    echo: (payload) => payload,
    fail: () => {
      throw new Error('handler failed');
    },
  });
  assert.deepEqual(await sendToBackground('echo', { value: 42 }), { value: 42 });
  await assert.rejects(sendToBackground('fail', {}), /handler failed/);
  assert.throws(() => registerHandlers({ echo: () => null }), /Duplicate handler/);
  await assert.rejects(sendToBackground('missing', {}), /Background did not respond/);
  fake.api.runtime.sendMessage = async () => {
    throw new Error('No receiver');
  };
  broadcast('session:reset', { tabId: 1 });
  await assert.rejects(sendToBackground('echo', {}), /Background did not respond/);
  context.mock.timers.enable({ apis: ['setTimeout'] });
  fake.api.runtime.sendMessage = () => new Promise(() => {});
  const pending = assert.rejects(sendToBackground('echo', {}), /timeout: echo/);
  context.mock.timers.tick(8000);
  await pending;
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true });
  await assert.rejects(sendToBackground('echo', {}), /Background unavailable/);
});
