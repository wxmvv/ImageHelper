export function parseSrcset(srcset: string): Array<{ url: string; width?: number; density?: number }> {
  const candidates: Array<{ url: string; width?: number; density?: number }> = [];
  let rest = srcset;
  while (rest.length) {
    rest = rest.replace(/^[\s,]+/, '');
    if (!rest) break;
    const token = rest.match(/^\S+/)?.[0] ?? '';
    rest = rest.slice(token.length);
    // Data URLs contain commas, so only descriptor separators end those URLs.
    const comma = token.startsWith('data:') ? -1 : token.indexOf(',');
    if (comma >= 0) {
      candidates.push({ url: token.slice(0, comma) });
      rest = token.slice(comma + 1) + rest;
      continue;
    }
    if (token.endsWith(',')) {
      candidates.push({ url: token.replace(/,+$/, '') });
      continue;
    }
    const end = rest.indexOf(',');
    const descriptors = (end < 0 ? rest : rest.slice(0, end)).trim();
    rest = end < 0 ? '' : rest.slice(end + 1);
    if (!descriptors) {
      candidates.push({ url: token });
      continue;
    }
    const match = descriptors.match(/^(\d+(?:\.\d+)?)(w|x)$/);
    const value = Number(match?.[1]);
    if (!match || value <= 0 || !Number.isFinite(value)) continue;
    if (match[2] === 'w' && Number.isInteger(value)) candidates.push({ url: token, width: value });
    else if (match[2] === 'x') candidates.push({ url: token, density: value });
  }
  return candidates;
}

export function largestCandidate(srcset: string): string | null {
  let best: ReturnType<typeof parseSrcset>[number] | undefined;
  for (const candidate of parseSrcset(srcset)) {
    if (!best || (candidate.width ?? candidate.density ?? 1) > (best.width ?? best.density ?? 1))
      best = candidate;
  }
  return best?.url ?? null;
}
