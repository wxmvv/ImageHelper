import { delegate, on } from '../../ui/dom.ts';

export function observeNavigation(root: HTMLElement): () => void {
  const sections = [...root.querySelectorAll<HTMLElement>('.ih-options__card')];
  const links = [...root.querySelectorAll<HTMLAnchorElement>('.ih-options__sidebar a')];
  const visible = new Set<Element>();
  let requested: string | undefined;
  let requestedSeen = false;
  const activate = (id: string): void => {
    for (const link of links) {
      if (link.hash === '#' + id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };
  const updateCurrent = (): void => {
    if (requested) {
      const section = sections.find((item) => item.id === requested);
      if (section && visible.has(section)) requestedSeen = true;
      else if (requestedSeen) requested = undefined;
      if (requested) {
        activate(requested);
        return;
      }
    }
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1;
    const current = atBottom
      ? [...sections].reverse().find((section) => visible.has(section))
      : sections.find((section) => visible.has(section));
    if (current) activate(current.id);
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      updateCurrent();
    },
    // Match the trailing card margin and page padding so the final section updates at the scroll limit.
    { rootMargin: '-16px 0px -40px 0px', threshold: [0, 1] },
  );
  activate(sections.find((section) => section.getBoundingClientRect().bottom > 16)?.id ?? 'optSniff');
  sections.forEach((section) => observer.observe(section));
  const off = delegate(root, '.ih-options__sidebar a', 'click', (event, el) => {
    event.preventDefault();
    const section = sections.find((section) => '#' + section.id === el.getAttribute('href'));
    if (!section) return;
    // Near the end, multiple cards can share the final scroll position. Honor the chosen link.
    requested = section.id;
    requestedSeen = visible.has(section);
    activate(section.id);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const clearRequested = (): void => {
    requested = undefined;
    updateCurrent();
  };
  const offScrollIntent = [
    on(window, 'wheel', clearRequested, { passive: true }),
    on(window, 'touchstart', clearRequested, { passive: true }),
    on(window, 'keydown', (event) => {
      if (
        ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(
          (event as KeyboardEvent).key,
        )
      )
        clearRequested();
    }),
  ];
  return () => {
    observer.disconnect();
    off();
    offScrollIntent.forEach((remove) => remove());
  };
}
