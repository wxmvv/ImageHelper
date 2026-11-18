import type { Settings } from '../../core/types.ts';
import { renderTemplate, sanitizeFileName } from '../../core/naming.ts';
import { t } from '../../platform/i18n.ts';
import { h } from '../../ui/dom.ts';

export function field(key: string, control: HTMLElement, description?: string): HTMLElement {
  return h(
    'label',
    { class: 'ih-field' },
    h(
      'span',
      { class: 'ih-field__label' },
      h('span', { class: 'ih-field__title', text: t(key) }),
      description ? h('span', { class: 'ih-field__desc', text: t(description) }) : null,
    ),
    control,
  );
}
export function toggle(key: keyof Settings, label: string, value: boolean): HTMLElement {
  const input = h('input', {
    attr: { type: 'checkbox', name: key, checked: value, role: 'switch', 'aria-label': t(label) },
  });
  return field(label, h('span', { class: 'ih-switch' }, input, h('span', { class: 'ih-switch__track' })));
}
export function numberField(key: string, label: string, value: number, max: number): HTMLElement {
  return field(
    label,
    h('input', {
      class: 'ih-input',
      attr: { type: 'number', name: key, value, min: 0, max, step: 1, 'aria-label': t(label) },
    }),
  );
}
export function segmented(
  key: string,
  label: string,
  values: string[],
  labels: string[],
  selected: string,
): HTMLElement {
  return field(
    label,
    h(
      'span',
      { class: 'ih-segmented', attr: { role: 'group', 'aria-label': t(label) } },
      ...values.map((value, index) =>
        h('button', {
          class: 'ih-button ih-button--ghost',
          data: { setting: key, value },
          attr: { type: 'button', 'aria-pressed': value === selected ? 'true' : 'false' },
          text: t(labels[index] ?? ''),
        }),
      ),
    ),
  );
}
export function namingPreview(template: string): string {
  return sanitizeFileName(
    renderTemplate(template, {
      index: 1,
      name: 'photo-640x480',
      ext: 'png',
      w: 640,
      h: 480,
      page: 'Example',
      host: 'example.com',
      hash: '0123456789abcdef',
    }),
  );
}
export function languageField(value: string): HTMLElement {
  const select = h(
    'select',
    { class: 'ih-select', attr: { name: 'language', 'aria-label': t('optLanguage') } },
    ...[
      ['auto', 'optLangAuto'],
      ['zh_CN', 'optLangChinese'],
      ['en', 'optLangEnglish'],
    ].map(([value, key]) => h('option', { attr: { value }, text: t(key ?? '') })),
  );
  select.value = value;
  return field('optLanguage', select);
}
