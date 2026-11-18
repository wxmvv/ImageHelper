import type { Envelope, Reply } from '../core/messages.ts';

export type MessageHandler = (
  payload: unknown,
  sender: chrome.runtime.MessageSender,
) => Promise<unknown> | unknown;
const handlers = new Map<string, MessageHandler>();
let listening = false;
let nextId = 0;

export function isEnvelope(value: unknown): value is Envelope<unknown> {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return message.__ih === 1 && typeof message.id === 'string' && typeof message.type === 'string';
}

/**
 * Chrome resolves `sendMessage` promises, Safari only always honoured the callback form.
 * This wrapper accepts either shape so the same code runs on both engines.
 */
export function callRuntimeMessage(message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: unknown): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        settle(undefined);
        return;
      }
      const maybePromise = chrome.runtime.sendMessage(message, (response: unknown) => {
        // Reading lastError keeps Chrome from logging "Unchecked runtime.lastError".
        void chrome.runtime.lastError;
        settle(response);
      }) as unknown;
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
        (maybePromise as Promise<unknown>).then(settle, () => settle(undefined));
      }
    } catch {
      settle(undefined);
    }
  });
}

export function sendToBackground<TPayload, TResult>(
  type: string,
  payload: TPayload,
  timeoutMs = 8000,
): Promise<TResult> {
  const id = String(++nextId);
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      reject(new Error('Background unavailable: ' + type));
      return;
    }
    const timer = setTimeout(() => reject(new Error('timeout: ' + type)), timeoutMs);
    void callRuntimeMessage({ __ih: 1, id, type, payload }).then((response) => {
      clearTimeout(timer);
      if (!response || typeof response !== 'object') {
        reject(new Error('Background did not respond: ' + type));
        return;
      }
      const reply = response as Reply<TResult>;
      if (reply.__ih !== 1 || reply.id !== id || typeof reply.ok !== 'boolean') {
        reject(new Error('Invalid background response: ' + type));
        return;
      }
      if (reply.ok === false) {
        reject(new Error(reply.error || 'Background request failed: ' + type));
        return;
      }
      resolve(reply.data as TResult);
    });
  });
}

export function registerHandlers(additions: Record<string, MessageHandler>): void {
  for (const type of Object.keys(additions)) {
    if (handlers.has(type)) throw new Error('Duplicate handler: ' + type);
  }
  for (const [type, handler] of Object.entries(additions)) handlers.set(type, handler);
  if (listening || typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isEnvelope(message)) return false;
    const handler = handlers.get(message.type);
    if (!handler) return false;
    void Promise.resolve()
      .then(() => handler(message.payload, sender))
      .then(
        (data) => sendResponse({ __ih: 1, id: message.id, ok: true, data }),
        (error: unknown) =>
          sendResponse({
            __ih: 1,
            id: message.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    return true;
  });
  listening = true;
}

export function broadcast(type: string, payload: unknown): void {
  // Fire-and-forget: no page may be listening, so failures must stay silent.
  void callRuntimeMessage({ __ih: 1, type, payload });
}

export function onRuntimeMessage(listener: (type: string, payload: unknown) => void): () => void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return () => {};
  const handler = (message: unknown): false => {
    if (message && typeof message === 'object') {
      const raw = message as Record<string, unknown>;
      if (raw.__ih === 1 && typeof raw.type === 'string' && !raw.id) listener(raw.type, raw.payload);
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}
