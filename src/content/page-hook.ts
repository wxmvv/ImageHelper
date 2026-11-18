const MAX_TEXT = 2 * 1024 * 1024;
const token = document.currentScript?.getAttribute('data-ih-token');
const seen = new Set<string>();

function report(urls: string[], base = document.baseURI): void {
  if (!token) return;
  const images: string[] = [];
  for (const raw of urls) {
    try {
      const url = new URL(raw, base).href;
      if (seen.size >= 2000 || seen.has(url)) continue;
      seen.add(url);
      images.push(url);
    } catch {
      /* Payloads may contain malformed URLs. */
    }
  }
  if (images.length) window.postMessage({ __ih_hook: token, images }, '*');
}

function scan(text: string, base: string): void {
  if (text.length >= MAX_TEXT) return;
  const normalized = text.replace(/\\\//g, '/').replace(/\\u002f/gi, '/');
  const pattern =
    /(?:^|["'\s(,])((?:(?:https?:\/\/|\.\/|\/)[^"'\s(),<>]*?\.(?:apng|bmp|gif|ico|cur|jpe?g|jfif|png|svg|tiff?|webp|avif)(?:[?#][^"'\s(),<>]*)?)|(?:data:image\/[a-z+]+;base64,[a-z\d+/=]+))(?=$|["'\s),])/gi;
  report(
    [...normalized.matchAll(pattern)].flatMap((match) => (match[1] ? [match[1]] : [])),
    base,
  );
}

function eligible(type: string | null, length: string | null): boolean {
  return (
    !!type && /text|json|javascript|ecmascript|html/i.test(type) && (!length || Number(length) < MAX_TEXT)
  );
}

function install(): void {
  const originalFetch = window.fetch;
  window.fetch = async function (...args: Parameters<typeof fetch>): Promise<Response> {
    const response = await originalFetch.apply(this, args);
    try {
      if (eligible(response.headers.get('content-type'), response.headers.get('content-length'))) {
        void response
          .clone()
          .text()
          .then((text) => scan(text, response.url || document.baseURI))
          .catch(() => undefined);
      }
    } catch {
      /* Observing a response must not change fetch semantics. */
    }
    return response;
  };
  const bases = new WeakMap<XMLHttpRequest, string>();
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ): void {
    bases.set(this, new URL(url, document.baseURI).href);
    open.call(this, method, url, async, username, password);
  };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args: Parameters<XMLHttpRequest['send']>): void {
    this.addEventListener(
      'load',
      () => {
        try {
          if (
            !['', 'text', 'json'].includes(this.responseType) ||
            !eligible(this.getResponseHeader('content-type'), this.getResponseHeader('content-length'))
          )
            return;
          const text = this.responseType === 'json' ? JSON.stringify(this.response) : this.responseText;
          scan(text, this.responseURL || bases.get(this) || document.baseURI);
        } catch {
          /* Restricted response bodies are intentionally ignored. */
        }
      },
      { once: true },
    );
    send.apply(this, args);
  };
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (descriptor?.set) {
    const setter = descriptor.set;
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...descriptor,
      set(this: HTMLImageElement, value: string) {
        setter.call(this, value);
        report([this.src]);
      },
    });
  }
  const setAttribute = HTMLImageElement.prototype.setAttribute;
  HTMLImageElement.prototype.setAttribute = function (name: string, value: string): void {
    setAttribute.call(this, name, value);
    if (name.toLowerCase() === 'src') report([this.src]);
  };
}

try {
  if (token) install();
} catch (error) {
  console.warn('ImageHelper page hook unavailable', error);
}
export {};
