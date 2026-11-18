// Shared e2e helpers: fixture server lifecycle, extension page RPC, polling.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURE_PORT = 8123;
export const FIXTURE_BASE = `http://127.0.0.1:${FIXTURE_PORT}`;

export function startFixtureServer(port = FIXTURE_PORT) {
  const child = spawn(process.execPath, [path.join(ROOT, 'tools/e2e/serve-fixtures.mjs'), String(port)], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fixture server did not start')), 8000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('fixtures on')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('error', reject);
  });
}

export async function stopFixtureServer(child) {
  if (!child) return;
  child.kill('SIGTERM');
}

/** Opens an extension page (which has full chrome.* access) and returns RPC helpers. */
export async function openExtensionPage(browser, extensionId, pageName = 'popup.html') {
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('[page error]', err.message));
  await page.goto(`chrome-extension://${extensionId}/${pageName}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof chrome !== 'undefined' && !!chrome.runtime?.id, { timeout: 10000 });
  return page;
}

/** Calls an ImageHelper background handler through the platform RPC envelope. */
export async function bg(page, type, payload = {}) {
  return page.evaluate(
    ([messageType, messagePayload]) => {
      const id = `e2e-${Math.random().toString(36).slice(2)}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout: ${messageType}`)), 15000);
        chrome.runtime.sendMessage({ __ih: 1, id, type: messageType, payload: messagePayload }, (reply) => {
          clearTimeout(timer);
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else if (!reply) reject(new Error(`no reply: ${messageType}`));
          else if (!reply.ok) reject(new Error(reply.error || 'handler failed'));
          else resolve(reply.data);
        });
      });
    },
    [type, payload],
  );
}

export async function waitFor(check, { timeout = 15000, interval = 200, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`timed out waiting for ${label}${last instanceof Error ? `: ${last.message}` : ''}`);
}

/** Picks the tab whose url matches, retrying while the browser is still loading it. */
export async function findTabId(page, urlPart) {
  return waitFor(
    () =>
      page.evaluate(async (needle) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => t.url && t.url.includes(needle));
        return tab ? tab.id : null;
      }, urlPart),
    { label: `tab ${urlPart}`, timeout: 20000 },
  );
}
