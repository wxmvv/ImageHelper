import type { Settings } from './types.ts';
import { isShortcut } from './shortcut.ts';

export const DEFAULT_SETTINGS: Settings = {
  extractionShortcut: 'Alt+Shift+Y',
  scanCss: true,
  scanNetwork: true,
  scanPageHook: true,
  includeDataUrls: false,
  autoScroll: false,
  minWidth: 0,
  minHeight: 0,
  minBytes: 0,
  clickAction: 'select',
  downloadMode: 'zip',
  namingTemplate: '{name}.{ext}',
  theme: 'auto',
  transparentPopup: false,
  language: 'auto',
  maxImagesPerPage: 5000,
};

export function normalizeSettings(raw: unknown): Settings {
  const result = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const values = raw as Record<string, unknown>;
  for (const key of [
    'scanCss',
    'scanNetwork',
    'scanPageHook',
    'includeDataUrls',
    'autoScroll',
    'transparentPopup',
  ] as const) {
    if (typeof values[key] === 'boolean') result[key] = values[key];
  }
  for (const key of ['minWidth', 'minHeight', 'minBytes', 'maxImagesPerPage'] as const) {
    const value = values[key];
    if (
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= (key === 'maxImagesPerPage' ? 1 : 0)
    )
      result[key] = value;
  }
  if (values.clickAction === 'select' || values.clickAction === 'preview')
    result.clickAction = values.clickAction;
  if (values.downloadMode === 'zip' || values.downloadMode === 'files')
    result.downloadMode = values.downloadMode;
  if (values.theme === 'auto' || values.theme === 'light' || values.theme === 'dark')
    result.theme = values.theme;
  if (values.language === 'auto' || values.language === 'en' || values.language === 'zh_CN')
    result.language = values.language;
  if (typeof values.namingTemplate === 'string' && values.namingTemplate.trim())
    result.namingTemplate = values.namingTemplate;
  if (values.extractionShortcut === '' || isShortcut(values.extractionShortcut))
    result.extractionShortcut = values.extractionShortcut;
  return result;
}
