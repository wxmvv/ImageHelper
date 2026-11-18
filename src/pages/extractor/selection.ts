import type { ImageRecord } from '../../core/types.ts';
import { store } from './state.ts';
export function selectAll(visible: ImageRecord[]): void {
  store.patch({ selected: new Set(visible.map((i) => i.id)) });
}
export function invertSelection(visible: ImageRecord[]): void {
  const selected = new Set(store.get().selected);
  for (const image of visible) {
    if (selected.has(image.id)) selected.delete(image.id);
    else selected.add(image.id);
  }
  store.patch({ selected });
}
export function clearSelection(): void {
  store.patch({ selected: new Set() });
}
export function toggle(id: string): void {
  const selected = new Set(store.get().selected);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  store.patch({ selected });
}
export function selectRange(fromId: string, toId: string, visible: ImageRecord[]): void {
  const from = visible.findIndex((i) => i.id === fromId);
  const to = visible.findIndex((i) => i.id === toId);
  if (from < 0 || to < 0) {
    toggle(toId);
    return;
  }
  const selected = new Set(store.get().selected);
  for (const image of visible.slice(Math.min(from, to), Math.max(from, to) + 1)) selected.add(image.id);
  store.patch({ selected });
}
export function removeSelected(): void {
  const { images, selected } = store.get();
  store.patch({ images: images.filter((image) => !selected.has(image.id)), selected: new Set() });
}
export function selectedRecords(images: ImageRecord[], selected: Set<string>): ImageRecord[] {
  return images.filter((i) => selected.has(i.id));
}
