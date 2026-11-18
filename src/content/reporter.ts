import { imageId } from '../core/hash.ts';
import type { ImageRecord } from '../core/types.ts';
import { absolutize, extFromUrl, isImageUrl, isTrackingEndpoint, normalizeUrl } from '../core/url.ts';
import { callRuntimeMessage, sendToBackground } from '../platform/rpc.ts';
import type { RawImage } from './types.ts';

export interface ReporterOptions {
  maxImages: number;
  includeDataUrls: boolean;
}

export class Reporter {
  private readonly options: ReporterOptions;
  private readonly records = new Map<string, ImageRecord>();
  private readonly queue = new Map<string, ImageRecord>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sending: Promise<void> | undefined;
  private retries = 0;
  private capped = false;

  constructor(options: ReporterOptions) {
    this.options = options;
  }
  get count(): number {
    return this.records.size;
  }
  get truncated(): boolean {
    return this.capped;
  }

  push(images: RawImage[]): void {
    for (const raw of images) {
      if (!raw.url.trim()) continue;
      const absolute = absolutize(raw.url, document.baseURI);
      if (!absolute || !/^(https?:|data:image\/)/i.test(absolute)) continue;
      if (
        /^data:/i.test(absolute) &&
        (!this.options.includeDataUrls ||
          absolute.length >= 200000 ||
          /^data:image\/gif;base64,R0lGODlhAQ/i.test(absolute))
      )
        continue;
      // Payload scanning is heuristic: drop beacon/log endpoints unless they really look like images.
      if (raw.source === 'page-hook' && isTrackingEndpoint(absolute) && !isImageUrl(absolute)) continue;
      const url = normalizeUrl(absolute);
      const old = this.records.get(url);
      if (!old && this.count >= this.options.maxImages) {
        this.capped = true;
        continue;
      }
      const record: ImageRecord = old
        ? { ...old }
        : {
            id: imageId(url),
            url,
            ext: extFromUrl(url),
            source: raw.source,
            discoveredAt: Date.now(),
            frameUrl: location.href,
          };
      // Later network and DOM observations complement each other; visible wins.
      for (const [key, value] of Object.entries(raw)) {
        if (['url', 'source'].includes(key) || value === undefined) continue;
        if (key === 'hidden') record.hidden = record.hidden === false ? false : (value as boolean);
        else if (key === 'inViewport') record.inViewport = record.inViewport === true || value === true;
        else if (value !== 0 && value !== '') Object.assign(record, { [key]: value });
      }
      if (old && JSON.stringify(old) === JSON.stringify(record)) continue;
      this.records.set(url, record);
      this.queue.set(url, record);
    }
    if (this.queue.size >= 100) void this.flushNow();
    else if (this.queue.size && !this.timer) this.schedule(250);
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flushNow();
    }, ms);
  }

  async flushNow(): Promise<void> {
    if (this.sending) {
      await this.sending;
      return this.flushNow();
    }
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.queue.size) return;
    const batch = [...this.queue.values()];
    this.sending = (async () => {
      try {
        // One-way sniffer handlers do not acknowledge batches. Probe readiness via RPC.
        await sendToBackground('settings:get', {});
        await callRuntimeMessage({
          type: 'sniffer:batch',
          payload: { frameUrl: location.href, images: batch, truncated: this.truncated },
        });
        for (const record of batch) if (this.queue.get(record.url) === record) this.queue.delete(record.url);
        this.retries = 0;
      } catch (error) {
        if (++this.retries <= 5) this.schedule(300);
        else {
          this.queue.clear();
          this.retries = 0;
          console.warn('ImageHelper batch discarded after retries', error);
        }
      }
    })();
    await this.sending;
    this.sending = undefined;
    if (this.queue.size && !this.timer) this.schedule(250);
  }
}
