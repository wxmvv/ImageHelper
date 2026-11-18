let cancel: (() => void) | undefined;

export function stopAutoScroll(): void {
  cancel?.();
}

export function startAutoScroll(
  options: { stepRatio?: number; intervalMs?: number; settleTicks?: number; timeoutMs?: number } = {},
): Promise<void> {
  stopAutoScroll();
  return new Promise((resolve) => {
    const started = Date.now();
    let stable = 0;
    let height = document.documentElement.scrollHeight;
    let position = scrollY;
    const finish = (): void => {
      clearInterval(timer);
      cancel = undefined;
      console.info('ImageHelper auto-scroll stopped', { scrollY });
      resolve();
    };
    const timer = setInterval(() => {
      scrollBy(0, innerHeight * (options.stepRatio ?? 0.9));
      const nextHeight = document.documentElement.scrollHeight;
      stable = height === nextHeight && position === scrollY ? stable + 1 : 0;
      height = nextHeight;
      position = scrollY;
      if (stable >= (options.settleTicks ?? 3) || Date.now() - started >= (options.timeoutMs ?? 30000))
        finish();
    }, options.intervalMs ?? 250);
    cancel = finish;
  });
}
