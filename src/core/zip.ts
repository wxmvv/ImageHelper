import { uniqueFileName } from './naming.ts';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  CRC_TABLE[n] = crc;
}

async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const byte of value) crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 255] ?? 0);
    }
  } finally {
    reader.releaseLock();
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: Uint8Array<ArrayBuffer>;
  blob: Blob;
  crc: number;
  time: number;
  date: number;
}

function header(size: number, signature: number): { bytes: Uint8Array<ArrayBuffer>; view: DataView } {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, signature, true);
  return { bytes, view };
}

export class ZipWriter {
  private entries: Entry[] = [];
  private used = new Set<string>();
  // Serializing additions keeps offsets and collision suffixes in call order.
  private pending: Promise<void> = Promise.resolve();

  get entryCount(): number {
    return this.entries.length;
  }

  add(path: string, data: Uint8Array | Blob): Promise<void> {
    const task = this.pending.then(async () => {
      if (this.entries.length >= 65535) throw new Error('ZIP entry limit exceeded');
      const parts = path
        .replace(/\\/g, '/')
        .split('/')
        .filter((part) => part && part !== '.' && part !== '..');
      const leaf = parts.pop() ?? 'image';
      const prefix = parts.length ? parts.join('/') + '/' : '';
      const names = new Set(
        Array.from(this.used)
          .filter((name) => name.startsWith(prefix))
          .map((name) => name.slice(prefix.length)),
      );
      const name = new TextEncoder().encode(prefix + uniqueFileName(leaf, names));
      const decoded = new TextDecoder().decode(name);
      if (name.length > 65535) throw new Error('ZIP path too long');
      const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)]);
      if (blob.size > 0xffffffff) throw new Error('ZIP64 is not supported');
      const now = new Date();
      const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
      const year = Math.min(2107, Math.max(1980, now.getFullYear()));
      const date = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
      const crc = await crc32(blob);
      this.used.add(decoded);
      this.entries.push({ name, blob, crc, time, date });
    });
    this.pending = task;
    return task;
  }

  addText(path: string, text: string): Promise<void> {
    return this.add(path, new Blob([text]));
  }

  async finish(): Promise<Blob> {
    await this.pending;
    const parts: BlobPart[] = [];
    const central: BlobPart[] = [];
    let offset = 0;
    let centralSize = 0;
    for (const entry of this.entries) {
      const local = header(30, 0x04034b50);
      local.view.setUint16(4, 20, true);
      local.view.setUint16(6, 0x0800, true);
      local.view.setUint16(10, entry.time, true);
      local.view.setUint16(12, entry.date, true);
      local.view.setUint32(14, entry.crc, true);
      local.view.setUint32(18, entry.blob.size, true);
      local.view.setUint32(22, entry.blob.size, true);
      local.view.setUint16(26, entry.name.length, true);
      parts.push(local.bytes, entry.name, entry.blob);
      const directory = header(46, 0x02014b50);
      directory.view.setUint16(4, 20, true);
      directory.view.setUint16(6, 20, true);
      directory.view.setUint16(8, 0x0800, true);
      directory.view.setUint16(12, entry.time, true);
      directory.view.setUint16(14, entry.date, true);
      directory.view.setUint32(16, entry.crc, true);
      directory.view.setUint32(20, entry.blob.size, true);
      directory.view.setUint32(24, entry.blob.size, true);
      directory.view.setUint16(28, entry.name.length, true);
      directory.view.setUint32(42, offset, true);
      central.push(directory.bytes, entry.name);
      centralSize += 46 + entry.name.length;
      offset += 30 + entry.name.length + entry.blob.size;
      if (offset + centralSize > 0xffffffff) throw new Error('ZIP64 is not supported');
    }
    const end = header(22, 0x06054b50);
    end.view.setUint16(8, this.entries.length, true);
    end.view.setUint16(10, this.entries.length, true);
    end.view.setUint32(12, centralSize, true);
    end.view.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.bytes], { type: 'application/zip' });
  }
}
