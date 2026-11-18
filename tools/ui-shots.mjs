// Design review harness: drives the real extractor and captures UI states for inspection.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { launch, waitForExtensionId } from './chrome.mjs';
import {
  bg,
  findTabId,
  openExtensionPage,
  startFixtureServer,
  stopFixtureServer,
  waitFor,
  FIXTURE_BASE,
} from './e2e/lib.mjs';

const OUT = '.ref/shots';
await mkdir(OUT, { recursive: true });
const browser = await launch(path.resolve('dist'), { profile: '.ref/profile-ui' });
const server = await startFixtureServer();
try {
  const id = await waitForExtensionId(browser);
  const ext = await openExtensionPage(browser, id);
  await ext.evaluate(() => chrome.storage.local.clear());
  const fixture = await browser.newPage();
  await fixture.setViewport({ width: 1440, height: 900 });
  await fixture.goto(`${FIXTURE_BASE}/basic.html`, { waitUntil: 'networkidle2' });
  const tabId = await findTabId(ext, 'basic.html');
  await bg(ext, 'extract:start', { tabId });

  const extractor = await waitFor(
    async () => (await browser.pages()).find((p) => p.url().includes('extractor.html')),
    { label: 'extractor tab', timeout: 20000 },
  );
  await extractor.setViewport({ width: 1440, height: 900 });
  await waitFor(() => extractor.$('.ih-card'), { label: 'cards', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));

  const shot = async (name, viewport) => {
    if (viewport) await extractor.setViewport(viewport);
    await extractor.screenshot({ path: path.join(OUT, `ui-${name}.png`) });
    console.log('saved', name);
  };

  await extractor.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await new Promise((r) => setTimeout(r, 300));
  await shot('default');
  await shot('narrow', { width: 1024, height: 900 });
  await extractor.setViewport({ width: 1440, height: 900 });

  await extractor.hover('.ih-grid .ih-card:nth-child(2)');
  await new Promise((r) => setTimeout(r, 400));
  await shot('hover');

  await extractor.click('.ih-grid .ih-card:nth-child(1)');
  await extractor.click('.ih-grid .ih-card:nth-child(2)');
  await extractor.click('.ih-grid .ih-card:last-child');
  await new Promise((r) => setTimeout(r, 500));
  await shot('selected');

  await extractor.keyboard.press('v');
  await new Promise((r) => setTimeout(r, 700));
  await shot('lightbox');
  await extractor.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));

  const pngChip = await extractor.evaluateHandle(() => {
    const chips = [...document.querySelectorAll('.ih-filters .ih-chip')];
    return chips.find((c) => c.textContent?.trim().toLowerCase().startsWith('png')) ?? null;
  });
  if (pngChip.asElement()) {
    await pngChip.asElement().click();
    await new Promise((r) => setTimeout(r, 700));
    await shot('filter-png');
  }

  await extractor.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await extractor.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1500));
  await shot('light');
  await extractor.keyboard.press('v');
  await new Promise((r) => setTimeout(r, 300));
  await shot('lightbox-light');
  await extractor.keyboard.press('Escape');
  await extractor.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
} finally {
  await browser.close();
  await stopFixtureServer(server);
}
