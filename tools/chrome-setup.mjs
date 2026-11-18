#!/usr/bin/env node
// Fetch Chrome for Testing into .tools/ (branded Chrome 137+ ignores --load-extension).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.env.CFT_VERSION || '157.0.8103.38';
const arch = process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
const target = path.join(root, '.tools');
const zip = path.join(target, 'cft.zip');
const mirror = process.env.CFT_MIRROR || 'https://cdn.npmmirror.com/binaries/chrome-for-testing';

if (existsSync(path.join(target, 'chrome-mac-arm64'))) {
  console.log('[chrome] already installed at .tools/chrome-mac-arm64');
  process.exit(0);
}

await mkdir(target, { recursive: true });
console.log(`[chrome] downloading ${version} (${arch})…`);
execFileSync('curl', ['-L', '--fail', '-o', zip, `${mirror}/${version}/${arch}/chrome-${arch}.zip`], {
  stdio: 'inherit',
});
execFileSync('unzip', ['-q', '-o', zip, '-d', target], { stdio: 'inherit' });
await rm(zip, { force: true });
console.log('[chrome] done → .tools/chrome-mac-arm64');
