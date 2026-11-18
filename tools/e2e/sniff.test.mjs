import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
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
const profile = await mkdtemp(path.join(os.tmpdir(), 'ih-sniff-'));
let browser;
try {
  browser = await launch(path.join(ROOT, 'dist'), { profile, headless: true });
  const extensionId = await waitForExtensionId(browser);
  const rpc = await openExtensionPage(browser, extensionId);
  assert.equal((await bg(rpc, 'settings:get')).scanPageHook, true);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${FIXTURE_BASE}/basic.html`, { waitUntil: 'networkidle0' });
  const tabId = await findTabId(rpc, '/basic.html');
  const before = await bg(rpc, 'session:get', { tabId });
  assert.equal(before.session.images.length, 0, 'capture stays buffered before activation');
  assert.equal((await bg(rpc, 'extract:rescan', { tabId })).frames, 1);
  const session = await waitFor(
    async () => {
      const { session } = await bg(rpc, 'session:get', { tabId });
      return session.images.length >= 9 &&
        session.images.some(
          (image) => image.url.endsWith('/dot-10.png') && image.width === 10 && image.bytes > 0,
        )
        ? session
        : null;
    },
    { label: 'nine images with natural dimensions and timing bytes' },
  );
  const expected = [
    'big-512.png',
    'small-128.png',
    'photo-400x300.webp',
    'photo-300x200.jpg',
    'tiny-64.gif',
    'circle.png',
    'photo-640x480.png',
    'wide-1200x800.png',
    'dot-10.png',
  ];
  for (const name of expected)
    assert.ok(
      session.images.some((image) => image.url === `${FIXTURE_BASE}/img/${name}`),
      name,
    );
  assert.equal(new Set(session.images.map((image) => image.url)).size, session.images.length);
  assert.equal(session.images.find((image) => image.url.endsWith('/photo-300x200.jpg')).hidden, true);
  const dot = session.images.find((image) => image.url.endsWith('/dot-10.png'));
  assert.equal(dot.bytes, (await stat(path.join(ROOT, 'tools/fixtures/site/img/dot-10.png'))).size);
  await page.click('#load-fetch');
  const fetched = await waitFor(
    async () => {
      const { session } = await bg(rpc, 'session:get', { tabId });
      return session.images.some(
        (image) =>
          image.url === 'https://example.com/remote/poster.jpg?w=800' && image.source === 'page-hook',
      )
        ? session
        : null;
    },
    { label: 'fetch response-only URL from MAIN world hook' },
  );
  assert.ok(fetched.images.some((image) => image.url.endsWith('/photo-640x480.png')));
  await page.click('#load-dynamic');
  await waitFor(
    async () =>
      (await bg(rpc, 'session:get', { tabId })).session.images.some((image) =>
        image.url.endsWith('big-512.png?dynamic=1'),
      ),
    { label: 'dynamic Image.src' },
  );
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/xhr-images.json');
      xhr.responseType = 'json';
      xhr.onload = resolve;
      xhr.onerror = reject;
      xhr.send();
    });
    const img = new Image();
    img.setAttribute('src', '/img/circle.png?attribute=1');
  });
  await waitFor(
    async () =>
      (await bg(rpc, 'session:get', { tabId })).session.images.some(
        (image) => image.url.endsWith('circle.png?attribute=1') && image.source === 'page-hook',
      ),
    { label: 'detached setAttribute hook' },
  );
  await waitFor(
    async () =>
      (await bg(rpc, 'session:get', { tabId })).session.images.some(
        (image) => image.url.endsWith('photo-640x480.png?xhr=1') && image.source === 'page-hook',
      ),
    { label: 'XHR response-only URL' },
  );
  const final = (await bg(rpc, 'session:get', { tabId })).session;
  assert.equal(new Set(final.images.map((image) => image.url)).size, final.images.length);
  console.log(
    'Extracted image URLs:\n' +
      final.images
        .map((image) => image.url)
        .sort()
        .join('\n'),
  );
  console.log(
    `PASS basic sniff: ${final.images.length} unique URLs; dot width=${dot.width}, bytes=${dot.bytes}; hidden image preserved; fetch, XHR and Image hooks passed`,
  );
  const regression = await browser.newPage();
  await regression.goto(`${FIXTURE_BASE}/sniff-frame.html`, { waitUntil: 'networkidle0' });
  const regressionId = await findTabId(rpc, '/sniff-frame.html');
  await regression.evaluate(() => {
    const iframe = document.createElement('iframe');
    iframe.src = '/sniff-frame.html?child=1';
    document.body.append(iframe);
  });
  const child = await waitFor(() => regression.frames().find((frame) => frame.url().includes('?child=1')), {
    label: 'child frame navigation',
  });
  await child.waitForFunction(() => document.readyState === 'complete');
  await bg(rpc, 'extract:rescan', { tabId: regressionId });
  await child.evaluate(async () => {
    await fetch('/api/images.json');
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/xhr-images.json');
      xhr.onload = resolve;
      xhr.onerror = reject;
      xhr.send();
    });
  });
  await waitFor(
    async () => {
      const { session } = await bg(rpc, 'session:get', { tabId: regressionId });
      return ['poster.jpg?w=800', 'photo-640x480.png?xhr=1'].every((suffix) =>
        session.images.some(
          (image) =>
            image.url.endsWith(suffix) && image.source === 'page-hook' && image.frameUrl.endsWith('?child=1'),
        ),
      );
    },
    { label: 'iframe fetch and XHR hooks' },
  );
  await regression.evaluate(() => {
    for (let group = 0; group < 2; group++) {
      const img = document.createElement('img');
      img.sizes = '1px';
      img.srcset = Array.from(
        { length: 15 },
        (_, index) => `/img/dot-10.png?candidate=${group * 15 + index + 1} ${index + 1}w`,
      ).join(', ');
      document.body.append(img);
    }
  });
  await bg(rpc, 'extract:rescan', { tabId: regressionId });
  const candidates = await waitFor(
    async () => {
      const { session } = await bg(rpc, 'session:get', { tabId: regressionId });
      return session.images.filter((image) => image.url.includes('?candidate=')).length >= 24
        ? session.images
        : null;
    },
    { label: 'srcset candidates reported' },
  );
  for (let index = 1; index <= 24; index++)
    assert.ok(
      candidates.some((image) => image.url.endsWith(`?candidate=${index}`)),
      `candidate ${index}`,
    );
  for (let index = 25; index <= 30; index++)
    assert.ok(
      !candidates.some((image) => image.url.endsWith(`?candidate=${index}`)),
      `capped candidate ${index}`,
    );
  console.log('PASS regressions: iframe fetch/XHR hooks; all srcset candidates with a page-wide cap of 24');
  const lazy = await browser.newPage();
  await lazy.goto(`${FIXTURE_BASE}/lazy.html`, { waitUntil: 'networkidle0' });
  const lazyId = await findTabId(rpc, '/lazy.html');
  await bg(rpc, 'extract:rescan', { tabId: lazyId });
  await bg(rpc, 'page:autoscroll', { tabId: lazyId });
  await waitFor(
    () => lazy.evaluate(() => [...document.querySelectorAll('img')].every((img) => img.naturalWidth > 0)),
    { label: 'auto-scroll loads all lazy images' },
  );
  assert.ok(await lazy.evaluate(() => scrollY > 0));
  assert.deepEqual(errors, []);
  console.log('PASS auto-scroll: all lazy images loaded; scroll position retained');
} finally {
  await browser?.close();
  await stopFixtureServer(fixture);
  await rm(profile, { recursive: true, force: true });
}
