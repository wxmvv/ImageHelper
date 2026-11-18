import { differenceHash } from '../../core/dhash.ts';
self.onmessage = async (event: MessageEvent<{ id: string; url: string }>) => {
  const { id, url } = event.data;
  let hash: string | null = null;
  try {
    const response = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(String(response.status));
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const canvas = new OffscreenCanvas(9, 8);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, 9, 8);
        hash = differenceHash(ctx.getImageData(0, 0, 9, 8).data);
      }
    } finally {
      bitmap.close();
    }
  } catch {
    /* Failed hashes remain visible rather than disappearing from the grid. */
  }
  self.postMessage({ id, hash });
};
