import { renderTemplate, sanitizeFileName, uniqueFileName } from '../core/naming.ts';
import { extFromMime } from '../core/url.ts';
import type { DownloadResult, ImageRecord } from '../core/types.ts';
import { ZipWriter } from '../core/zip.ts';
import { saveBlob } from '../platform/download-sink.ts';
import { sendToBackground } from '../platform/rpc.ts';
import { fetchImage, pause } from './fetch.ts';
export interface DownloadProgress {
  phase: 'fetching' | 'packing' | 'saving';
  done: number;
  total: number;
  failed: number;
  currentUrl?: string;
}
function fileNameFromUrl(url: string): string {
  try {
    return (
      decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').replace(/\.[^.]+$/, '') || 'image'
    );
  } catch {
    return 'image';
  }
}
/**
 * CDNs happily answer `?f=JPEG` with a WebP body, so trust the response MIME when it is an image.
 */
export function alignExtension(fileName: string, mime: string): string {
  const ext = extFromMime(mime);
  if (!mime.toLowerCase().startsWith('image/') || ext === 'img') return fileName;
  const dot = fileName.lastIndexOf('.');
  return dot <= 0 ? `${fileName}.${ext}` : `${fileName.slice(0, dot)}.${ext}`;
}

function sourceHost(url: string): string {
  try {
    return sanitizeFileName(new URL(url).host) || 'images';
  } catch {
    return 'images';
  }
}
export function buildFileNames(
  records: ImageRecord[],
  template: string,
  pageTitle: string,
  pageUrl = '',
): string[] {
  const used = new Set<string>();
  return records.map((record, index) =>
    uniqueFileName(
      sanitizeFileName(
        renderTemplate(template, {
          index: index + 1,
          name: fileNameFromUrl(record.url),
          ext: record.ext,
          w: record.width,
          h: record.height,
          page: pageTitle,
          host: sourceHost(pageUrl || record.frameUrl || record.url),
          date: new Date(),
          hash: record.id,
        }),
      ),
      used,
    ),
  );
}
export class DownloadEngine {
  private controller = new AbortController();
  private readonly pageUrl: string;
  private readonly pageTitle: string;
  private readonly onProgress: (p: DownloadProgress) => void;
  constructor(pageUrl: string, onProgress: (p: DownloadProgress) => void, pageTitle = '') {
    this.pageUrl = pageUrl;
    this.pageTitle = pageTitle;
    this.onProgress = onProgress;
  }
  cancel(): void {
    this.controller.abort();
  }
  async run(
    records: ImageRecord[],
    mode: 'zip' | 'files',
    template: string,
    hostFolders = false,
  ): Promise<DownloadResult> {
    const signal = this.controller.signal;
    const result: DownloadResult = { ok: [], failed: [] };
    // Keep the port readable (127.0.0.1:8123 → 127.0.0.1-8123) instead of gluing digits together.
    const host = /^https?:/.test(this.pageUrl) ? new URL(this.pageUrl).host.replace(/:/g, '-') : 'images';
    const title = this.pageTitle || document.title;
    const folder = sanitizeFileName(`${host}-${sanitizeFileName(title).slice(0, 60)}`);
    const names = buildFileNames(records, template, title, this.pageUrl);
    const items = records.map((record, i) => ({
      url: record.url,
      fileName: names[i] ?? 'image',
      referer: hostFolders ? record.frameUrl || this.pageUrl : this.pageUrl,
    }));
    const report = (phase: DownloadProgress['phase'], currentUrl?: string): void =>
      this.onProgress({
        phase,
        done: result.ok.length + result.failed.length,
        total: items.length,
        failed: result.failed.length,
        currentUrl,
      });
    report('fetching');
    if (mode === 'files') {
      // One-item requests keep cancellation effective between background downloads.
      let unsupported = false;
      for (const item of items) {
        if (signal.aborted) break;
        try {
          if (!unsupported) {
            const reply = await sendToBackground<
              unknown,
              { started: number; failed: DownloadResult['failed']; unsupported?: boolean }
            >('download:files', {
              tabId: Number(new URLSearchParams(location.search).get('tabId')),
              items: [item],
              naming: template,
            });
            unsupported = reply.unsupported === true;
            if (!unsupported) {
              if (reply.started) result.ok.push(item.url);
              else result.failed.push(...reply.failed);
            }
          }
          if (unsupported) {
            const blob = await fetchImage(item.url, item.referer, signal);
            signal.throwIfAborted();
            await saveBlob(blob, alignExtension(item.fileName, blob.type));
            result.ok.push(item.url);
          }
          report('fetching', item.url);
          await pause(unsupported ? 250 : 120, signal);
        } catch (error) {
          if (signal.aborted) break;
          result.failed.push({
            url: item.url,
            reason: error instanceof Error ? error.message : String(error),
          });
          report('fetching', item.url);
        }
      }
      return result;
    }
    const zip = new ZipWriter();
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < items.length && !signal.aborted) {
        const item = items[cursor++];
        if (!item) return;
        try {
          const blob = await fetchImage(item.url, item.referer, signal);
          signal.throwIfAborted();
          const directory = hostFolders ? sourceHost(item.referer) : folder;
          await zip.add(`${directory}/${alignExtension(item.fileName, blob.type)}`, blob);
          result.ok.push(item.url);
        } catch (error) {
          if (!signal.aborted)
            result.failed.push({
              url: item.url,
              reason: error instanceof Error ? error.message : String(error),
            });
        }
        report('fetching', item.url);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    if (!signal.aborted && zip.entryCount) {
      report('packing');
      const blob = await zip.finish();
      if (!signal.aborted) {
        report('saving');
        await saveBlob(blob, folder + '.zip');
      }
    }
    return result;
  }
}
