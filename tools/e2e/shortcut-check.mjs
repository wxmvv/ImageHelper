import assert from 'node:assert/strict';
import { bg, waitFor } from './lib.mjs';

export async function verifyShortcuts({ options, source, rpc, browser, tabId }) {
  await options.click('a[href="#optShortcuts"]');
  await options.waitForSelector('a[href="#optShortcuts"][aria-current="location"]');
  await options.waitForFunction(() => {
    const el = document.querySelector('a[href="#optShortcuts"][aria-current="location"]');
    return el && getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)';
  });
  const selectionStyle = await options.$eval('a[aria-current="location"]', (el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, border: css.borderLeftWidth };
  });
  assert.notEqual(selectionStyle.background, 'rgba(0, 0, 0, 0)');
  assert.equal(selectionStyle.border, '0px');
  assert.equal(await options.$eval('#extraction-shortcut', (el) => el.value), 'Alt+Shift+Y');
  await options.click('#extraction-shortcut');
  await options.keyboard.press('j');
  assert.match(await options.$eval('#shortcut-status', (el) => el.textContent), /Ctrl/);
  await options.keyboard.down('Alt');
  await options.keyboard.down('Shift');
  await options.keyboard.press('KeyU');
  await options.keyboard.up('Shift');
  await options.keyboard.up('Alt');
  await waitFor(() =>
    options.evaluate(
      async () => (await chrome.storage.local.get('settings')).settings.extractionShortcut === 'Alt+Shift+U',
    ),
  );
  await options.reload();
  await options.waitForFunction(
    () => document.querySelector('#extraction-shortcut')?.value === 'Alt+Shift+U',
  );
  await source.bringToFront();
  await source.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'shortcut-test-input';
    document.body.prepend(input);
    input.focus();
  });
  const pressShortcut = async () => {
    await source.keyboard.down('Alt');
    await source.keyboard.down('Shift');
    await source.keyboard.press('KeyU');
    await source.keyboard.up('Shift');
    await source.keyboard.up('Alt');
  };
  await pressShortcut();
  assert.equal(
    (await rpc.evaluate(() => chrome.tabs.query({}))).some((tab) => tab.url?.includes('extractor.html')),
    false,
  );
  await source.$eval('#shortcut-test-input', (el) => el.blur());
  await pressShortcut();
  const shortcutExtractor = await waitFor(async () =>
    (await browser.pages()).find((page) => page.url().includes(`extractor.html?tabId=${tabId}`)),
  );
  await shortcutExtractor.waitForSelector('[data-action="rescan"]');
  await waitFor(async () => (await bg(rpc, 'session:get', { tabId })).session.images.length > 0);
  await shortcutExtractor.close();
  await options.bringToFront();
  await options.click('a[href="#optShortcuts"]');
  await options.click('[data-action="clear-shortcut"]');
  await waitFor(() =>
    options.evaluate(
      async () => (await chrome.storage.local.get('settings')).settings.extractionShortcut === '',
    ),
  );
  await options.reload();
  await options.waitForFunction(() => document.querySelector('#extraction-shortcut')?.value === '');
  assert.equal(await options.$eval('#extraction-shortcut', (el) => el.placeholder.length > 0), true);
  await options.evaluate(() => scrollTo(0, 0));
  console.log(
    'PASS shortcuts: record, validation, persistence, input exclusion, real extraction, clear; sidebar uses fill without a left border',
  );
}
