import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderTemplate, sanitizeFileName, uniqueFileName } from '../src/core/naming.ts';

test('naming expands every token, pads index and omits absent extension', () => {
  assert.equal(
    renderTemplate('{index}-{name}_{w}x{h}-{page}-{host}-{date}-{hash}-{unknown}.{ext}', {
      index: 1,
      name: 'photo',
      w: 1200,
      h: 800,
      page: 'gallery',
      host: 'test',
      date: new Date(2026, 0, 2),
      hash: 'abc',
      ext: 'png',
    }),
    '001-photo_1200x800-gallery-test-2026-01-02-abc-.png',
  );
  assert.equal(renderTemplate('{index}-{name}.{ext}', { index: 1234, name: 'image', ext: '' }), '1234-image');
  assert.equal(renderTemplate('{name}-{w}-{h}-{unknown}', { index: 1, name: 'image', ext: '' }), 'image---');
});

test('naming sanitizes forbidden characters and controls', () => {
  assert.equal(sanitizeFileName(' ..a<>:"/\\|?*\u0000\n.png.  '), 'a.png');
  assert.equal(sanitizeFileName('... '), 'image');
  const name = sanitizeFileName('图片'.repeat(100) + '.jpeg');
  assert.ok(new TextEncoder().encode(name).length <= 120);
  assert.ok(name.endsWith('.jpeg'));
  assert.ok(!name.includes('�'));
});

test('unique names reserve suffixes without truncating extensions', () => {
  const used = new Set<string>();
  assert.equal(uniqueFileName('image.png', used), 'image.png');
  assert.equal(uniqueFileName('image.png', used), 'image-2.png');
  assert.equal(uniqueFileName('image.png', used), 'image-3.png');
  const long = '图'.repeat(100) + '.png';
  uniqueFileName(long, used);
  const duplicate = uniqueFileName(long, used);
  assert.ok(duplicate.endsWith('-2.png'));
  assert.ok(new TextEncoder().encode(duplicate).length <= 120);
});
