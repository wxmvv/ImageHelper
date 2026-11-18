import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyFilters, countByFormat, isDefaultFilter, similarGroups } from '../src/core/filter.ts';
import type { FilterState, ImageRecord } from '../src/core/types.ts';

const defaults: FilterState = {
  formats: [],
  minWidth: 0,
  minHeight: 0,
  minBytes: 0,
  include: '',
  exclude: '',
  useRegex: false,
  sort: 'order',
  dedupe: 'url',
  similarThreshold: 6,
  hideHidden: false,
};
const images: ImageRecord[] = [
  {
    id: 'a',
    url: 'https://test/a.png',
    ext: 'png',
    source: 'img',
    width: 200,
    height: 100,
    bytes: 200,
    discoveredAt: 1,
  },
  {
    id: 'b',
    url: 'https://test/b.jpg',
    ext: 'jpg',
    source: 'img',
    width: 100,
    height: 200,
    bytes: 100,
    discoveredAt: 2,
  },
  {
    id: 'c',
    url: 'https://test/c.png',
    ext: 'png',
    source: 'img',
    width: 300,
    height: 100,
    bytes: 200,
    hidden: true,
    discoveredAt: 3,
  },
];
const filter = (patch: Partial<FilterState>) =>
  applyFilters(images, { ...defaults, ...patch }).map((image) => image.id);

test('filters formats, dimensions, visibility, include and exclude', () => {
  assert.deepEqual(filter({ formats: ['png'] }), ['a', 'c']);
  assert.deepEqual(filter({ minWidth: 150, minHeight: 100, hideHidden: true }), ['a']);
  assert.deepEqual(filter({ include: 'TEST', exclude: 'b.jpg' }), ['a', 'c']);
  assert.deepEqual(filter({ include: '/[ab]\\.', useRegex: true }), ['a', 'b']);
  assert.deepEqual(filter({ include: '[', useRegex: true }), []);
  assert.deepEqual(filter({ exclude: '[', useRegex: true }), ['a', 'b', 'c']);
  const literal = { ...images[0]!, url: 'https://test/[abc.png' };
  assert.equal(applyFilters([literal], { ...defaults, include: '[', useRegex: true }).length, 1);
});

test('sorting is stable and never mutates input', () => {
  assert.deepEqual(filter({ sort: 'size-desc' }), ['a', 'c', 'b']);
  assert.deepEqual(filter({ sort: 'size-asc' }), ['b', 'a', 'c']);
  assert.deepEqual(filter({ sort: 'width-desc' }), ['c', 'a', 'b']);
  assert.deepEqual(filter({ sort: 'height-desc' }), ['b', 'a', 'c']);
  assert.deepEqual(
    images.map((image) => image.id),
    ['a', 'b', 'c'],
  );
});

test('URL dedupe retains richer records and supports off mode', () => {
  const poor = { ...images[0]!, width: undefined, height: undefined, bytes: undefined };
  const records = [poor, images[1]!, images[0]!];
  assert.deepEqual(applyFilters(records, defaults), [images[0], images[1]]);
  assert.equal(applyFilters(records, { ...defaults, dedupe: 'off' }).length, 3);
  assert.deepEqual(countByFormat(images), [
    { ext: 'png', count: 2 },
    { ext: 'jpg', count: 1 },
  ]);
  assert.equal(isDefaultFilter(defaults), true);
  assert.equal(isDefaultFilter({ ...defaults, hideHidden: true }), false);
});

test('similar clustering is transitive, sorts by area and handles missing hashes', () => {
  const records = images.map((image, index) => ({ ...image, width: (index + 1) * 100, height: 100 }));
  const hashes = new Map([
    ['a', '0000000000000000'],
    ['b', '0000000000000001'],
    ['c', '0000000000000003'],
  ]);
  assert.deepEqual(
    similarGroups(records, hashes, 1).map((group) => group.map((image) => image.id)),
    [['c', 'b', 'a']],
  );
  assert.equal(similarGroups(records, new Map(), 6).length, 3);
  assert.equal(similarGroups(records, new Map([['a', 'invalid']]), 6).length, 3);
});

test('minimum bytes defaults filter unknown and undersized images', () => {
  const images: ImageRecord[] = [
    { id: 'a', url: 'https://test/a.png', ext: 'png', source: 'img', discoveredAt: 0, bytes: 2048 },
    { id: 'b', url: 'https://test/b.png', ext: 'png', source: 'img', discoveredAt: 1 },
  ];
  assert.deepEqual(
    applyFilters(images, { ...defaults, minBytes: 1024 }).map((i) => i.id),
    ['a'],
  );
});
