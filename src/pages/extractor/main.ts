import { applyPageSettings, watchSettings } from '../../platform/page-settings.ts';
import { defaultFilter } from '../../core/filter.ts';
import type { PageInfo, PageSession, ImageRecord } from '../../core/types.ts';
import { t, setLocale } from '../../platform/i18n.ts';
import { onRuntimeMessage, sendToBackground } from '../../platform/rpc.ts';
import { readExtractorFilter, readSettings } from '../../platform/storage.ts';
import { applyStoredTheme } from '../../platform/theme.ts';
import { toast } from '../../ui/toast.ts';
import { createDownloads } from './download-ui.ts';
import { bindFilters, resetFilters } from './filters.ts';
import { bindGrid } from './grid.ts';
import { bindHashing } from './hashing.ts';
import { bindHeader } from './header.ts';
import { createLayout } from './layout.ts';
import { createLightbox } from './lightbox.ts';
import { bindShortcuts } from './shortcuts.ts';
import { store } from './state.ts';
let disposePage = (): void => {};
let currentLanguage = '';
async function bootstrap(): Promise<void> {
  disposePage();
  const settings = await readSettings();
  currentLanguage = settings.language;
  setLocale(settings.language);
  await applyStoredTheme();
  const filter = await readExtractorFilter(
    defaultFilter(settings.minWidth, settings.minHeight, settings.minBytes),
  );
  const raw = new URLSearchParams(location.search).get('tabId');
  const tabId = raw === null ? -1 : Number(raw);
  if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error('Invalid source tab');
  store.patch({ tabId, filter });
  document.title = t('extTitle');
  const root = document.getElementById('app');
  if (!root) return;
  const layout = createLayout(root);
  const downloads = createDownloads(layout.progress, settings);
  const lightbox = createLightbox(layout.lightbox, downloads.run);
  const filters = bindFilters(layout.filters);
  let commandToken = 0;
  const command = async (type: string): Promise<void> => {
    if (type === 'options') {
      window.open('./options.html', '_blank', 'noopener');
      return;
    }
    const token = ++commandToken;
    const scrolling = type === 'page:autoscroll';
    store.patch({ scanning: type === 'extract:rescan', autoScrolling: scrolling });
    try {
      const reply = await sendToBackground<unknown, { frames: number }>(
        type,
        { tabId },
        scrolling ? 40000 : 8000,
      );
      if (!reply.frames) toast(t('extSourceUnavailable'));
    } catch {
      toast(t('extSourceUnavailable'));
    } finally {
      if (token === commandToken) store.patch({ scanning: false, autoScrolling: false });
    }
  };
  const header = bindHeader(layout.header, layout.filters, layout.selection, downloads.run, (type) => {
    void command(type);
  });
  const off = [
    header.dispose,
    bindGrid(layout.grid, layout.loaded, settings, lightbox.open, downloads.run, resetFilters, () => {
      void command('extract:rescan');
    }),
    bindShortcuts(lightbox.open, lightbox.isOpen, () => {
      header.showFilters(true);
      filters.search.focus();
    }),
    bindHashing(),
  ];
  // Subscribe before the snapshot request so records arriving during bootstrap are retained.
  let resetVersion = 0;
  off.push(
    onRuntimeMessage((type, payload) => {
      if (!payload || typeof payload !== 'object') return;
      const data = payload as {
        tabId: number;
        rev: number;
        page: PageInfo;
        images: ImageRecord[];
        frames: Record<string, { url: string; done: boolean }>;
      };
      if (data.tabId !== tabId) return;
      if (type === 'session:images' && data.rev >= store.get().rev) {
        const records = new Map(store.get().images.map((i) => [i.id, i]));
        for (const image of data.images) records.set(image.id, image);
        store.patch({ images: [...records.values()], rev: data.rev, page: data.page });
      }
      if (type === 'session:status') {
        const frames = Object.entries(data.frames).map(([id, frame]) => ({
          frameId: Number(id),
          ...frame,
          imageCount: 0,
        }));
        store.patch({ page: { ...store.get().page, frames }, scanning: frames.some((f) => !f.done) });
      }
      if (type === 'session:reset') {
        resetVersion++;
        store.patch({
          images: [],
          selected: new Set(),
          rev: -1,
          hash: new Map(),
          expanded: new Set(),
          scanning: false,
        });
      }
    }),
  );
  const version = resetVersion;
  const reply = await sendToBackground<unknown, { session: PageSession }>('session:get', { tabId });
  const s = store.get();
  if (version === resetVersion) {
    const snapshot = reply.session;
    const newer = snapshot.rev >= s.rev;
    const images = new Map((newer ? s.images : snapshot.images).map((i) => [i.id, i]));
    for (const image of newer ? snapshot.images : s.images) images.set(image.id, image);
    store.patch({
      page: newer ? snapshot.page : s.page,
      images: [...images.values()],
      rev: Math.max(snapshot.rev, s.rev),
    });
  }
  // A newly opened extractor also works without going through the popup.
  if (!store.get().images.length) void command('extract:rescan');
  disposePage = () => {
    off.forEach((fn) => fn());
    filters.dispose();
    lightbox.dispose();
    downloads.dispose();
  };
}
const stopWatching = watchSettings((settings) => {
  applyPageSettings(settings);
  if (settings.language !== currentLanguage) void bootstrap().catch(() => toast(t('extSourceUnavailable')));
});
window.addEventListener(
  'pagehide',
  () => {
    stopWatching();
    disposePage();
  },
  { once: true },
);
void bootstrap().catch(() => toast(t('extSourceUnavailable')));
