import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  absolutize,
  normalizeUrl,
  isSupportedProtocol,
  isImageUrl,
  extFromUrl,
  extFromMime,
  fileNameFromUrl,
  isTrackingEndpoint,
} from '../src/core/url.ts';
import { largestCandidate } from '../src/core/srcset.ts';

test('URL resolution handles relative paths, escaped slashes and failures', () => {
  assert.equal(absolutize('../a.png', 'https://example.com/page/index'), 'https://example.com/a.png');
  assert.equal(absolutize('//cdn.test/a.jpg', 'https://example.com'), 'https://cdn.test/a.jpg');
  assert.equal(
    absolutize(String.raw`https:\/\/cdn.test\/a.png`, 'https://example.com'),
    'https://cdn.test/a.png',
  );
  assert.equal(
    absolutize(String.raw`https:\u002f\u002fcdn.test\x2fa.png`, 'https://example.com'),
    'https://cdn.test/a.png',
  );
  assert.equal(absolutize('http://[', 'https://example.com'), null);
  assert.equal(absolutize('', 'https://example.com'), null);
  assert.equal(normalizeUrl('  https://example.com/a.png?q=1#part  '), 'https://example.com/a.png?q=1');
});

test('image URL recognition covers extensions, query parameters and extensionless paths', () => {
  for (const parameter of ['format', 'fm', 'ext', 'type']) {
    assert.equal(extFromUrl(`https://cdn.test/render?${parameter}=webp`), 'webp');
    assert.equal(isImageUrl(`https://cdn.test/render?${parameter}=webp`), true);
  }
  assert.equal(extFromUrl('https://cdn.test/render?type=image%2Fpng'), 'png');
  assert.equal(extFromUrl('https://cdn.test/A.JPEG?q=1#x'), 'jpg');
  assert.equal(isImageUrl('https://cdn.test/image/12345'), true);
  assert.equal(isImageUrl('https://cdn.test/page'), false);
  assert.equal(extFromUrl('https://cdn.test/page'), 'img');
  assert.equal(extFromUrl('data:image/svg+xml;base64,PHN2Zz4='), 'svg');
  assert.equal(extFromUrl('data:image/png;base64,AAAA'), 'png');
  assert.equal(extFromMime('IMAGE/JPEG; charset=utf-8'), 'jpg');
  assert.equal(extFromMime('text/html'), 'img');
  assert.equal(
    absolutize(largestCandidate('a.png 1x, b.png 2x') ?? '', 'https://cdn.test/'),
    'https://cdn.test/b.png',
  );
});

test('protocol and URL file names handle encoded and malformed values', () => {
  for (const protocol of ['http', 'https', 'data', 'blob'])
    assert.equal(isSupportedProtocol(`${protocol}:something`), true);
  assert.equal(isSupportedProtocol('javascript:alert(1)'), false);
  assert.equal(fileNameFromUrl('https://cdn.test/%E5%9B%BE%E7%89%87.png?q=1'), '图片.png');
  assert.equal(fileNameFromUrl('https://cdn.test/'), 'image');
  assert.equal(fileNameFromUrl('data:image/png;base64,AAAA'), 'image');
  assert.equal(fileNameFromUrl('https://cdn.test/%xx'), 'image');
});

test('extFromUrl understands CDN format hints in query and path', () => {
  assert.equal(extFromUrl('https://img0.baidu.com/it/u=1,2&fm=253&f=JPEG?w=500&h=695'), 'jpg');
  assert.equal(extFromUrl('https://img3.baidu.com/it/u=9,8&f=PNG&fmt=auto'), 'png');
  assert.equal(extFromUrl('https://cdn.example.com/a?format=webp'), 'webp');
  assert.equal(extFromUrl('https://cdn.example.com/a?format=image/avif'), 'avif');
  assert.equal(extFromUrl('https://cdn.example.com/a?fmt=auto&q=75'), 'img');
});

test('isTrackingEndpoint flags beacon endpoints but not image paths', () => {
  assert.equal(isTrackingEndpoint('https://h2tcbox.baidu.com/ztbox?action=zpblog'), true);
  assert.equal(isTrackingEndpoint('https://example.com/api/log?x=1'), true);
  assert.equal(isTrackingEndpoint('https://example.com/img/photo.jpg'), false);
  // The path alone is ambiguous; the reporter keeps it when it also looks like an image.
  assert.equal(isTrackingEndpoint('https://example.com/api/image?id=1'), true);
  assert.equal(isImageUrl('https://example.com/api/image?id=1'), true);
});
