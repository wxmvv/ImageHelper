import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  ensureSafariProject,
  prepareSafariResources,
  syncSafariResources,
} from '../tools/safari-resources.ts';

test('Safari sync preserves project, signing and native files while removing stale nested assets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ih-safari-'));
  try {
    const project = path.join(root, 'safari/ImageHelper/ImageHelper.xcodeproj');
    const resources = path.join(root, 'safari/ImageHelper/ImageHelper Extension/Resources');
    const dist = path.join(root, 'dist');
    const stage = path.join(root, 'stage');
    await mkdir(project, { recursive: true });
    await mkdir(path.join(resources, 'assets'), { recursive: true });
    await mkdir(path.join(dist, 'assets/icons'), { recursive: true });
    const native = path.join(root, 'safari/ImageHelper/ViewController.swift');
    await writeFile(native, 'custom native code');
    for (const format of ['project.xcproj', 'project.pbxproj']) {
      const file = path.join(project, format);
      await writeFile(file, 'custom team and signing settings');
      assert.equal(
        await ensureSafariProject(project, async () => {
          assert.fail('must not regenerate');
        }),
        false,
      );
      assert.equal(await readFile(file, 'utf8'), 'custom team and signing settings');
      await rm(file);
    }
    const manifest = {
      permissions: ['storage', 'downloads'],
      minimum_chrome_version: '114',
      action: { default_popup: 'popup.html', default_icon: { '16': 'assets/icons/icon-16.png' } },
      options_ui: { page: 'options.html', open_in_tab: true },
    };
    await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(path.join(resources, 'manifest.json'), '{}');
    await writeFile(path.join(resources, 'assets/obsolete.png'), 'old');
    await writeFile(path.join(dist, 'assets/current.png'), 'new');
    await writeFile(path.join(dist, 'assets/icons/toolbar-icon.svg'), '<svg/>');
    await prepareSafariResources(dist, stage);
    await syncSafariResources(stage, resources);
    assert.deepEqual(JSON.parse(await readFile(path.join(resources, 'manifest.json'), 'utf8')), {
      permissions: ['storage'],
      action: { default_popup: 'popup.html', default_icon: 'assets/icons/toolbar-icon.svg' },
      options_ui: { page: 'options.html' },
    });
    assert.deepEqual(JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8')), manifest);
    assert.deepEqual((await readdir(path.join(resources, 'assets'))).sort(), ['current.png', 'icons']);
    assert.equal(await readFile(path.join(resources, 'assets/icons/toolbar-icon.svg'), 'utf8'), '<svg/>');
    assert.equal(await readFile(native, 'utf8'), 'custom native code');
    await writeFile(path.join(stage, 'new-root.js'), 'new');
    await assert.rejects(syncSafariResources(stage, resources), /root entries changed/);
    assert.equal(await readFile(path.join(resources, 'assets/current.png'), 'utf8'), 'new');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Safari initializes once and refuses to overwrite a partial native project', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ih-safari-'));
  try {
    const project = path.join(root, 'safari/ImageHelper/ImageHelper.xcodeproj');
    assert.equal(
      await ensureSafariProject(project, async () => {
        await mkdir(project, { recursive: true });
      }),
      true,
    );
    await assert.rejects(
      ensureSafariProject(project, async () => {
        assert.fail('must preserve directory');
      }),
      /no project/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
