import { DEFAULT_SETTINGS } from '../core/settings.ts';
import type { ImageRecord, PageInfo, PageSession } from '../core/types.ts';
import { readSession, readSettings, removeSession, writeSession } from '../platform/storage.ts';

const memory = new Map<number, PageSession>();
const indices = new Map<number, Map<string, ImageRecord>>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const generations = new Map<number, number>();
let maxImages = DEFAULT_SETTINGS.maxImagesPerPage;
void readSettings().then((settings) => {
  maxImages = settings.maxImagesPerPage;
});
if (typeof chrome !== 'undefined') {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      void readSettings().then((settings) => {
        maxImages = settings.maxImagesPerPage;
      });
    }
  });
}

function touch(session: PageSession): void {
  session.rev++;
  session.updatedAt = Date.now();
  clearTimeout(timers.get(session.tabId));
  timers.set(
    session.tabId,
    setTimeout(() => {
      timers.delete(session.tabId);
      void writeSession(`session:${session.tabId}`, session);
    }, 500),
  );
}

function ensure(tabId: number, page: PageInfo): PageSession {
  let session = memory.get(tabId);
  if (!session) {
    session = {
      tabId,
      page: { ...page, tabId, frames: page.frames.map((frame) => ({ ...frame })) },
      rev: 0,
      images: [],
      truncated: false,
      updatedAt: Date.now(),
    };
    memory.set(tabId, session);
    indices.set(tabId, new Map());
    touch(session);
  }
  return session;
}

function addImages(tabId: number, frameId: number, images: ImageRecord[], frameUrl: string): ImageRecord[] {
  const session = memory.get(tabId);
  const index = indices.get(tabId);
  if (!session || !index) return [];
  let frame = session.page.frames.find((entry) => entry.frameId === frameId);
  if (!frame) {
    frame = { frameId, url: frameUrl, done: false, imageCount: 0 };
    session.page.frames.push(frame);
  }
  frame.url = frameUrl;
  const added: ImageRecord[] = [];
  for (const image of images) {
    const old = index.get(image.id);
    if (old) {
      // Keep discovery order while incorporating richer observations from later frames.
      const richer = (!old.width && !!image.width) || (!old.bytes && !!image.bytes);
      for (const key of Object.keys(image) as Array<keyof ImageRecord>) {
        if (key === 'discoveredAt' || key === 'id' || key === 'url') continue;
        if ((richer || old[key] === undefined || old[key] === '') && image[key] !== undefined)
          Object.assign(old, { [key]: image[key] });
      }
      continue;
    }
    if (session.images.length >= maxImages) {
      session.truncated = true;
      continue;
    }
    const record = { ...image };
    session.images.push(record);
    index.set(record.id, record);
    added.push(record);
    frame.imageCount++;
  }
  touch(session);
  return added;
}

function clear(tabId: number): void {
  generations.set(tabId, (generations.get(tabId) ?? 0) + 1);
  clearTimeout(timers.get(tabId));
  timers.delete(tabId);
  memory.delete(tabId);
  indices.delete(tabId);
  void removeSession(`session:${tabId}`);
}

export const sessions = {
  ensure,
  get(tabId: number): PageSession | null {
    return memory.get(tabId) ?? null;
  },
  addImages,
  markFrameDone(tabId: number, frameId: number): void {
    const session = memory.get(tabId);
    const frame = session?.page.frames.find((entry) => entry.frameId === frameId);
    if (session && frame) {
      frame.done = true;
      touch(session);
    }
  },
  setPage(tabId: number, page: Partial<PageInfo>): void {
    const session = memory.get(tabId);
    if (session) {
      Object.assign(session.page, page, { tabId });
      touch(session);
    }
  },
  clear,
  async restore(tabId: number): Promise<PageSession | null> {
    const current = memory.get(tabId);
    if (current) return current;
    const generation = generations.get(tabId) ?? 0;
    const saved = await readSession<PageSession>(`session:${tabId}`);
    if ((generations.get(tabId) ?? 0) !== generation) return null;
    const live = memory.get(tabId);
    if (live) return live;
    if (
      !saved ||
      saved.tabId !== tabId ||
      !Array.isArray(saved.images) ||
      !saved.page ||
      !Array.isArray(saved.page.frames)
    )
      return null;
    memory.set(tabId, saved);
    indices.set(tabId, new Map(saved.images.map((image) => [image.id, image])));
    return saved;
  },
};
