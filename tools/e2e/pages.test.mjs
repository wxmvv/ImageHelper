import assert from 'node:assert/strict';
import { verifyShortcuts } from './shortcut-check.mjs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launch, waitForExtensionId } from '../chrome.mjs';
import {
  startFixtureServer,
  stopFixtureServer,
  openExtensionPage,
  bg,
  waitFor,
  findTabId,
  FIXTURE_BASE,
  ROOT,
} from './lib.mjs';

const fixture = await startFixtureServer();
const profile = await mkdtemp(path.join(os.tmpdir(), 'ih-pages-'));
const downloads = await mkdtemp(path.join(os.tmpdir(), 'ih-pages-download-'));
let browser;
try {
  browser = await launch(path.join(ROOT, 'dist'), { profile, headless: true });
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  const id = await waitForExtensionId(browser);
  const rpc = await openExtensionPage(browser, id);
  await rpc.evaluate(() => chrome.storage.local.set({ settings: { language: 'en', theme: 'light' } }));
  const source = await browser.newPage();
  await source.goto(`${FIXTURE_BASE}/basic.html`, { waitUntil: 'networkidle0' });
  const tabId = await findTabId(rpc, '/basic.html');
  const errors = [];
  const open = async (name) => {
    const page = await openExtensionPage(browser, id, name);
    page.on('pageerror', (error) => errors.push(error.message));
    return page;
  };
  await mkdir(path.join(ROOT, '.ref/shots'), { recursive: true });
  // A background extension tab observes the real active source, as an action popup does.
  const popup = await browser.newPage();
  await popup.setViewport({ width: 380, height: 300 });
  await source.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForSelector('.ih-popup__cta');
  assert.equal(await popup.$eval('.ih-popup__cta', (el) => el.disabled), false);
  assert.match(await popup.$eval('.ih-popup__host', (el) => el.textContent), /127\.0\.0\.1/);
  assert.equal(await popup.$eval('.ih-popup__cta', (el) => el.offsetHeight), 38);
  assert.equal(await popup.$$eval('kbd', (keys) => keys.length), 3);
  const popupHeight = await popup.$eval('.ih-popup', (el) => Math.ceil(el.getBoundingClientRect().height));
  await popup.screenshot({
    path: path.join(ROOT, '.ref/shots/ours-popup.png'),
    clip: { x: 0, y: 0, width: 380, height: popupHeight },
  });
  const restricted = await browser.newPage();
  await restricted.goto('chrome://version');
  await restricted.bringToFront();
  await popup.reload();
  await popup.waitForSelector('.ih-popup__cta:disabled');
  console.log('PASS popup: source title/host, CTA, restricted chrome://version, screenshot');

  const options = await open('options.html');
  await options.waitForSelector('[data-setting="theme"][data-value="dark"]');
  await options.waitForSelector('a[href="#optSniff"][aria-current="location"]');
  assert.equal(await options.$eval('[name="minBytes"]', (el) => el.value), '0');
  assert.equal(await options.$eval('[name="minBytes"]', (el) => el.offsetWidth), 88);
  assert.equal(await options.$eval('[name="namingTemplate"]', (el) => el.value), '{name}.{ext}');
  assert.equal(await options.$eval('#preview', (el) => el.textContent), 'photo-640x480.png');
  await options.setViewport({ width: 1440, height: 700 });
  await options.click('a[href="#optSize"]');
  await options.waitForSelector('a[href="#optSize"][aria-current="location"]');
  await options.click('a[href="#optAbout"]');
  await options.waitForSelector('a[href="#optAbout"][aria-current="location"]');
  await options.waitForFunction(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 1);
  await options.evaluate(() => scrollTo(0, 0));
  await options.waitForSelector('a[href="#optSniff"][aria-current="location"]');
  await options.hover('.ih-options__heading');
  await options.screenshot({ path: path.join(ROOT, '.ref/shots/ours-options.png'), fullPage: true });
  console.log(
    'PASS P4.5 options: scroll navigation, 88px numbers, zero minimum and dimension naming preview',
  );
  const transparency = '[name="transparentPopup"]';
  const popupBackground = () => popup.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const opaque = await popupBackground();
  const transparent = 'rgba(0, 0, 0, 0)';
  assert.notEqual(opaque, transparent);
  assert.equal(await options.$eval(transparency, (el) => el.checked), false);
  await options.click(transparency);
  await waitFor(async () => (await popupBackground()) === transparent, { label: 'transparent popup' });
  assert.equal(await options.evaluate(() => getComputedStyle(document.body).backgroundColor), opaque);
  await popup.reload();
  await popup.waitForSelector('.ih-popup');
  assert.equal(await popupBackground(), transparent);
  await popup.bringToFront();
  const secondary = '.ih-popup__links [data-action="multi"]';
  await popup.$eval(secondary, (link) => {
    link.style.transition = 'none';
  });
  await popup.hover(secondary);
  const glass = await popup.$eval(secondary, (link) => {
    const key = document.querySelector('.ih-popup__hint kbd');
    const foreground = getComputedStyle(document.body).color;
    const context = document.createElement('canvas').getContext('2d');
    const hasTranslucentBackground = (element) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      const alpha = context.getImageData(0, 0, 1, 1).data[3];
      return alpha > 0 && alpha < 255;
    };
    return {
      legible: [link, key, document.querySelector('.ih-popup__hint')].every(
        (element) => getComputedStyle(element).color === foreground,
      ),
      hover: hasTranslucentBackground(link),
      keycap: hasTranslucentBackground(key),
    };
  });
  assert.deepEqual(glass, { legible: true, hover: true, keycap: true });
  await options.bringToFront();
  await options.reload();
  await options.waitForSelector(`${transparency}:checked`);
  await options.click(transparency);
  await waitFor(async () => (await popupBackground()) === opaque, { label: 'opaque popup' });
  console.log(
    'PASS popup appearance: transparent switch persists and restores background, with readable labels and translucent hover and keycaps',
  );
  await options.click('[data-setting="theme"][data-value="dark"]');
  await options.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await waitFor(() =>
    options.evaluate(async () => (await chrome.storage.local.get('settings')).settings.theme === 'dark'),
  );
  await options.$eval('[name="minWidth"]', (el) => {
    el.value = '-1';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await options.$eval('[name="minWidth"]', (el) => el.value), '0');
  await options.$eval('[name="minBytes"]', (el) => {
    el.value = '12';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitFor(() =>
    options.evaluate(async () => (await chrome.storage.local.get('settings')).settings.minBytes === 12288),
  );
  await options.$eval('[name="namingTemplate"]', (el) => {
    el.value = '{host}_{index}.{ext}';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await options.$eval('#preview', (el) => el.textContent), 'example.com_001.png');
  await options.select('[name="language"]', 'zh_CN');
  await options.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  await waitFor(
    () => popup.evaluate(() => document.querySelector('.ih-popup__cta').textContent.includes('提取')),
    { label: 'popup Chinese' },
  ).catch(async (error) => {
    console.error(
      await popup.evaluate(async () => ({
        lang: document.documentElement.lang,
        text: document.body.textContent,
        storage: await chrome.storage.local.get('settings'),
      })),
    );
    throw error;
  });
  await options.select('[name="language"]', 'en');
  await options.waitForFunction(() => document.documentElement.lang === 'en');
  await options.evaluate(() => scrollTo(0, 0));
  await waitFor(() =>
    options.evaluate(async () => (await chrome.storage.local.get('settings')).settings.language === 'en'),
  );
  console.log(
    'PASS options: immediate dark theme and persisted settings, invalid width, KB conversion, live naming preview, cross-page i18n',
  );

  await verifyShortcuts({ options, source, rpc, browser, tabId });

  const multi = await open('multiurl.html');
  await multi.waitForSelector('textarea');
  assert.equal(await multi.$eval('textarea', (el) => el.offsetHeight), 150);
  assert.equal(await multi.$eval('[data-action="download"]', (el) => el.disabled), true);
  await multi.type('textarea', `${FIXTURE_BASE}/basic.html\n${FIXTURE_BASE}/basic.html?second=1`);
  await multi.click('[data-action="start"]');
  await multi.waitForSelector('progress');
  assert.equal(await multi.$eval('progress', (el) => el.offsetWidth), 180);
  assert.equal(await multi.$eval('progress', (el) => el.max), 2);
  await multi.waitForFunction(() => document.querySelectorAll('tr[data-status="done"]').length === 2, {
    timeout: 45000,
  });
  const runId = new URL(multi.url()).searchParams.get('runId');
  const run = await waitFor(async () => {
    const value = await bg(rpc, 'multi:status', { runId });
    return value.finishedAt ? value : null;
  });
  assert.ok(run.items.every((item) => item.status === 'done' && item.images > 0));
  const merged = (await bg(rpc, 'multi:images', { runId })).images;
  assert.equal(new Set(merged.map((i) => i.url)).size, merged.length);
  const tabs = await rpc.evaluate(() => chrome.tabs.query({}));
  assert.ok(
    run.items.every((item) => !tabs.some((tab) => tab.id === item.tabId)),
    'temporary tabs closed',
  );
  await multi.waitForSelector('[data-action="download"]:not([disabled])');
  assert.deepEqual(
    await multi.$$eval('th', (cells) => cells.slice(1).map((cell) => cell.offsetWidth)),
    [90, 80, 120],
  );
  assert.equal(
    await multi.$eval('.ih-multi__results', (el) => el.getBoundingClientRect().bottom < innerHeight),
    true,
  );
  assert.equal(await multi.$eval('tbody tr', (el) => el.offsetHeight), 44);
  console.log('PASS P4.5 multi: 150px input, 180px progress, fixed columns, 44px rows and visible results');
  await multi.screenshot({ path: path.join(ROOT, '.ref/shots/ours-multiurl.png'), fullPage: true });
  await multi.click('[data-action="download"]');
  const download = await waitFor(
    () =>
      rpc.evaluate(async () =>
        (await chrome.downloads.search({})).find(
          (d) => d.filename.endsWith('.zip') && d.state === 'complete',
        ),
      ),
    { timeout: 30000, label: 'multi ZIP' },
  );
  const zip = await readFile(download.filename);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const entryName = zip.subarray(30, 30 + zip.readUInt16LE(26)).toString();
  assert.ok(
    entryName.startsWith(`127.0.0.1:${new URL(FIXTURE_BASE).port}`.replace(':', '')),
    `host folder: ${entryName}`,
  );
  console.log(
    `PASS multi: two pages (${run.items.map((i) => i.images).join(', ')} images), ${merged.length} deduplicated, tabs closed, host-folder ZIP (${zip.length} bytes)`,
  );
  await multi.reload();
  await multi.waitForFunction(() => document.querySelectorAll('tr[data-status="done"]').length === 2);
  const detached = await bg(rpc, 'multi:start', {
    urls: [`${FIXTURE_BASE}/basic.html?detached=1`, 'chrome://version'],
  });
  const observer = await open(`multiurl.html?runId=${detached.runId}`);
  await observer.close();
  const detachedRun = await waitFor(
    async () => {
      const status = await bg(rpc, 'multi:status', detached);
      return status.finishedAt && status;
    },
    { timeout: 30000 },
  );
  assert.equal(detachedRun.items[0].status, 'done');
  assert.equal(detachedRun.items[1].status, 'failed');
  const cancelled = await bg(rpc, 'multi:start', {
    urls: Array.from({ length: 8 }, (_, n) => `${FIXTURE_BASE}/basic.html?cancel=${n}`),
  });
  await bg(rpc, 'multi:cancel', cancelled);
  const cancelledRun = await waitFor(async () => {
    const status = await bg(rpc, 'multi:status', cancelled);
    return status.finishedAt && status;
  });
  assert.ok(cancelledRun.items.every((item) => item.status === 'done' || item.status === 'failed'));
  console.log(
    'PASS multi: reload recovery, closed-page continuation, restricted-page failure and cancellation',
  );

  // Reset filter defaults so the existing fixture grid is visible.
  await rpc.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, minBytes: 0 } });
  });
  const extractor = await open(`extractor.html?tabId=${tabId}`);
  await extractor.waitForSelector('.ih-card');
  await extractor.screenshot({ path: path.join(ROOT, '.ref/shots/ours-extractor.png'), fullPage: true });
  await options.select('[name="language"]', 'zh_CN');
  await extractor.waitForFunction(() =>
    document.querySelector('[data-action="rescan"]').textContent.includes('重新'),
  );
  await options.select('[name="language"]', 'en');
  await extractor.waitForFunction(() =>
    document.querySelector('[data-action="rescan"]').textContent.includes('Rescan'),
  );
  assert.deepEqual(errors, []);
  console.log('PASS extractor: screenshot and immediate language updates');
  console.log('Screenshots: .ref/shots/ours-{popup,options,multiurl,extractor}.png');
} finally {
  await browser?.close();
  await stopFixtureServer(fixture);
  await rm(profile, { recursive: true, force: true });
  await rm(downloads, { recursive: true, force: true });
}
