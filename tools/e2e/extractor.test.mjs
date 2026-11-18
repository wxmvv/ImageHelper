import assert from 'node:assert/strict';
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
const profile = await mkdtemp(path.join(os.tmpdir(), 'ih-extractor-'));
const downloadDir = await mkdtemp(path.join(os.tmpdir(), 'ih-downloads-'));
let browser;
try {
  browser = await launch(path.join(ROOT, 'dist'), { profile, headless: true });
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  const extensionId = await waitForExtensionId(browser);
  const rpc = await openExtensionPage(browser, extensionId);
  await rpc.evaluate(() => chrome.storage.local.set({ settings: { theme: 'dark', language: 'en' } }));
  const source = await browser.newPage();
  await source.goto(`${FIXTURE_BASE}/basic.html`, { waitUntil: 'networkidle0' });
  const tabId = await findTabId(rpc, '/basic.html');
  const page = await openExtensionPage(browser, extensionId, `extractor.html?tabId=${tabId}`);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForFunction(() => document.querySelectorAll('.ih-card').length >= 9);
  await page.waitForFunction(() => !document.querySelector('[data-action="rescan"]').disabled);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.ih-card__thumb')].every((img) => img.complete),
  );
  await page.waitForFunction(() => document.querySelector('.ih-loaded').hidden);
  const total = await page.$$eval('.ih-card', (els) => els.length);
  assert.ok(await page.$('.ih-card__dimensions'));
  await mkdir(path.join(ROOT, '.ref/shots'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, '.ref/shots/ours-extractor.png'), fullPage: true });
  await page.click('.ih-card');
  await page.waitForFunction(
    () =>
      document.querySelector('.ih-selectionbar').dataset.count === '1' &&
      !document.querySelector('.ih-selectionbar').hidden,
  );
  await page.click('[data-action="select-all"]');
  await page.waitForFunction(
    (n) => document.querySelector('.ih-selectionbar').dataset.count === String(n),
    {},
    total,
  );
  await page.click('[data-format="png"]');
  await page.waitForFunction(
    (n) => {
      const count = document.querySelectorAll('.ih-card').length;
      return count > 0 && count < n;
    },
    {},
    total,
  );
  await page.keyboard.press('v');
  await page.waitForSelector('.ih-lightbox:not([hidden])');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'ih-lightbox');
  assert.equal(await page.$eval('.ih-lightbox__prev', (el) => el.disabled), true);
  const before = await page.$eval('.ih-lightbox__info', (el) => el.textContent);
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await page.$eval('.ih-lightbox__info', (el) => el.textContent), before);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.ih-lightbox[hidden]');
  await page.click('[data-action="clear"]');
  const cards = await page.$$('.ih-card');
  await cards[0].click();
  await cards[1].click();
  await page.waitForFunction(() => document.querySelector('.ih-selectionbar').dataset.count === '2');
  await page.click('.ih-header [data-action="download"]');
  await waitFor(
    () =>
      rpc.evaluate(async () =>
        (await chrome.downloads.search({})).find(
          (d) => d.filename.endsWith('.zip') && d.state === 'complete',
        ),
      ),
    { label: 'completed ZIP download' },
  );
  await page.waitForSelector('.ih-progress[hidden]');
  const downloads = await rpc.evaluate(() => chrome.downloads.search({}));
  assert.equal(downloads.length, 1);
  const zip = await readFile(downloads[0].filename);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), 2, 'two ZIP entries');
  // Entry names must be based on the *source* page, not on the extractor tab's own title.
  const nameLength = zip.readUInt16LE(26);
  const firstEntry = zip.subarray(30, 30 + nameLength).toString('utf8');
  assert.match(firstEntry, /^127\.0\.0\.1-8123-ImageHelper Fixture/, `unexpected ZIP folder: ${firstEntry}`);
  assert.ok(!firstEntry.includes('Image extractor'), 'ZIP folder used the extractor title');
  console.log(
    `PASS extractor: ${total} cards; dimension badges, selection, PNG filter, preview navigation and two-image ZIP (${zip.length} bytes)`,
  );
  // Shift selection, keyboard and persistence are exercised against the same live grid.
  await page.click('[data-action="clear"]');
  await cards[0].click();
  await page.keyboard.down('Shift');
  await cards[2].click();
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => document.querySelector('.ih-selectionbar').dataset.count === '3');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.ih-selectionbar[hidden]');
  await page.reload();
  await page.waitForSelector('[data-format="png"].ih-chip--on');
  await page.waitForSelector('.ih-card');
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement.placeholder), 'contains');
  await page.keyboard.type('no-match-anywhere');
  await page.waitForSelector('.ih-empty');
  await page.click('[data-action="reset"]');
  await page
    .waitForFunction((n) => document.querySelectorAll('.ih-card').length === n, {}, total)
    .catch(async (error) => {
      console.error(
        await page.evaluate(() => ({
          cards: document.querySelectorAll('.ih-card').length,
          text: document.querySelector('.ih-empty')?.textContent,
          filter: [...document.querySelectorAll('.ih-filters input')].map((i) => i.value),
        })),
      );
      throw error;
    });
  console.log(
    'PASS extractor: Shift range, Escape, persisted filter, search shortcut, empty state and reset',
  );
  let hashWorkers = 0;
  page.on('workercreated', (worker) => {
    if (worker.url().endsWith('/hash-worker.js')) hashWorkers++;
  });
  await page.click('[data-dedupe="similar"]');
  await page.waitForSelector('.ih-card__group:not([hidden])');
  await page.waitForFunction(() => document.querySelector('.ih-hashing').textContent === '6');
  assert.equal(hashWorkers, 2, 'two hashing workers');
  const collapsed = await page.$$eval('.ih-card', (els) => els.length);
  assert.ok(collapsed < total);
  await page.click('.ih-card__group:not([hidden])');
  await page.waitForFunction((count) => document.querySelectorAll('.ih-card').length > count, {}, collapsed);
  await page.click('[data-dedupe="off"]');
  await page.waitForFunction((count) => document.querySelectorAll('.ih-card').length === count, {}, total);
  console.log('PASS similarity: two hash workers, largest-image grouping, expand and dedupe off');
  // Simulate a live broadcast to measure the first rendered slice of a large session.
  const session = (await bg(rpc, 'session:get', { tabId })).session;
  const records = Array.from({ length: 1400 }, (_, index) => ({
    ...session.images[index % session.images.length],
    id: `stress-${index}`,
    url: `${FIXTURE_BASE}/img/dot-10.png?stress=${index}`,
    discoveredAt: index,
  }));
  await page.evaluate(() => {
    document.querySelector('#grid').replaceChildren();
  });
  await page.evaluate(() => {
    const start = performance.now();
    const observer = new MutationObserver(() => {
      if (document.querySelectorAll('.ih-card').length >= 60) {
        observer.disconnect();
        document.querySelector('#grid').dataset.firstPaint = String(performance.now() - start);
      }
    });
    observer.observe(document.querySelector('#grid'), { childList: true });
  });
  await rpc.evaluate(
    async ({ tabId, records, pageInfo }) => {
      await chrome.runtime.sendMessage({ __ih: 1, type: 'session:reset', payload: { tabId } });
      await chrome.runtime.sendMessage({
        __ih: 1,
        type: 'session:images',
        payload: { tabId, rev: 99999, page: pageInfo, images: records },
      });
    },
    { tabId, records, pageInfo: session.page },
  );
  await page.waitForFunction(() => document.querySelector('#grid').dataset.firstPaint);
  const firstPaint = await page.$eval('#grid', (el) => Number(el.dataset.firstPaint));
  assert.ok(firstPaint < 300, `first slice took ${firstPaint}ms`);
  await page.waitForFunction(() => document.querySelectorAll('.ih-card').length === 1400);
  const scrollDuration = await page.evaluate(async () => {
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      scrollBy(0, 600);
      await new Promise(requestAnimationFrame);
    }
    return performance.now() - start;
  });
  assert.ok(scrollDuration < 1000, `scroll frames took ${scrollDuration}ms`);
  assert.deepEqual(errors, []);
  console.log(
    `PASS performance: 1400 cards; first slice ${firstPaint.toFixed(1)} ms; 10 scroll frames ${scrollDuration.toFixed(1)} ms`,
  );
  console.log('Screenshot: .ref/shots/ours-extractor.png');
} finally {
  await browser?.close();
  await stopFixtureServer(fixture);
  await rm(profile, { recursive: true, force: true });
  await rm(downloadDir, { recursive: true, force: true });
}
