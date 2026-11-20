import { DEFAULT_SETTINGS } from '../../core/settings.ts';
import type { Settings } from '../../core/types.ts';
import { t } from '../../platform/i18n.ts';
import { isIOS } from '../../platform/ios.ts';
import { applyPageSettings, watchSettings } from '../../platform/page-settings.ts';
import { broadcast } from '../../platform/rpc.ts';
import { readSettings, writeSettings } from '../../platform/storage.ts';
import { debounce, delegate, h, on } from '../../ui/dom.ts';
import { icon } from '../../ui/icons.ts';
import { toast } from '../../ui/toast.ts';
import { shortcutControls, recordShortcut } from './shortcut.ts';
import { observeNavigation } from './navigation.ts';
import { field, languageField, namingPreview, numberField, segmented, toggle } from './fields.ts';

async function bootstrap(): Promise<void> {
  let settings = await readSettings();
  let patch: Partial<Settings> = {};
  let savedTimer: ReturnType<typeof setTimeout>;
  const root = document.getElementById('app')!;
  const groups = ['optSniff', 'optSize', 'optDownload', 'optAppearance', 'optShortcuts', 'optAbout'];
  let offNavigation = (): void => {};
  const render = (): void => {
    offNavigation();
    applyPageSettings(settings);
    document.title = t('optTitle');
    const card = (key: string, ...children: HTMLElement[]): HTMLElement =>
      h('section', { class: 'ih-options__card', attr: { id: key } }, h('h2', { text: t(key) }), ...children);
    let version = '';
    try {
      if (typeof chrome !== 'undefined') version = chrome.runtime?.getManifest().version ?? '';
    } catch {
      /* Optional platform metadata. */
    }
    root.replaceChildren(
      h(
        'div',
        { class: 'ih-options' },
        h(
          'aside',
          { class: 'ih-options__sidebar' },
          h('header', { class: 'ih-options__brand' }, icon('logo', 20), t('extBrand')),
          h(
            'nav',
            {},
            ...groups.map((key) =>
              h('a', { class: 'ih-button ih-button--ghost', attr: { href: '#' + key }, text: t(key) }),
            ),
          ),
        ),
        h(
          'main',
          { class: 'ih-options__content' },
          h(
            'header',
            { class: 'ih-options__heading' },
            h('h1', { text: t('optTitle') }),
            h('span', { attr: { id: 'saved', role: 'status' } }),
          ),
          card(
            'optSniff',
            toggle('scanCss', 'optScanCss', settings.scanCss),
            toggle('scanNetwork', 'optScanNetwork', settings.scanNetwork),
            toggle('scanPageHook', 'optScanPageHook', settings.scanPageHook),
            toggle('includeDataUrls', 'optDataUrls', settings.includeDataUrls),
            toggle('autoScroll', 'optAutoScroll', settings.autoScroll),
          ),
          card(
            'optSize',
            h('p', { class: 'ih-options__hint', text: t('optSizeHint') }),
            numberField('minWidth', 'optMinWidth', settings.minWidth, 20000),
            numberField('minHeight', 'optMinHeight', settings.minHeight, 20000),
            numberField('minBytes', 'optMinBytes', settings.minBytes / 1024, 102400),
          ),
          card(
            'optDownload',
            isIOS()
              ? h('p', { class: 'ih-options__hint', text: t('optMobileDownload') })
              : segmented(
                  'downloadMode',
                  'optDownloadMode',
                  ['zip', 'files'],
                  ['optModeZip', 'optModeFiles'],
                  settings.downloadMode,
                ),
            field(
              'optNaming',
              h('input', {
                class: 'ih-input',
                attr: {
                  name: 'namingTemplate',
                  value: settings.namingTemplate,
                  'aria-label': t('optNaming'),
                },
              }),
            ),
            h('p', { class: 'ih-options__hint', text: t('optNamingHint') }),
            h(
              'p',
              { class: 'ih-options__preview' },
              t('optNamingPreview') + ': ',
              h('output', { attr: { id: 'preview' }, text: namingPreview(settings.namingTemplate) }),
            ),
          ),
          card(
            'optAppearance',
            segmented(
              'theme',
              'optTheme',
              ['auto', 'light', 'dark'],
              ['optThemeAuto', 'optThemeLight', 'optThemeDark'],
              settings.theme,
            ),
            toggle('transparentPopup', 'optTransparentPopup', settings.transparentPopup),
            languageField(settings.language),
          ),
          card('optShortcuts', ...shortcutControls(settings.extractionShortcut)),
          card(
            'optAbout',
            h('p', { text: t('extBrand') + ' ' + version }),
            h('p', { text: t('optAboutText') }),
            h(
              'p',
              {},
              h('a', {
                class: 'ih-button ih-button--ghost',
                attr: {
                  href:
                    document.documentElement.lang === 'zh-CN'
                      ? 'https://github.com/wxmvv/ImageHelper/wiki/%E9%9A%90%E7%A7%81%E6%94%BF%E7%AD%96'
                      : 'https://github.com/wxmvv/ImageHelper/wiki/Privacy-Policy',
                  target: '_blank',
                  rel: 'noopener noreferrer',
                },
                text: t('optPrivacyPolicy'),
              }),
            ),
            h('button', {
              class: 'ih-button ih-button--danger',
              data: { action: 'reset' },
              text: t('optReset'),
            }),
          ),
        ),
      ),
    );
    offNavigation = observeNavigation(root);
  };
  const save = debounce(() => {
    const pending = patch;
    patch = {};
    void writeSettings(pending).then((value) => {
      settings = { ...value, ...patch };
      broadcast('settings:changed', value);
      const saved = document.getElementById('saved');
      if (saved) saved.textContent = t('optSaved');
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => {
        if (saved) saved.textContent = '';
      }, 1600);
    });
  }, 400);
  const update = (value: Partial<Settings>, rerender = false): void => {
    settings = { ...settings, ...value };
    patch = { ...patch, ...value };
    applyPageSettings(settings);
    if (rerender) render();
    save();
  };
  const input = (event: Event): void => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
    if (!el.name) return;
    const key = el.name as keyof Settings;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') update({ [key]: el.checked });
    else if (el instanceof HTMLInputElement && el.type === 'number') {
      const value = Number(el.value);
      const scale = key === 'minBytes' ? 1024 : 1;
      if (!el.value || !Number.isSafeInteger(value) || value < 0 || value > Number(el.max)) {
        el.value = String(Number(settings[key]) / scale);
        return;
      }
      update({ [key]: value * scale });
    } else if (key === 'namingTemplate') {
      if (!el.value.trim()) {
        el.value = settings.namingTemplate;
        return;
      }
      update({ namingTemplate: el.value });
      document.getElementById('preview')!.textContent = namingPreview(el.value);
    } else if (key === 'language') update({ language: el.value as Settings['language'] }, true);
  };
  const off = [
    on(root, 'keydown', (event) =>
      recordShortcut(event as KeyboardEvent, (extractionShortcut) => update({ extractionShortcut })),
    ),
    on(root, 'input', input),
    on(root, 'change', input),
    delegate(root, '[data-setting], [data-action]', 'click', (_event, el) => {
      if (el.dataset.setting) update({ [el.dataset.setting]: el.dataset.value }, true);
      if (el.dataset.action === 'clear-shortcut') update({ extractionShortcut: '' }, true);
      if (el.dataset.action === 'reset' && confirm(t('optResetConfirm'))) {
        update(DEFAULT_SETTINGS, true);
      }
    }),
    watchSettings((value) => {
      const changed = value.language !== settings.language;
      settings = { ...value, ...patch };
      applyPageSettings(settings);
      if (changed) render();
    }),
  ];
  render();
  window.addEventListener(
    'pagehide',
    () => {
      off.forEach((fn) => fn());
      offNavigation();
      save.cancel();
      clearTimeout(savedTimer);
    },
    { once: true },
  );
}
void bootstrap().catch(() => toast(t('optError')));
