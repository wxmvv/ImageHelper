#!/usr/bin/env node
// Keep native code and signing settings while updating generated extension resources.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureSafariProject,
  prepareSafariResources,
  SAFARI_BUNDLE_ID,
  syncSafariResources,
} from './safari-resources.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const safariDist = path.join(root, '.tools', 'dist-safari');
const projectDir = path.join(root, 'safari');
const appName = 'ImageHelper';
const xcodeproj = path.join(projectDir, appName, `${appName}.xcodeproj`);
const resources = path.join(projectDir, appName, `${appName} Extension`, 'Resources');
const args = new Set(process.argv.slice(2));
const supported = new Set(['--no-build', '--open', '--sync-only', '--local-signing', '--ios', '--help']);
const run = (cmd, argv) => {
  console.log(`\n$ ${cmd} ${argv.join(' ')}`);
  execFileSync(cmd, argv, { cwd: root, stdio: 'inherit' });
};

async function main() {
  for (const arg of args) if (!supported.has(arg)) throw new Error(`Unknown option: ${arg}`);
  if (args.has('--help')) {
    console.log(`Usage: npm run safari:build -- [options]
  --no-build       Reuse dist/ / 使用已有 dist/
  --sync-only      Sync without compiling / 仅同步资源
  --ios            Build for the iPhone and iPad simulator / 构建 iPhone 和 iPad 模拟器版本
  --local-signing  Use ad-hoc signing for this build / 本次使用本地签名
  --open           Open the built Mac app / 打开编译后的 macOS App
Existing projects and signing settings are preserved. / 保留现有工程和签名设置。`);
    return;
  }
  if (args.has('--sync-only') && args.has('--open'))
    throw new Error('--sync-only cannot be combined with --open');
  const ios = args.has('--ios');
  if (ios && (args.has('--open') || args.has('--sync-only')))
    throw new Error('--ios builds for Simulator. Use --sync-only to sync shared resources.');
  if (!args.has('--no-build')) run('npm', ['run', 'build']);
  await prepareSafariResources(path.join(root, 'dist'), safariDist);
  const generated = await ensureSafariProject(xcodeproj, async () => {
    if (ios) throw new Error('Restore the checked-in iOS targets in the Xcode project first.');
    run('xcrun', [
      'safari-web-extension-converter',
      safariDist,
      '--project-location',
      projectDir,
      '--app-name',
      appName,
      '--bundle-identifier',
      SAFARI_BUNDLE_ID,
      '--macos-only',
      '--copy-resources',
      '--no-open',
      '--no-prompt',
    ]);
    if (!['project.xcproj', 'project.pbxproj'].some((name) => existsSync(path.join(xcodeproj, name)))) {
      throw new Error('Converter did not create an Xcode project');
    }
  });
  await syncSafariResources(safariDist, resources);
  console.log(
    `[safari] ${generated ? 'created' : 'preserved'} project · resources synced: ${(await readdir(resources, { recursive: true })).length}`,
  );
  if (args.has('--sync-only')) return;
  const scheme = ios ? 'ImageHelper iOS' : appName;
  const buildArgs = [
    '-project',
    xcodeproj,
    '-scheme',
    scheme,
    '-configuration',
    'Debug',
    '-derivedDataPath',
    path.join(projectDir, 'build'),
    ...(ios ? ['-destination', 'generic/platform=iOS Simulator'] : []),
  ];
  const local = args.has('--local-signing') || generated;
  console.log(`[safari] signing: ${local ? 'local (ad-hoc)' : 'Xcode project settings'}`);
  // Ad-hoc signing keeps sandbox entitlements; disabling signing would break registration.
  const signing = local
    ? [
        'CODE_SIGN_STYLE=Manual',
        'CODE_SIGN_IDENTITY=-',
        'CODE_SIGNING_ALLOWED=YES',
        'CODE_SIGNING_REQUIRED=NO',
        'DEVELOPMENT_TEAM=',
      ]
    : [];
  run('xcodebuild', [...buildArgs, 'build', ...signing]);
  const configuration = ios ? 'Debug-iphonesimulator' : 'Debug';
  const appPath = path.join(projectDir, 'build/Build/Products', configuration, `${scheme}.app`);
  console.log(`\n[safari] built: ${appPath}`);
  if (args.has('--open')) run('open', [appPath]);
}

try {
  await main();
} catch (error) {
  console.error(`[safari] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
