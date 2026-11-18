import type { Settings } from '../../core/types.ts';
import { t } from '../../platform/i18n.ts';
import { applyPageSettings, watchSettings } from '../../platform/page-settings.ts';
import { sendToBackground } from '../../platform/rpc.ts';
import { readSettings } from '../../platform/storage.ts';
import { delegate, h } from '../../ui/dom.ts';
import { icon } from '../../ui/icons.ts';
import { toast } from '../../ui/toast.ts';

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app')!;
  let tab: chrome.tabs.Tab | undefined;
  let extracting = false;
  try {
    if (typeof chrome !== 'undefined') {
      [tab] = (await chrome.tabs?.query({ active: true, currentWindow: true })) ?? [];
    }
  } catch {
    /* Missing optional APIs retain the restricted-page state. */
  }
  const initialSettings = await readSettings();
  let shortcut = initialSettings.extractionShortcut;
  const render = (): void => {
    let host = '';
    try {
      host = new URL(tab?.url ?? '').host;
    } catch {
      /* Blank tabs have no host. */
    }
    const restricted = tab?.id === undefined || !/^https?:\/\//i.test(tab.url ?? '');
    document.title = t('extBrand');
    root.replaceChildren(
      h(
        'div',
        { class: 'ih-popup' },
        h('header', { class: 'ih-popup__brand' }, icon('logo', 20), t('extBrand')),
        h(
          'div',
          { class: 'ih-popup__page' },
          tab?.favIconUrl && /^https?:/.test(tab.favIconUrl)
            ? h('img', { attr: { src: tab.favIconUrl, alt: '', width: 16, height: 16 } })
            : icon('image'),
          h('span', { class: 'ih-popup__title', text: tab?.title || t('popupRestricted') }),
          h('span', { class: 'ih-popup__host', text: host }),
        ),
        h(
          'button',
          {
            class: 'ih-button ih-button--primary ih-popup__cta',
            data: { action: 'extract' },
            attr: { disabled: restricted || extracting },
          },
          icon('image'),
          t(extracting ? 'popupLoading' : 'popupExtract'),
        ),
        restricted ? h('p', { class: 'ih-popup__restricted', text: t('popupRestricted') }) : null,
        h(
          'nav',
          { class: 'ih-popup__links' },
          h(
            'button',
            { class: 'ih-button ih-button--ghost', data: { action: 'multi' } },
            icon('grid'),
            t('popupMulti'),
          ),
          h(
            'button',
            { class: 'ih-button ih-button--ghost', data: { action: 'options' } },
            icon('settings'),
            t('popupOptions'),
          ),
        ),
        h(
          'footer',
          { class: 'ih-popup__hint' },
          ...shortcut
            .replace(/⌥/g, 'Alt+')
            .replace(/⇧/g, 'Shift+')
            .replace(/⌘/g, 'Command+')
            .replace(/⌃/g, 'Ctrl+')
            .split('+')
            .map((key) => key.trim())
            .filter(Boolean)
            .map((key) =>
              h('kbd', {
                text:
                  ({ Alt: '⌥', Shift: '⇧', Command: '⌘', MacCtrl: '⌃' } as Record<string, string>)[key] ??
                  key,
              }),
            ),
          h('span', {
            text: shortcut ? t('popupShortcut', { shortcut: '' }).trim() : t('popupShortcutDisabled'),
          }),
        ),
      ),
    );
  };
  const applySettings = (settings: Settings): void => {
    shortcut = settings.extractionShortcut;
    applyPageSettings(settings);
    document.documentElement.classList.toggle('is-transparent', settings.transparentPopup);
    render();
  };
  applySettings(initialSettings);
  delegate(root, '[data-action]', 'click', (_event, el) => {
    void (async () => {
      try {
        if (el.dataset.action === 'extract') {
          if (extracting) return;
          extracting = true;
          render();
          const reply = await sendToBackground<unknown, { ok: boolean }>('extract:start', { tabId: tab?.id });
          if (!reply.ok) throw new Error();
          window.close();
        }
        if (el.dataset.action === 'multi') {
          if (typeof chrome === 'undefined' || !chrome.tabs?.create) throw new Error();
          await chrome.tabs.create({ url: chrome.runtime.getURL('multiurl.html') });
          window.close();
        }
        if (el.dataset.action === 'options') {
          if (typeof chrome === 'undefined' || !chrome.runtime?.openOptionsPage) throw new Error();
          await chrome.runtime.openOptionsPage();
        }
      } catch {
        extracting = false;
        render();
        toast(t('popupError'));
      }
    })();
  });
  const off = watchSettings(applySettings);
  window.addEventListener('pagehide', off, { once: true });
}
void bootstrap().catch(() => toast(t('popupError')));
