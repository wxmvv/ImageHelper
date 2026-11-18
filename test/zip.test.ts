import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZipWriter } from '../src/core/zip.ts';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

test('ZIP store records, UTF-8 names, CRC, directory offsets and payloads are valid', async () => {
  const zip = new ZipWriter();
  const expected = new Map([
    ['folder/hello.txt', new TextEncoder().encode('hello')],
    ['图片.png', new Uint8Array([0, 1, 127, 255])],
  ]);
  await zip.addText('folder/hello.txt', 'hello');
  await zip.add('图片.png', new Blob([expected.get('图片.png')!]));
  assert.equal(zip.entryCount, 2);
  const blob = await zip.finish();
  assert.equal(blob.type, 'application/zip');
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 8, true), 2);
  assert.equal(view.getUint16(end + 10, true), 2);
  const centralOffset = view.getUint32(end + 16, true);
  assert.equal(centralOffset + view.getUint32(end + 12, true), end);
  let localOffset = 0;
  let directory = centralOffset;
  for (const [name, data] of expected) {
    assert.equal(view.getUint16(localOffset + 6, true), 0x0800);
    assert.equal(view.getUint16(localOffset + 8, true), 0);
    const size = view.getUint32(localOffset + 18, true);
    const nameLength = view.getUint16(localOffset + 26, true);
    assert.equal(
      new TextDecoder().decode(bytes.slice(localOffset + 30, localOffset + 30 + nameLength)),
      name,
    );
    const start = localOffset + 30 + nameLength;
    assert.deepEqual(bytes.slice(start, start + size), data);
    assert.equal(view.getUint32(localOffset + 14, true), crc32(data));
    assert.equal(view.getUint32(directory, true), 0x02014b50);
    assert.equal(view.getUint32(directory + 42, true), localOffset);
    assert.equal(view.getUint16(directory + 8, true), 0x0800);
    assert.equal(view.getUint32(directory + 16, true), crc32(data));
    directory += 46 + nameLength;
    localOffset = start + size;
  }
  assert.equal(localOffset, centralOffset);
  assert.equal(directory, end);
});

test('ZIP preserves subdirectories and resolves duplicate paths in call order', async () => {
  const zip = new ZipWriter();
  await Promise.all([
    zip.addText('a/test.txt', 'one'),
    zip.addText('a/test.txt', 'two'),
    zip.addText('b/test.txt', 'three'),
  ]);
  const text = new TextDecoder().decode(await (await zip.finish()).arrayBuffer());
  assert.ok(text.includes('a/test-2.txt'));
  assert.ok(text.includes('b/test.txt'));
  const empty = new Uint8Array(await (await new ZipWriter().finish()).arrayBuffer());
  assert.equal(empty.length, 22);
});
