// Regression: images inside open shadow roots must be discovered.
import path from 'node:path';
import { launch, waitForExtensionId } from '../chrome.mjs';
import {
  bg,
  findTabId,
  openExtensionPage,
  startFixtureServer,
  stopFixtureServer,
  waitFor,
  FIXTURE_BASE,
} from './lib.mjs';

const server = await startFixtureServer();
const browser = await launch(path.resolve('dist'), { profile: '.ref/profile-shadow' });
try {
  const id = await waitForExtensionId(browser);
  const ext = await openExtensionPage(browser, id);
  const page = await browser.newPage();
  await page.goto(`${FIXTURE_BASE}/basic.html`, { waitUntil: 'networkidle2' });
  const tabId = await findTabId(ext, 'basic.html');
  await bg(ext, 'extract:start', { tabId });
  const images = await waitFor(
    async () => {
      const session = (await bg(ext, 'session:get', { tabId })).session;
      return session.images.length >= 9 ? session.images : null;
    },
    { label: 'images' },
  );
  const shadowImage = images.find((image) => image.url.includes('shadow=1'));
  if (!shadowImage) throw new Error('shadow DOM image was not discovered');
  console.log('PASS shadow DOM: found', shadowImage.url, `${images.length} images total`);
} finally {
  await browser.close();
  await stopFixtureServer(server);
}
