import en from '../_locales/en/messages.json';
import zh from '../_locales/zh_CN/messages.json';
export type Locale = 'en' | 'zh_CN';
let locale: Locale = 'en';
export function setLocale(setting: 'auto' | Locale): void {
  locale = setting === 'auto' ? (navigator.language.startsWith('zh') ? 'zh_CN' : 'en') : setting;
  document.documentElement.lang = locale === 'zh_CN' ? 'zh-CN' : 'en';
}
export function t(key: string, subs: Record<string, string | number> = {}): string {
  const dict: Record<string, { message: string }> = locale === 'en' ? en : zh;
  return (dict[key]?.message ?? key).replace(/\{(\w+)\}/g, (match, name: string) =>
    String(subs[name] ?? match),
  );
}
export function applyI18n(root: ParentNode): void {
  for (const [data, attr] of [
    ['i18n', null],
    ['i18n-title', 'title'],
    ['i18n-placeholder', 'placeholder'],
  ] as const) {
    for (const el of root.querySelectorAll(`[data-${data}]`)) {
      const value = t(el.getAttribute(`data-${data}`) ?? '');
      if (attr) el.setAttribute(attr, value);
      else el.textContent = value;
    }
  }
}
