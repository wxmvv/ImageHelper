export function createThumbnails(progress: (done: number, total: number) => void) {
  const pending = new Set<HTMLImageElement>();
  const visible = new Set<HTMLImageElement>();
  const completed = new WeakSet<HTMLImageElement>();
  const tracked = new Set<HTMLImageElement>();
  let done = 0;
  const report = (): void => progress(done, tracked.size);
  let active = 0;
  let disposed = false;
  const pump = (): void => {
    if (disposed) return;
    for (const img of pending) {
      if (active >= 8) break;
      if (!visible.has(img)) continue;
      pending.delete(img);
      observer.unobserve(img);
      active++;
      const finish = (): void => {
        img.onload = img.onerror = null;
        active--;
        if (tracked.has(img) && !completed.has(img)) done++;
        completed.add(img);
        report();
        pump();
      };
      img.onload = finish;
      img.onerror = () => {
        img.closest('.ih-card')?.classList.add('is-broken');
        finish();
      };
      img.src = img.dataset.src ?? '';
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const img = entry.target as HTMLImageElement;
        if (entry.isIntersecting) visible.add(img);
        else visible.delete(img);
      }
      pump();
    },
    { rootMargin: '600px' },
  );
  return {
    observe(img: HTMLImageElement): void {
      if (!tracked.has(img)) {
        tracked.add(img);
        if (img.hasAttribute('src') && img.complete) {
          completed.add(img);
          done++;
        }
      }
      report();
      if (!img.hasAttribute('src')) {
        pending.add(img);
        observer.observe(img);
      }
    },
    reset(): void {
      observer.disconnect();
      tracked.clear();
      done = 0;
      report();
      pending.clear();
      visible.clear();
    },
    dispose(): void {
      disposed = true;
      observer.disconnect();
      tracked.clear();
      done = 0;
      report();
      pending.clear();
      visible.clear();
    },
  };
}
