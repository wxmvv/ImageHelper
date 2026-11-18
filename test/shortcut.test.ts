import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isShortcut, shortcutFromKey } from '../src/core/shortcut.ts';
import { normalizeSettings } from '../src/core/settings.ts';

test('extraction shortcuts require modifiers and use physical keys for Option and keyboard layouts', () => {
  const key = { code: 'KeyY', ctrlKey: false, altKey: true, shiftKey: true, metaKey: false };
  assert.equal(shortcutFromKey(key), 'Alt+Shift+Y');
  assert.equal(shortcutFromKey({ ...key, altKey: false }), null);
  assert.equal(shortcutFromKey({ ...key, code: 'AltLeft' }), null);
  assert.equal(shortcutFromKey({ ...key, code: 'Digit1', metaKey: true }), 'Alt+Shift+Command+1');
  assert.equal(shortcutFromKey({ ...key, code: 'KeyK', ctrlKey: true }), 'Ctrl+Alt+Shift+K');
  for (const value of ['', 'Y', 'Shift+Y', 'Alt+Alt+Y', 'Alt+Enter', null])
    assert.equal(isShortcut(value), false);
  assert.equal(normalizeSettings({ extractionShortcut: 'Alt+Shift+Y' }).extractionShortcut, 'Alt+Shift+Y');
  assert.equal(normalizeSettings({ extractionShortcut: 'bad' }).extractionShortcut, 'Alt+Shift+Y');
  assert.equal(normalizeSettings({ extractionShortcut: '' }).extractionShortcut, '');
  assert.equal(normalizeSettings({}).extractionShortcut, 'Alt+Shift+Y');
  assert.equal(normalizeSettings(null).extractionShortcut, 'Alt+Shift+Y');
});
