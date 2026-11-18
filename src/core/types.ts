export type ImageSource =
  | 'img'
  | 'srcset'
  | 'picture'
  | 'css-bg'
  | 'cssom'
  | 'inline-style'
  | 'lazy-attr'
  | 'svg-image'
  | 'video-poster'
  | 'input-image'
  | 'favicon'
  | 'meta'
  | 'link'
  | 'network'
  | 'page-hook';

export interface ImageRecord {
  id: string;
  url: string;
  ext: string;
  source: ImageSource;
  width?: number;
  height?: number;
  renderedWidth?: number;
  renderedHeight?: number;
  bytes?: number;
  mime?: string;
  alt?: string;
  frameUrl?: string;
  inViewport?: boolean;
  hidden?: boolean;
  discoveredAt: number;
}
export interface PageInfo {
  tabId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  frames: FrameInfo[];
}
export interface FrameInfo {
  frameId: number;
  url: string;
  done: boolean;
  imageCount: number;
}
export interface PageSession {
  tabId: number;
  page: PageInfo;
  rev: number;
  images: ImageRecord[];
  truncated: boolean;
  updatedAt: number;
}
export type SortKey = 'order' | 'size-desc' | 'size-asc' | 'width-desc' | 'height-desc';
export type DedupeMode = 'off' | 'url' | 'similar';
export interface FilterState {
  formats: string[];
  minWidth: number;
  minHeight: number;
  minBytes: number;
  include: string;
  exclude: string;
  useRegex: boolean;
  sort: SortKey;
  dedupe: DedupeMode;
  similarThreshold: number;
  hideHidden: boolean;
}
export interface Settings {
  extractionShortcut: string;
  scanCss: boolean;
  scanNetwork: boolean;
  scanPageHook: boolean;
  includeDataUrls: boolean;
  autoScroll: boolean;
  minWidth: number;
  minHeight: number;
  minBytes: number;
  clickAction: 'select' | 'preview';
  downloadMode: 'zip' | 'files';
  namingTemplate: string;
  theme: 'auto' | 'light' | 'dark';
  transparentPopup: boolean;
  language: 'auto' | 'en' | 'zh_CN';
  maxImagesPerPage: number;
}
export interface DownloadItem {
  url: string;
  fileName: string;
  referer?: string;
}
export interface DownloadResult {
  ok: string[];
  failed: Array<{ url: string; reason: string }>;
}
