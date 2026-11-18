export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(input)) {
    hash = Math.imul(hash ^ byte, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function imageId(url: string): string {
  return fnv1a(url);
}
