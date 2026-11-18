import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSrcset, largestCandidate } from '../src/core/srcset.ts';

test('srcset supports width, fractional density and redundant separators', () => {
  assert.deepEqual(parseSrcset(' , a.png 1x, , b.png 2x, c.png 480w, '), [
    { url: 'a.png', density: 1 },
    { url: 'b.png', density: 2 },
    { url: 'c.png', width: 480 },
  ]);
  assert.deepEqual(parseSrcset('a.png,b.png, c.png 1.5x'), [
    { url: 'a.png' },
    { url: 'b.png' },
    { url: 'c.png', density: 1.5 },
  ]);
  assert.equal(largestCandidate('a.png 480w, b.png 1280w, c.png 640w'), 'b.png');
  assert.equal(largestCandidate('a.png, b.png 2x, c.png 1.5x'), 'b.png');
  assert.equal(largestCandidate(''), null);
});

test('srcset preserves data URLs and rejects invalid descriptors', () => {
  assert.deepEqual(parseSrcset('data:image/png;base64,AAAA 1x, b.png 2x'), [
    { url: 'data:image/png;base64,AAAA', density: 1 },
    { url: 'b.png', density: 2 },
  ]);
  assert.deepEqual(parseSrcset('bad.png 0w, bad.png -1x, bad.png 1q, good.png 2x'), [
    { url: 'good.png', density: 2 },
  ]);
});
