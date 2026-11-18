export type Child = Node | string | number | null | undefined | false;
export interface Props {
  class?: string;
  text?: string;
  attr?: Record<string, string | number | boolean | null | undefined>;
  data?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  on?: Record<string, (e: Event) => void>;
}
export function frag(...children: Child[]): DocumentFragment {
  const result = document.createDocumentFragment();
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false)
      result.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return result;
}
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [key, value] of Object.entries(props.attr ?? {})) {
    if (value !== false && value != null) el.setAttribute(key, value === true ? '' : String(value));
  }
  Object.assign(el.dataset, props.data);
  for (const [key, value] of Object.entries(props.style ?? {}))
    el.style.setProperty(
      key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()),
      String(value),
    );
  for (const [type, handler] of Object.entries(props.on ?? {})) on(el, type, handler);
  el.append(frag(...children));
  return el;
}
export function on<T extends EventTarget>(
  target: T,
  type: string,
  handler: (e: Event) => void,
  options?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}
export function delegate(
  root: HTMLElement,
  selector: string,
  type: string,
  handler: (e: Event, el: HTMLElement) => void,
): () => void {
  return on(root, type, (e) => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>(selector) : null;
    if (el && root.contains(el)) handler(e, el);
  });
}
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout>;
  const wrapped = ((...args: never[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T & { cancel(): void };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}
export function rafThrottle<T extends (...args: never[]) => void>(fn: T): T {
  let queued = false;
  let latest: never[];
  return ((...args: never[]) => {
    latest = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...latest);
    });
  }) as T;
}
export function clearChildren(el: Element): void {
  el.replaceChildren();
}
