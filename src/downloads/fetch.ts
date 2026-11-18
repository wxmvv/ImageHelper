import { isSupportedProtocol } from '../core/url.ts';
export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
function decodeData(url: string): Blob {
  const comma = url.indexOf(',');
  const header = url.slice(5, comma);
  const encoded = url.slice(comma + 1);
  const text = /;base64/i.test(header) ? atob(encoded) : decodeURIComponent(encoded);
  const bytes = /;base64/i.test(header)
    ? Uint8Array.from(text, (char) => char.charCodeAt(0))
    : new TextEncoder().encode(text);
  return new Blob([bytes], { type: header.split(';')[0] });
}
export async function fetchImage(url: string, pageUrl: string, signal: AbortSignal): Promise<Blob> {
  if (!isSupportedProtocol(url) || /^(blob|data:(?!image\/))/i.test(url))
    throw new Error('Unsupported image URL');
  if (url.startsWith('data:')) {
    signal.throwIfAborted();
    return decodeData(url);
  }
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const controller = new AbortController();
    const abort = (): void => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('Request timed out')), 30000);
    try {
      const response = await fetch(url, {
        credentials: 'include',
        referrer: /^https?:/.test(pageUrl) ? pageUrl : '',
        cache: 'force-cache',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } catch (error) {
      if (signal.aborted || attempt >= 2) throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
    await pause(attempt === 0 ? 500 : 1500, signal);
  }
}
