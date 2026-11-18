import type { DownloadItem, ImageRecord, PageInfo, PageSession } from './types.ts';

export const MESSAGE_TYPES = {
  MULTI_START: 'multi:start',
  MULTI_STATUS: 'multi:status',
  MULTI_CANCEL: 'multi:cancel',
  MULTI_IMAGES: 'multi:images',
  MULTI_PROGRESS: 'multi:progress',
  SETTINGS_CHANGED: 'settings:changed',
  SNIFFER_HELLO: 'sniffer:hello',
  SNIFFER_BATCH: 'sniffer:batch',
  EXTRACT_START: 'extract:start',
  EXTRACT_RESCAN: 'extract:rescan',
  PAGE_AUTOSCROLL: 'page:autoscroll',
  SESSION_GET: 'session:get',
  SESSION_CLEAR: 'session:clear',
  EXTRACTOR_OPEN: 'extractor:open',
  DOWNLOAD_FILES: 'download:files',
  TABS_CURRENT: 'tabs:current',
  SESSION_IMAGES: 'session:images',
  SESSION_STATUS: 'session:status',
  SESSION_RESET: 'session:reset',
} as const;

export interface Envelope<T> {
  __ih: 1;
  id: string;
  type: string;
  payload: T;
}
export type Reply<D> =
  { __ih: 1; id: string; ok: true; data: D } | { __ih: 1; id: string; ok: false; error: string };
export interface RequestPayloads {
  'multi:start': { urls: string[] };
  'multi:status': { runId: string };
  'multi:cancel': { runId: string };
  'multi:images': { runId: string };
  'sniffer:hello': { frameUrl: string; frameDepth: number };
  'sniffer:batch': { frameUrl: string; images: ImageRecord[] };
  'extract:start': { tabId: number };
  'extract:rescan': { tabId: number };
  'page:autoscroll': { tabId: number };
  'session:get': { tabId: number };
  'session:clear': { tabId: number };
  'extractor:open': { tabId: number };
  'download:files': { tabId: number; items: DownloadItem[]; naming: string };
  'tabs:current': Record<string, never>;
}
export interface ResponsePayloads {
  'multi:start': { runId: string };
  'multi:status': MultiRun;
  'multi:cancel': { ok: true };
  'multi:images': { images: ImageRecord[] };
  'extract:start': { frames: number; ok: boolean; extractorTabId?: number };
  'extract:rescan': { frames: number };
  'page:autoscroll': { frames: number };
  'session:get': { session: PageSession };
  'session:clear': { ok: true };
  'extractor:open': { tabId: number };
  'download:files': {
    started: number;
    failed: Array<{ url: string; reason: string }>;
    unsupported?: boolean;
  };
  'tabs:current': { tabId: number; title: string; url: string };
}
export interface BroadcastPayloads {
  'settings:changed': import('./types.ts').Settings;
  'multi:progress': {
    runId: string;
    item: MultiRunItem;
    totals: { done: number; total: number; images: number };
  };
  'session:images': { tabId: number; rev: number; page: PageInfo; images: ImageRecord[] };
  'session:status': { tabId: number; frames: Record<number, { url: string; done: boolean }> };
  'session:reset': { tabId: number };
}

export interface MultiRunItem {
  url: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  images: number;
  error?: string;
  tabId?: number;
}
export interface MultiRun {
  runId: string;
  items: MultiRunItem[];
  startedAt: number;
  finishedAt?: number;
}
