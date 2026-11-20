import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SAFARI_BUNDLE_ID = 'dev.wxmvv.ImageHelper';

export async function prepareSafariResources(dist: string, staging: string): Promise<void> {
  const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  if (!Array.isArray(manifest.permissions)) throw new Error('Invalid manifest permissions');
  manifest.permissions = manifest.permissions.filter((permission: unknown) => permission !== 'downloads');
  delete manifest.minimum_chrome_version;
  if (manifest.action && typeof manifest.action === 'object') {
    // Chrome's manifest requires raster action icons, so only the Safari build uses the template.
    (manifest.action as Record<string, unknown>).default_icon = 'assets/icons/toolbar-icon.svg';
  }
  if (manifest.options_ui && typeof manifest.options_ui === 'object') {
    delete (manifest.options_ui as Record<string, unknown>).open_in_tab;
  }
  await rm(staging, { recursive: true, force: true });
  await cp(dist, staging, { recursive: true });
  await writeFile(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function syncSafariResources(staging: string, resources: string): Promise<void> {
  const info = await lstat(resources);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('Safari Resources must be a real directory');
  const incoming = (await readdir(staging)).sort();
  const current = (await readdir(resources)).sort();
  // Root files have explicit Xcode references; copying a new file alone would omit it from the app.
  if (JSON.stringify(incoming) !== JSON.stringify(current)) {
    throw new Error(
      'Safari resource root entries changed. Update Resources files and target membership in Xcode first. / 请先在 Xcode 更新 Resources 根目录文件及扩展目标归属；现有资源已保留。',
    );
  }
  for (const name of incoming) {
    const destination = path.join(resources, name);
    // Replacing generated folders removes obsolete assets from subsequent builds.
    await rm(destination, { recursive: true, force: true });
    await cp(path.join(staging, name), destination, { recursive: true });
  }
}

export async function ensureSafariProject(project: string, generate: () => Promise<void>): Promise<boolean> {
  for (const name of ['project.xcproj', 'project.pbxproj']) {
    try {
      if ((await lstat(path.join(project, name))).isFile()) return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  // A partial or user-created directory must never be overwritten by the converter.
  try {
    await lstat(path.dirname(project));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await mkdir(path.dirname(path.dirname(project)), { recursive: true });
    await generate();
    return true;
  }
  throw new Error(`Existing Safari directory has no project; preserve or move it first: ${project}`);
}
