// Smoke test: does dist/ load in Chrome for Testing without manifest errors?
import path from 'node:path';
import { launch, waitForExtensionId } from './chrome.mjs';

const dist = path.resolve('dist');
const browser = await launch(dist, { profile: '.ref/profile-smoke' });
const id = await waitForExtensionId(browser);
console.log('extension id:', id);

const page = await browser.newPage();
await page.goto('chrome://extensions');
await new Promise((r) => setTimeout(r, 800));
const items = await page.evaluate(() => {
  const mgr = document.querySelector('extensions-manager');
  const list = mgr?.shadowRoot?.querySelector('extensions-item-list');
  const nodes = list?.shadowRoot?.querySelectorAll('extensions-item') || [];
  return Array.from(nodes).map((it) => ({
    id: it.id,
    name: it.shadowRoot?.querySelector('#name')?.textContent?.trim(),
    errors: it.shadowRoot?.querySelector('#errors-button')?.textContent?.trim() ?? '',
  }));
});
console.log(JSON.stringify(items, null, 2));

// service worker console/errors
const swTarget = browser.targets().find((t) => t.type() === 'service_worker');
if (swTarget) {
  const worker = await swTarget.worker();
  console.log(
    'sw alive:',
    await worker.evaluate(() => typeof chrome !== 'undefined' && !!chrome.runtime?.id),
  );
}
await browser.close();
