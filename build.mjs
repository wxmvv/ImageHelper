// Build pipeline: esbuild bundles + static copy into ./dist
// Usage: node build.mjs [--watch]
import { build, context } from 'esbuild';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

/** Bundles that must be a single self-contained file (no ESM imports at runtime). */
const SCRIPT_ENTRIES = {
  background: 'src/background/index.ts',
  sniffer: 'src/content/sniffer.ts',
  'page-hook': 'src/content/page-hook.ts',
  popup: 'src/pages/popup/main.ts',
  extractor: 'src/pages/extractor/main.ts',
  'hash-worker': 'src/pages/extractor/hash-worker.ts',
  options: 'src/pages/options/main.ts',
  multiurl: 'src/pages/multiurl/main.ts',
};

const STYLE_ENTRIES = {
  'styles/popup': 'src/ui/styles/popup.css',
  'styles/extractor': 'src/ui/styles/extractor.css',
  'styles/options': 'src/ui/styles/options.css',
  'styles/multiurl': 'src/ui/styles/multiurl.css',
};

/** Static files copied verbatim into dist/. */
const STATIC_FILES = ['manifest.json'];
const STATIC_DIRS = ['_locales', 'assets'];
/** Page shells live at the extension root so manifest paths stay flat. */
const STATIC_HTML = ['popup', 'extractor', 'options', 'multiurl'];

const common = {
  bundle: true,
  format: 'iife',
  target: ['chrome114', 'safari16.4'],
  platform: 'browser',
  logLevel: 'warning',
  legalComments: 'none',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
};

const scriptOptions = {
  ...common,
  entryPoints: SCRIPT_ENTRIES,
  outdir: dist,
};

const styleOptions = {
  ...common,
  entryPoints: STYLE_ENTRIES,
  outdir: dist,
  loader: { '.woff2': 'file', '.svg': 'file' },
};

async function copyStatic() {
  await mkdir(dist, { recursive: true });
  for (const file of STATIC_FILES) {
    await cp(path.join(src, file), path.join(dist, file));
  }
  for (const dir of STATIC_DIRS) {
    const from = path.join(src, dir);
    if (existsSync(from)) {
      await cp(from, path.join(dist, dir), { recursive: true });
    }
  }
  for (const page of STATIC_HTML) {
    await cp(path.join(src, 'html', `${page}.html`), path.join(dist, `${page}.html`));
  }
}

async function run() {
  await rm(dist, { recursive: true, force: true });
  await copyStatic();

  if (watch) {
    const ctxs = await Promise.all([context(scriptOptions), context(styleOptions)]);
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log(`[build] watching… (${await countFiles(dist)} files in dist/)`);
    return;
  }

  const started = Date.now();
  await Promise.all([build(scriptOptions), build(styleOptions)]);
  const files = await countFiles(dist);
  const bytes = await dirSize(dist);
  console.log(
    `[build] dist/ ready — ${files} files, ${(bytes / 1024).toFixed(1)} KB, ${Date.now() - started} ms`,
  );
}

async function countFiles(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? await countFiles(path.join(dir, entry.name)) : 1;
  }
  return total;
}

async function dirSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(full) : (await stat(full)).size;
  }
  return total;
}

await run();
