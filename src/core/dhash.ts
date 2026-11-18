export function differenceHash(pixels: Uint8ClampedArray): string {
  let hash = 0n;
  const gray = (offset: number): number =>
    (pixels[offset] ?? 0) * 0.299 + (pixels[offset + 1] ?? 0) * 0.587 + (pixels[offset + 2] ?? 0) * 0.114;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const offset = (y * 9 + x) * 4;
      hash = (hash << 1n) | (gray(offset) > gray(offset + 4) ? 1n : 0n);
    }
  return hash.toString(16).padStart(16, '0');
}
