type RuntimeListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

export function fakeExtension() {
  const localData: Record<string, unknown> = {};
  const sessionData: Record<string, unknown> = {};
  const messages: RuntimeListener[] = [];
  const removed: Array<(id: number) => void> = [];
  const updated: Array<(id: number, change: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => void> = [];
  const changed: Array<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void> = [];
  const calls = {
    injections: [] as unknown[],
    notifications: [] as unknown[],
    downloads: [] as unknown[],
    created: [] as unknown[],
    activated: [] as number[],
  };
  const area = (data: Record<string, unknown>) => ({
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, structuredClone(values));
    },
    async remove(key: string) {
      delete data[key];
    },
  });
  const api = {
    storage: {
      local: area(localData),
      session: area(sessionData),
      onChanged: {
        addListener(fn: (typeof changed)[number]) {
          changed.push(fn);
        },
      },
    },
    runtime: {
      getURL: (path: string) => 'chrome-extension://test/' + path,
      onMessage: {
        addListener(fn: RuntimeListener) {
          messages.push(fn);
        },
      },
      async sendMessage(message: unknown): Promise<unknown> {
        return new Promise((resolve) => {
          let pending = false;
          for (const listener of messages) {
            const result: unknown = listener(message, {}, resolve);
            pending = result === true || pending;
          }
          if (!pending) resolve(undefined);
        });
      },
    },
    scripting: {
      async executeScript(details: unknown) {
        calls.injections.push(details);
        return [];
      },
    },
    tabs: {
      async get(id: number) {
        return { id, url: 'https://example.test/', title: 'Example' };
      },
      async query() {
        return [{ id: 1, url: 'https://example.test/', title: 'Example' }];
      },
      async create(options: unknown) {
        calls.created.push(options);
        return { id: 100 + calls.created.length };
      },
      async update(id: number) {
        calls.activated.push(id);
        return { id };
      },
      async sendMessage(_id: number, message: unknown) {
        calls.notifications.push(message);
      },
      onRemoved: {
        addListener(fn: (typeof removed)[number]) {
          removed.push(fn);
        },
      },
      onUpdated: {
        addListener(fn: (typeof updated)[number]) {
          updated.push(fn);
        },
      },
    },
    downloads: {
      async download(options: unknown) {
        calls.downloads.push(options);
        return calls.downloads.length;
      },
    },
  };
  Object.defineProperty(globalThis, 'chrome', { value: api, configurable: true, writable: true });
  return { api, localData, sessionData, messages, removed, updated, changed, calls };
}
