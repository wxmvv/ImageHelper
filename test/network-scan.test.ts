import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectResourceEntries } from '../src/content/network-scan.ts';

const entry = (patch = {}) => ({
  name: 'https://example.test/a.png',
  initiatorType: 'img',
  encodedBodySize: 42,
  decodedBodySize: 60,
  transferSize: 342,
  ...patch,
});

test('resource timing filters initiators and URLs, accepts image content types', () => {
  assert.equal(
    collectResourceEntries([
      entry(),
      entry({ name: 'https://example.test/api' }),
      entry({ initiatorType: 'script' }),
    ]).length,
    1,
  );
  for (const initiatorType of ['img', 'css', 'link', 'video', 'audio', 'fetch', 'xmlhttprequest', 'other'])
    assert.equal(collectResourceEntries([entry({ initiatorType })]).length, 1);
  assert.equal(
    collectResourceEntries([entry({ name: 'https://example.test/api', contentType: 'image/png' })])[0]?.mime,
    'image/png',
  );
  assert.equal(collectResourceEntries([entry({ name: 'https://example.test/img/opaque' })]).length, 1);
});

test('resource timing chooses encoded, decoded, then transfer bytes', () => {
  for (const [patch, bytes] of [
    [{}, 42],
    [{ encodedBodySize: 0 }, 60],
    [{ encodedBodySize: 0, decodedBodySize: 0 }, 342],
    [{ encodedBodySize: 0, decodedBodySize: 0, transferSize: 0 }, 0],
  ] as const)
    assert.equal(collectResourceEntries([entry(patch)])[0]?.bytes, bytes);
});
