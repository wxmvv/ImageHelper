// Live check of the background RPC surface (requires the built dist/).
import path from 'node:path';
import { launch, waitForExtensionId } from './chrome.mjs';
import { bg, openExtensionPage, startFixtureServer, stopFixtureServer, FIXTURE_BASE } from './e2e/lib.mjs';

const server = await startFixtureServer();
const browser = await launch(path.resolve('dist'), { profile: '.ref/profile-rpc' });
try {
  const id = await waitForExtensionId(browser);
  const ext = await openExtensionPage(browser, id);
  const page = await browser.newPage();
  await page.goto(`${FIXTURE_BASE}/basic.html`, { waitUntil: 'networkidle2' });

  const current = await bg(ext, 'tabs:current');
  console.log('tabs:current →', current);

  const started = await bg(ext, 'extract:start', { tabId: current.tabId });
  console.log('extract:start →', started);

  /**
   * Placeholder for P2: once the sniffer exists this should grow. Today it proves the
   * message plumbing, session store and injection fallback all answer without throwing.
   */
  const session = (await bg(ext, 'session:get', { tabId: current.tabId })).session;
  console.log('session:get →', { rev: session.rev, images: session.images.length, url: session.page.url });
} finally {
  await browser.close();
  await stopFixtureServer(server);
}
