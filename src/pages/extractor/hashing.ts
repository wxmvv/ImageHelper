import { differenceHash } from '../../core/dhash.ts';
import { h } from '../../ui/dom.ts';
import { store } from './state.ts';
export function bindHashing(): () => void {
  let generation = 0;
  let active = false;
  const attempted = new Set<string>();
  const workers: Worker[] = [];
  const stop = (): void => {
    generation++;
    active = false;
    workers.splice(0).forEach((w) => w.terminate());
  };
  const unsubscribe = store.subscribe((state) => {
    if (!state.images.length) {
      attempted.clear();
      if (active) {
        stop();
        store.patch({ hashing: null });
      }
      return;
    }
    if (state.filter.dedupe !== 'similar') {
      if (active) {
        stop();
        store.patch({ hashing: null });
      }
      return;
    }
    if (active) return;
    const pending = store.derived().visible.filter((i) => !state.hash.has(i.id) && !attempted.has(i.id));
    if (!pending.length) return;
    active = true;
    const token = ++generation;
    let cursor = 0;
    let done = 0;
    store.patch({ hashing: { done, total: pending.length } });
    const run = async (): Promise<void> => {
      let worker: Worker | undefined;
      if (typeof OffscreenCanvas !== 'undefined') {
        try {
          worker = new Worker('./hash-worker.js');
          workers.push(worker);
        } catch {
          /* A blocked Worker falls back to the ordinary canvas path. */
        }
      }
      try {
        while (cursor < pending.length && token === generation) {
          const image = pending[cursor++];
          if (!image) break;
          attempted.add(image.id);
          let hash: string | null = null;
          if (worker) {
            hash = await new Promise<string | null>((resolve) => {
              const timer = setTimeout(() => resolve(null), 32000);
              worker.onmessage = (e: MessageEvent<{ hash: string | null }>) => {
                clearTimeout(timer);
                resolve(e.data.hash);
              };
              worker.onerror = () => {
                clearTimeout(timer);
                resolve(null);
              };
              worker.postMessage(image);
            });
          } else {
            try {
              const response = await fetch(image.url, {
                credentials: 'include',
                signal: AbortSignal.timeout(30000),
              });
              if (!response.ok) throw new Error(String(response.status));
              const bitmap = await createImageBitmap(await response.blob());
              try {
                const canvas = h('canvas', { attr: { width: 9, height: 8 } });
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(bitmap, 0, 0, 9, 8);
                  hash = differenceHash(ctx.getImageData(0, 0, 9, 8).data);
                }
              } finally {
                bitmap.close();
              }
            } catch {
              /* Preserve unhashable images. */
            }
          }
          if (token !== generation) return;
          const hashes = new Map(store.get().hash);
          if (hash) hashes.set(image.id, hash);
          store.patch({ hash: hashes, hashing: { done: ++done, total: pending.length } });
        }
      } finally {
        worker?.terminate();
      }
    };
    void Promise.all([run(), run()])
      .catch(() => {
        /* Leave failed hash candidates visible. */
      })
      .finally(() => {
        if (token === generation) {
          active = false;
          workers.length = 0;
          store.patch({ hashing: null });
        }
      });
  });
  return () => {
    unsubscribe();
    stop();
  };
}
