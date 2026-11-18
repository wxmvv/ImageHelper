import type { DownloadItem } from '../core/types.ts';
import { isSupportedProtocol } from '../core/url.ts';

export interface DownloadFilesPayload {
  tabId: number;
  items: DownloadItem[];
  naming?: string;
}

export async function handleDownloadFiles(
  payload: DownloadFilesPayload,
  _sender: chrome.runtime.MessageSender,
): Promise<{
  started: number;
  failed: Array<{ url: string; reason: string }>;
  unsupported?: boolean;
}> {
  const failed: Array<{ url: string; reason: string }> = [];
  if (typeof chrome === 'undefined' || typeof chrome.downloads?.download !== 'function') {
    return {
      started: 0,
      failed: payload.items.map((item) => ({ url: item.url, reason: 'Downloads API unavailable' })),
      unsupported: true,
    };
  }
  let started = 0;
  for (const [index, item] of payload.items.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 120));
    try {
      if (!isSupportedProtocol(item.url) || /^(blob|data:(?!image\/))/i.test(item.url.trim()))
        throw new Error('Unsupported download URL');
      await chrome.downloads.download({
        url: item.url,
        filename: item.fileName,
        conflictAction: 'uniquify',
        saveAs: false,
      });
      started++;
    } catch (error) {
      failed.push({ url: item.url, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { started, failed };
}
