export interface ShortcutKey {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export function shortcutFromKey(event: ShortcutKey): string | null {
  if (!event.ctrlKey && !event.altKey && !event.metaKey) return null;
  const key = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(event.code);
  if (!key) return null;
  return [
    event.ctrlKey ? 'Ctrl' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    event.metaKey ? 'Command' : '',
    key[1] || key[2],
  ]
    .filter(Boolean)
    .join('+');
}

export function isShortcut(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:Command\+)?[A-Z0-9]$/.test(value) &&
    /(?:Ctrl|Alt|Command)\+/.test(value)
  );
}
