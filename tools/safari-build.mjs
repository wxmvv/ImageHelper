#!/usr/bin/env node
// Keep native code and signing settings while updating generated extension resources.
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ensureSafariProject, prepareSafariResources, syncSafariResources } from './safari-resources.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const safariDist = path.join(root, '.tools', 'dist-safari');
const projectDir = path.join(root, 'safari');
const appName = 'ImageHelper';
const bundleId = 'com.wxm.imagehelper';
const xcodeproj = path.join(projectDir, appName, `${appName}.xcodeproj`);
const resources = path.join(projectDir, appName, `${appName} Extension`, 'Resources');
const args = new Set(process.argv.slice(2));
const supported = new Set(['--no-build', '--open', '--sync-only', '--local-signing', '--help']);
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
  --local-signing  Use ad-hoc signing for this build / 本次使用本地签名
  --open           Open the built app / 打开编译后的 App
Existing projects and signing settings are preserved. / 保留现有工程和签名设置。`);
    return;
  }
  if (args.has('--sync-only') && args.has('--open'))
    throw new Error('--sync-only cannot be combined with --open');
  if (!args.has('--no-build')) run('npm', ['run', 'build']);
  await prepareSafariResources(path.join(root, 'dist'), safariDist);
  const generated = await ensureSafariProject(xcodeproj, async () => {
    run('xcrun', [
      'safari-web-extension-converter',
      safariDist,
      '--project-location',
      projectDir,
      '--app-name',
      appName,
      '--bundle-identifier',
      bundleId,
      '--macos-only',
      '--copy-resources',
      '--no-open',
      '--no-prompt',
    ]);
    // Only new projects need the converter's bundle identifier correction.
    const projectFile = ['project.xcproj', 'project.pbxproj']
      .map((name) => path.join(xcodeproj, name))
      .find((file) => existsSync(file));
    if (!projectFile) throw new Error('Converter did not create an Xcode project');
    const original = await readFile(projectFile, 'utf8');
    const patched = original.replaceAll(`com.wxm.${appName}`, bundleId);
    if (patched !== original) await writeFile(projectFile, patched);
  });
  await syncSafariResources(safariDist, resources);
  console.log(
    `[safari] ${generated ? 'created' : 'preserved'} project · resources synced: ${(await readdir(resources, { recursive: true })).length}`,
  );
  if (args.has('--sync-only')) return;
  const buildArgs = [
    '-project',
    xcodeproj,
    '-scheme',
    appName,
    '-configuration',
    'Debug',
    '-derivedDataPath',
    path.join(projectDir, 'build'),
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
  const appPath = path.join(projectDir, 'build/Build/Products/Debug', `${appName}.app`);
  console.log(`\n[safari] built: ${appPath}`);
  if (args.has('--open')) run('open', [appPath]);
}

try {
  await main();
} catch (error) {
  console.error(`[safari] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
