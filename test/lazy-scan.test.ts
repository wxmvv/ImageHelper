import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeLazyValue, LAZY_ATTRIBUTES } from '../src/content/lazy-scan.ts';

test('lazy values normalize URLs, CSS layers, srcset, lists and JSON arrays', () => {
  for (const [input, expected] of [
    [' /img/a.png ', ['/img/a.png']],
    ['url("/a.png"), url(\'/b.webp\')', ['/a.png', '/b.webp']],
    ['/a.png 100w, /b.webp 200w', ['/a.png', '/b.webp']],
    ['./a.jpg 1x, ./b.jpg 2x', ['./a.jpg', './b.jpg']],
    ['/a.png,/b.png', ['/a.png', '/b.png']],
    ['["/a.png", "url(/b.png)", null, 1]', ['/a.png', '/b.png']],
    ['data:image/png;base64,AAAA 1x, /b.png 2x', ['data:image/png;base64,AAAA', '/b.png']],
  ] as Array<[string, string[]]>)
    assert.deepEqual(normalizeLazyValue(input), expected, input);
  for (const input of ['', 'about:blank', '#', '{}', 'undefined', 'null', '[invalid'])
    assert.deepEqual(normalizeLazyValue(input), []);
  assert.equal(LAZY_ATTRIBUTES.length, 13);
});
