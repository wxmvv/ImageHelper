import type { ImageSource, Settings } from '../core/types.ts';

export type ScanSettings = Pick<Settings, 'includeDataUrls'>;
export interface RawImage {
  url: string;
  source: ImageSource;
  width?: number;
  height?: number;
  renderedWidth?: number;
  renderedHeight?: number;
  bytes?: number;
  mime?: string;
  alt?: string;
  hidden?: boolean;
  inViewport?: boolean;
}
