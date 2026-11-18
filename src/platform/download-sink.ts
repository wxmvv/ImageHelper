import { h } from '../ui/dom.ts';
export async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    if (typeof chrome !== 'undefined' && typeof chrome.downloads?.download === 'function') {
      try {
        await chrome.downloads.download({
          url,
          filename: fileName,
          conflictAction: 'uniquify',
          saveAs: false,
        });
        return;
      } catch {
        /* Safari may expose the namespace without implementing downloads. */
      }
    }
    const anchor = h('a', { attr: { href: url, download: fileName, hidden: true } });
    if ('download' in anchor) {
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } else if (!window.open(url, '_blank', 'noopener')) throw new Error('Download unavailable');
  } finally {
    // Downloads consume object URLs asynchronously, including Safari's anchor fallback.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
