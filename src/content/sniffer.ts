import { bindExtractionShortcut } from './shortcut.ts';
import { DEFAULT_SETTINGS } from '../core/settings.ts';
import type { Settings } from '../core/types.ts';
import { callRuntimeMessage, sendToBackground } from '../platform/rpc.ts';
import { startAutoScroll, stopAutoScroll } from './autoscroll.ts';
import { scanComputedStyles, scanStyleSheets } from './css-scan.ts';
import { scanDom, LAZY_ATTRIBUTES } from './dom-scan.ts';
import { scanLazyAttrs } from './lazy-scan.ts';
import { collectResourceEntries, observeResourceEntries } from './network-scan.ts';
import { Reporter } from './reporter.ts';
import type { RawImage } from './types.ts';

function install(): void {
  const offShortcut = bindExtractionShortcut();
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) offShortcut();
  });
  let settings = DEFAULT_SETTINGS;
  let reporter: Reporter | undefined;
  let active = false;
  const buffered: RawImage[] = [];
  const push = (images: RawImage[]): void => {
    if (active && reporter) reporter.push(images);
    else if (buffered.length < 10000) buffered.push(...images.slice(0, 10000 - buffered.length));
  };
  const guarded = async (action: () => void | Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (error) {
      console.warn('ImageHelper scan failed', error);
    }
  };
  // Capture early page activity while settings are still in flight.
  observeResourceEntries((images) => push(settings.scanNetwork ? images : []));
  const token = crypto.randomUUID();
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window || !settings.scanPageHook || !event.data || typeof event.data !== 'object')
      return;
    const data = event.data as Record<string, unknown>;
    if (data.__ih_hook !== token || !Array.isArray(data.images)) return;
    push(
      data.images
        .filter((url): url is string => typeof url === 'string')
        .map((url) => ({ url, source: 'page-hook' })),
    );
  });
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    const inject = (): boolean => {
      const root = document.head || document.documentElement;
      if (!root) return false;
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('page-hook.js');
      script.setAttribute('data-ih-token', token);
      script.onload = script.onerror = () => script.remove();
      root.appendChild(script);
      return true;
    };
    if (!inject()) {
      const observer = new MutationObserver(() => {
        if (inject()) observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  }
  const ready = sendToBackground<Record<string, never>, Settings>('settings:get', {})
    .catch(() => DEFAULT_SETTINGS)
    .then((value) => {
      settings = value;
      reporter = new Reporter({
        maxImages: settings.maxImagesPerPage,
        includeDataUrls: settings.includeDataUrls,
      });
    });
  const incremental = (): void => {
    if (active)
      void guarded(() => {
        reporter?.push(scanDom(settings));
      });
  };
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const mutations = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(incremental, 500);
  });
  mutations.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'style', 'poster', 'href', ...LAZY_ATTRIBUTES],
  });
  setInterval(() => {
    if (!document.hidden) incremental();
  }, 2000);
  const fullScan = async (): Promise<void> => {
    reporter?.push(scanDom(settings));
    reporter?.push(scanLazyAttrs());
    if (settings.scanCss) {
      reporter?.push(scanStyleSheets());
      reporter?.push(await scanComputedStyles());
    }
    if (settings.scanNetwork) reporter?.push(collectResourceEntries());
    await reporter?.flushNow();
  };
  if (typeof chrome !== 'undefined') {
    void callRuntimeMessage({
      type: 'sniffer:hello',
      payload: { frameUrl: location.href, frameDepth: window === window.top ? 0 : 1 },
    });
    chrome.runtime?.onMessage?.addListener((message: unknown, _sender, respond) => {
      if (!message || typeof message !== 'object') return false;
      const command = message as Record<string, unknown>;
      if (command.type === 'sniffer:ping') {
        respond({ frameUrl: location.href, imageCount: reporter?.count ?? 0 });
        return false;
      }
      if (command.type === 'sniffer:stopscroll') {
        stopAutoScroll();
        respond({ stopped: true });
        return false;
      }
      if (command.type !== 'sniffer:activate' && command.type !== 'sniffer:autoscroll') return false;
      void guarded(async () => {
        await ready;
        active = true;
        reporter?.push(
          buffered.filter((image) =>
            image.source === 'network' ? settings.scanNetwork : settings.scanPageHook,
          ),
        );
        buffered.length = 0;
        if (command.type === 'sniffer:autoscroll') {
          const timer = setInterval(incremental, 500);
          try {
            await startAutoScroll();
          } finally {
            clearInterval(timer);
          }
          await fullScan();
        } else if (command.full === true) await fullScan();
        else await reporter?.flushNow();
      }).then(() => respond({ count: reporter?.count ?? 0 }));
      return true;
    });
  }
}

// executeScript is a fallback after static injection, so installation must be idempotent.
const scope = globalThis as typeof globalThis & { __ihSnifferInstalled?: boolean };
if (!scope.__ihSnifferInstalled) {
  scope.__ihSnifferInstalled = true;
  try {
    install();
  } catch (error) {
    console.warn('ImageHelper sniffer unavailable', error);
  }
}
