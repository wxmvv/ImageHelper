import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/core/settings.ts';
import { fnv1a, imageId } from '../src/core/hash.ts';
import { formatBytes, formatDimensions } from '../src/core/format.ts';

test('settings defaults keep small images and include dimensions in file names', () => {
  assert.equal(DEFAULT_SETTINGS.minBytes, 0);
  assert.equal(DEFAULT_SETTINGS.namingTemplate, '{name}.{ext}');
  assert.equal(DEFAULT_SETTINGS.transparentPopup, false);
});

test('settings validate individual fields and discard unknown values', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(
    normalizeSettings({
      minWidth: -1,
      minHeight: NaN,
      minBytes: Infinity,
      scanCss: 'yes',
      theme: 'blue',
      transparentPopup: 'true',
      maxImagesPerPage: 0,
      namingTemplate: '',
    }),
    DEFAULT_SETTINGS,
  );
  assert.deepEqual(normalizeSettings({ language: 'zh_CN', minWidth: 400, scanCss: false, ignored: true }), {
    ...DEFAULT_SETTINGS,
    language: 'zh_CN',
    minWidth: 400,
    scanCss: false,
  });
  assert.notEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.equal(normalizeSettings({ transparentPopup: true }).transparentPopup, true);
});

test('hash uses FNV-1a known vectors and stable image IDs', () => {
  assert.equal(fnv1a(''), '811c9dc5');
  assert.equal(fnv1a('hello'), '4f9f2cab');
  assert.equal(imageId('hello'), fnv1a('hello'));
  assert.match(imageId('图片'), /^[a-f0-9]{8}$/);
});

test('formatting uses binary units and handles unknown values', () => {
  assert.equal(formatBytes(), '—');
  assert.equal(formatBytes(NaN), '—');
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(824), '824 B');
  assert.equal(formatBytes(12698), '12.4 KB');
  assert.equal(formatBytes(3250586), '3.1 MB');
  assert.equal(formatDimensions(1200, 800), '1200×800');
  assert.equal(formatDimensions(0, 800), '—');
  assert.equal(formatDimensions(), '—');
});
