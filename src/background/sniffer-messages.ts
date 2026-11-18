import { broadcast } from '../platform/rpc.ts';
import { ensurePageSession } from './handlers.ts';
import { imageRecords, objectPayload } from './message-data.ts';
import { sessions } from './sessions.ts';

export function registerSnifferMessages(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((value: unknown, sender) => {
    if (!value || typeof value !== 'object' || sender.tab?.id === undefined) return false;
    const message = value as Record<string, unknown>;
    if (message.type !== 'sniffer:hello' && message.type !== 'sniffer:batch') return false;
    const tabId = sender.tab.id;
    void (async () => {
      const payload = objectPayload(message.payload);
      if (typeof payload.frameUrl !== 'string') return;
      const session = await ensurePageSession(tabId);
      const frameId = sender.frameId ?? 0;
      const images = message.type === 'sniffer:batch' ? imageRecords(payload.images) : [];
      sessions.addImages(tabId, frameId, images, payload.frameUrl);
      if (message.type === 'sniffer:batch') sessions.markFrameDone(tabId, frameId);
      const ids = new Set(images.map((image) => image.id));
      const accepted = session.images.filter((image) => ids.has(image.id));
      broadcast('session:images', { tabId, rev: session.rev, page: session.page, images: accepted });
      broadcast('session:status', {
        tabId,
        frames: Object.fromEntries(
          session.page.frames.map((frame) => [frame.frameId, { url: frame.url, done: frame.done }]),
        ),
      });
    })().catch((error: unknown) => console.warn('Sniffer message failed', error));
    return false;
  });
}
