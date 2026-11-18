import { h } from './dom.ts';
let element: HTMLElement | undefined;
let timer: ReturnType<typeof setTimeout>;
export function toast(message: string, ms = 1600): void {
  if (!element) {
    element = h('div', { class: 'ih-toast', attr: { role: 'status' } });
    document.body.append(element);
  }
  element.textContent = message;
  element.classList.add('is-visible');
  clearTimeout(timer);
  timer = setTimeout(() => element?.classList.remove('is-visible'), ms);
}
