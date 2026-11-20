import { on } from '../../ui/dom.ts';
import { clearSelection, invertSelection, removeSelected, selectAll } from './selection.ts';
import { store } from './state.ts';
export function bindShortcuts(
  preview: (id: string) => void,
  isOpen: () => boolean,
  focusSearch: () => void,
): () => void {
  return on(document, 'keydown', (e) => {
    const event = e as KeyboardEvent;
    if (
      event.defaultPrevented ||
      isOpen() ||
      (event.target instanceof Element &&
        event.target.closest('input,textarea,select,[contenteditable="true"]'))
    )
      return;
    const key = event.key.toLowerCase();
    if (!['a', 'i', 'v', 'escape', 'delete', 'backspace', '/'].includes(key)) return;
    if ((event.ctrlKey || event.metaKey || event.altKey) && key !== 'a') return;
    event.preventDefault();
    const { visible } = store.derived();
    if (key === 'a') selectAll(visible);
    if (key === 'i') invertSelection(visible);
    if (key === 'escape') clearSelection();
    if (key === 'delete' || key === 'backspace') removeSelected();
    if (key === '/') focusSearch();
    if (key === 'v') {
      const focused = document.activeElement?.closest<HTMLElement>('.ih-card')?.dataset.id;
      const id = visible.find((i) => store.get().selected.has(i.id))?.id ?? focused ?? visible[0]?.id;
      if (id) preview(id);
    }
  });
}
