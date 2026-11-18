import { normalizeFilter } from '../core/filter.ts';
import { normalizeSettings } from '../core/settings.ts';
import type { Settings } from '../core/types.ts';

function local(): chrome.storage.StorageArea | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.storage?.local;
}

async function sessionOperation<T>(
  operation: (area: chrome.storage.StorageArea) => Promise<T>,
  fallback: T,
): Promise<T> {
  const areas = typeof chrome === 'undefined' ? [] : [chrome.storage?.session, local()];
  for (const area of areas) {
    if (!area) continue;
    try {
      const result = await operation(area);
      if (result !== null) return result;
    } catch (error) {
      console.warn('Session storage unavailable', error);
    }
  }
  return fallback;
}

export async function readSettings(): Promise<Settings> {
  try {
    return normalizeSettings((await local()?.get('settings'))?.settings);
  } catch (error) {
    console.warn('Settings storage unavailable', error);
    return normalizeSettings(null);
  }
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const settings = normalizeSettings({ ...(await readSettings()), ...patch });
  try {
    await local()?.set({ settings });
  } catch (error) {
    console.warn('Settings could not be saved', error);
  }
  return settings;
}

export async function readSession<T>(key: string): Promise<T | null> {
  return sessionOperation(async (area) => {
    const result = await area.get(key);
    return (result[key] as T | undefined) ?? null;
  }, null);
}

export async function writeSession<T>(key: string, value: T): Promise<void> {
  await sessionOperation((area) => area.set({ [key]: value }), undefined);
}

export async function removeSession(key: string): Promise<void> {
  // Remove both copies so a previously failed session store cannot resurrect stale data.
  const areas = typeof chrome === 'undefined' ? [] : [chrome.storage?.session, local()];
  for (const area of areas) {
    try {
      await area?.remove(key);
    } catch (error) {
      console.warn('Session could not be removed', error);
    }
  }
}

export async function readExtractorFilter(
  defaults: import('../core/types.ts').FilterState,
): Promise<import('../core/types.ts').FilterState> {
  try {
    return normalizeFilter((await local()?.get('extractorFilter'))?.extractorFilter, defaults);
  } catch {
    return defaults;
  }
}
export async function writeExtractorFilter(filter: import('../core/types.ts').FilterState): Promise<void> {
  try {
    await local()?.set({ extractorFilter: filter });
  } catch (error) {
    console.warn('Filter could not be saved', error);
  }
}
