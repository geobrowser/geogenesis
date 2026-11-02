/**
 * Make `window.localStorage` / `window.sessionStorage` safe to touch.
 *
 * Safari throws `SecurityError: The operation is insecure.` from the *accessor itself* when site
 * data is blocked (Lockdown Mode, "Block All Cookies", some embedded contexts). Privy's wallet
 * connector module runs `typeof window < "u" && window.localStorage ? new Local() : new Memory()`
 * at module evaluation, outside any try/catch, so on such a browser the throw escapes module
 * init and the app-root error boundary takes the whole page down (Sentry GEOGENESIS-D0).
 *
 * We cannot edit that code, but we can run first: when the accessor throws, replace it with an
 * in-memory `Storage` so the access returns something usable instead of throwing. Where storage
 * works this is a no-op. It must be imported before anything that imports `@privy-io/*`.
 */

export function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: key => (data.has(String(key)) ? (data.get(String(key)) as string) : null),
    key: index => Array.from(data.keys())[index] ?? null,
    removeItem: key => {
      data.delete(String(key));
    },
    setItem: (key, value) => {
      data.set(String(key), String(value));
    },
  };
}

export function ensureWebStorage(target: object | undefined = (globalThis as { window?: object }).window): void {
  if (!target) return;
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      void (target as Record<string, unknown>)[name];
    } catch {
      try {
        Object.defineProperty(target, name, { configurable: true, enumerable: true, value: createMemoryStorage() });
      } catch {
        // Not redefinable here; nothing more we can do, and we must not throw from a polyfill.
      }
    }
  }
}

ensureWebStorage();
