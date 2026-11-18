export interface NamingContext {
  index: number;
  name: string;
  ext: string;
  w?: number;
  h?: number;
  page?: string;
  host?: string;
  date?: Date;
  hash?: string;
}

export function renderTemplate(template: string, ctx: NamingContext): string {
  const date = ctx.date ?? new Date();
  const values: Record<string, string | number | undefined> = {
    ...ctx,
    index: String(ctx.index).padStart(3, '0'),
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  };
  return template
    .replace(/\.?\{ext\}/g, (token) => (ctx.ext ? (token.startsWith('.') ? '.' : '') + ctx.ext : ''))
    .replace(/\{([^{}]+)\}/g, (_, key: string) =>
      String(Object.hasOwn(values, key) ? (values[key] ?? '') : ''),
    );
}

function truncate(value: string, budget: number): string {
  let result = '';
  let bytes = 0;
  for (const char of value) {
    bytes += new TextEncoder().encode(char).length;
    if (bytes > budget) break;
    result += char;
  }
  return result;
}

export function sanitizeFileName(name: string): string {
  const cleaned = Array.from(name)
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 ? cleaned.slice(dot) : '';
  const suffix = truncate(ext, 119);
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  return truncate(stem, 120 - new TextEncoder().encode(suffix).length).trimEnd() + suffix || 'image';
}

export function uniqueFileName(name: string, used: Set<string>): string {
  const original = sanitizeFileName(name);
  let candidate = original;
  const dot = original.lastIndexOf('.');
  const ext = dot > 0 ? original.slice(dot) : '';
  const stem = dot > 0 ? original.slice(0, dot) : original;
  for (let n = 2; used.has(candidate); n++) {
    const suffix = `-${n}${ext}`;
    candidate = truncate(stem, 120 - new TextEncoder().encode(suffix).length) + suffix;
  }
  used.add(candidate);
  return candidate;
}
