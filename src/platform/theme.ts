import { readSettings } from './storage.ts';
export async function applyStoredTheme(): Promise<void> {
  const settings = await readSettings();
  document.documentElement.dataset.theme = settings.theme === 'auto' ? '' : settings.theme;
}
