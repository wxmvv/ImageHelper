import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { registerCommands } from '../src/background/commands.ts';

test('clearing the extraction shortcut also disables the browser command', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  let settings: Record<string, unknown> = { extractionShortcut: '' };
  let listener: ((command: string) => void) | undefined;
  let queries = 0;
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      commands: {
        onCommand: {
          addListener: (callback: (command: string) => void) => {
            listener = callback;
          },
        },
      },
      storage: { local: { get: async () => ({ settings }) } },
      tabs: {
        query: async () => {
          queries++;
          return [];
        },
      },
    },
  });
  try {
    registerCommands();
    assert.ok(listener);
    listener('extract-current-page');
    await setImmediate();
    assert.equal(queries, 0);
    settings = {};
    listener('extract-current-page');
    await setImmediate();
    assert.equal(queries, 1);
    listener('unrelated-command');
    await setImmediate();
    assert.equal(queries, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'chrome', original);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});
