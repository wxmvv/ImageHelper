import { shortcutFromKey } from '../../core/shortcut.ts';
import { t } from '../../platform/i18n.ts';
import { h } from '../../ui/dom.ts';
import { field } from './fields.ts';

export function shortcutControls(shortcut: string): HTMLElement[] {
  return [
    field(
      'cmdExtract',
      h(
        'span',
        { class: 'ih-options__shortcut' },
        h('input', {
          class: 'ih-input',
          attr: {
            id: 'extraction-shortcut',
            type: 'text',
            readonly: true,
            value: shortcut,
            placeholder: t('optShortcutRecord'),
            'aria-label': t('cmdExtract'),
            'aria-describedby': 'shortcut-hint shortcut-status',
          },
        }),
        h('button', {
          class: 'ih-button ih-button--ghost',
          attr: { type: 'button' },
          data: { action: 'clear-shortcut' },
          text: t('optShortcutClear'),
        }),
      ),
    ),
    h('p', { class: 'ih-options__hint', attr: { id: 'shortcut-hint' }, text: t('optShortcutHint') }),
    h('p', {
      class: 'ih-options__hint',
      attr: { id: 'shortcut-status', role: 'status', 'aria-live': 'polite' },
    }),
  ];
}

export function recordShortcut(event: KeyboardEvent, save: (shortcut: string) => void): void {
  if (
    !(event.target instanceof HTMLInputElement) ||
    event.target.id !== 'extraction-shortcut' ||
    event.key === 'Tab'
  )
    return;
  event.preventDefault();
  if (event.isComposing || event.repeat) return;
  const shortcut = shortcutFromKey(event);
  const status = document.getElementById('shortcut-status');
  if (!shortcut) {
    if (status) status.textContent = t('optShortcutInvalid');
    return;
  }
  event.target.value = shortcut;
  save(shortcut);
  if (status) status.textContent = t('optShortcutRecorded');
}
