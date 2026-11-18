import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { existsSync } from 'node:fs';

/** Chrome for Testing keeps `--load-extension` (branded Chrome dropped it in 137). */
export const CFT_PATH = path.resolve(
  '.tools/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);

export function resolveChrome() {
  const local = CFT_PATH;
  if (existsSync(local)) return local;
  throw new Error(`Chrome for Testing not found at ${local}. Run: npm run chrome:setup`);
}

export function launch(extensionDir, { profile = '.ref/profile-cft', headless = false } = {}) {
  return puppeteer.launch({
    executablePath: resolveChrome(),
    headless,
    userDataDir: path.resolve(profile),
    defaultViewport: { width: 1440, height: 950 },
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });
}

export async function waitForExtensionId(browser, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const target = browser
      .targets()
      .find(
        (t) =>
          (t.type() === 'service_worker' || t.type() === 'page') && t.url().startsWith('chrome-extension://'),
      );
    if (target) return new URL(target.url()).host;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('extension did not register a background target');
}
