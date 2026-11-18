import { t } from '../../platform/i18n.ts';
import { h } from '../../ui/dom.ts';
import { icon, type IconName } from '../../ui/icons.ts';
import { toast } from '../../ui/toast.ts';
export function button(key: string, action: string, name?: IconName, primary = false): HTMLButtonElement {
  return h(
    'button',
    {
      class: 'ih-button' + (primary ? ' ih-button--primary' : ''),
      attr: { type: 'button', title: t(key) },
      data: { action },
    },
    name ? icon(name) : null,
    t(key),
  );
}
export function iconButton(key: string, action: string, name: IconName): HTMLButtonElement {
  const el = button(key, action, name);
  el.classList.add('ih-button--icon');
  el.replaceChildren(icon(name));
  el.setAttribute('aria-label', t(key));
  return el;
}
export async function copyLinks(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast(t('extCopied'));
  } catch {
    toast(t('extCopyFailed'));
  }
}
export function openImage(url: string): void {
  if (/^(https?:|data:image\/)/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
}
