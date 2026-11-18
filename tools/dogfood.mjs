// Dogfood run against a real site: extract, summarize sources and capture the grid.
// Usage: node tools/dogfood.mjs "https://example.com/gallery"
import path from 'node:path';
import { launch, waitForExtensionId } from './chrome.mjs';
import { bg, findTabId, openExtensionPage, waitFor } from './e2e/lib.mjs';

const url = process.argv[2];
if (!url) {
  console.error('usage: node tools/dogfood.mjs <url>');
  process.exit(2);
}
const waitMs = Number(process.argv[3] || 4000);

const browser = await launch(path.resolve('dist'), { profile: '.ref/profile-dogfood' });
try {
  const id = await waitForExtensionId(browser);
  const ext = await openExtensionPage(browser, id);
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, waitMs));

  // Let the extension scroll the page to trigger lazy loading.
  const tabId = await findTabId(ext, new URL(url).host);
  await bg(ext, 'extract:start', { tabId });
  await bg(ext, 'page:autoscroll', { tabId });
  await new Promise((r) => setTimeout(r, 8000));

  const session = (await bg(ext, 'session:get', { tabId })).session;
  const bySource = {};
  for (const image of session.images) bySource[image.source] = (bySource[image.source] || 0) + 1;
  const withSize = session.images.filter((i) => i.width && i.height).length;
  const withBytes = session.images.filter((i) => i.bytes).length;
  console.log(JSON.stringify({ url, total: session.images.length, withSize, withBytes, bySource }, null, 2));
  console.log(
    session.images
      .slice(0, 12)
      .map(
        (i) =>
          `${i.ext}\t${i.width ?? '?'}x${i.height ?? '?'}\t${i.bytes ?? '?'}B\t${i.source}\t${i.url.slice(0, 90)}`,
      )
      .join('\n'),
  );

  const extractor = await waitFor(
    async () => (await browser.pages()).find((p) => p.url().includes('extractor.html')),
    {
      label: 'extractor',
    },
  );
  await extractor.setViewport({ width: 1440, height: 900 });
  await waitFor(() => extractor.$('.ih-card'), { label: 'cards', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2500));
  const out = `.ref/shots/dogfood-${new URL(url).host.replace(/\W+/g, '-')}.png`;
  await extractor.screenshot({ path: out });
  console.log('screenshot:', out);
} finally {
  await browser.close();
}
