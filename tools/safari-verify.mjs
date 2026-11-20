#!/usr/bin/env node
// Checks the Safari packaging state: signed appex, PlugInKit registration, extension runtime data.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAFARI_BUNDLE_ID } from './safari-resources.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'safari/build/Build/Products/Debug/ImageHelper.app');
const appex = path.join(app, 'Contents/PlugIns/ImageHelper Extension.appex');
const extensionId = `${SAFARI_BUNDLE_ID}.Extension`;

const checks = [];
const record = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

record('app bundle built', existsSync(app), path.relative(root, app));
record('appex present', existsSync(appex), path.relative(root, appex));

for (const [bundle, expected] of [
  [app, SAFARI_BUNDLE_ID],
  [appex, extensionId],
]) {
  if (!existsSync(bundle)) continue;
  try {
    const identifier = execFileSync(
      'plutil',
      ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(bundle, 'Contents/Info.plist')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    record('bundle identifier', identifier === expected, identifier);
  } catch (error) {
    record('bundle identifier', false, `${path.basename(bundle)}: ${String(error).split('\n')[0]}`);
  }
}

if (existsSync(appex)) {
  try {
    const entitlements = execFileSync('codesign', ['-d', '--entitlements', ':-', appex], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    record('appex is sandboxed', entitlements.includes('com.apple.security.app-sandbox'));
  } catch (error) {
    record('appex is sandboxed', false, String(error).split('\n')[0]);
  }
  try {
    const manifest = JSON.parse(
      execFileSync('cat', [path.join(appex, 'Contents/Resources/manifest.json')], { encoding: 'utf8' }),
    );
    record('manifest version', true, manifest.version);
    record('downloads permission stripped', !(manifest.permissions || []).includes('downloads'));
  } catch (error) {
    record('manifest readable', false, String(error).split('\n')[0]);
  }
}

try {
  const plugins = execFileSync('pluginkit', ['-m', '-p', 'com.apple.Safari.web-extension'], {
    encoding: 'utf8',
  });
  const line = plugins.split('\n').find((entry) => entry.includes(extensionId));
  record(
    'registered with PlugInKit',
    !!line,
    line?.trim() ?? 'not found — run: open ' + path.relative(root, app),
  );
  if (line) record('enabled in PlugInKit', line.trim().startsWith('+'));
} catch (error) {
  record('registered with PlugInKit', false, String(error).split('\n')[0]);
}

/**
 * Safari keeps extension storage inside its own containers, so the cheapest reliable signal is
 * whether any open Safari tab currently points at a safari-web-extension:// page.
 */
let runtimeData;
try {
  const urls = execFileSync(
    'osascript',
    ['-e', 'tell application "Safari" to get URL of every tab of every window'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  runtimeData = urls.includes('safari-web-extension://');
} catch {
  runtimeData = false;
}
record(
  'extension page opened in Safari',
  runtimeData,
  runtimeData ? 'safari-web-extension:// tab found' : 'no extension tab open (click the toolbar icon once)',
);

const failed = checks.filter((check) => !check.ok);
const onlyRuntimeMissing = failed.length === 1 && failed[0]?.name === 'extension page opened in Safari';
console.log('');
if (failed.length === 0) {
  console.log('Safari 侧已就绪：点击工具栏的 ImageHelper 图标即可提取图片。');
} else if (onlyRuntimeMissing) {
  console.log('扩展已注册且签名正确；在 Safari 打开任意网页，点工具栏图标即可（此时会打开图片筛选页）。');
} else {
  console.log('还需要在 Safari 里完成：');
  console.log('  1. Safari → 设置 → 高级 → 勾选「显示网页开发者功能」');
  console.log('  2. 菜单栏「开发」→ 勾选「允许未签名的扩展」（每次重启 Safari 需重勾）');
  console.log('  3. Safari → 设置 → 扩展 → 勾选 ImageHelper');
  console.log('然后重新运行本脚本确认。');
}
process.exit(onlyRuntimeMissing ? 0 : failed.length ? 1 : 0);
