import { describe, expect, it } from 'vitest';

import { createMemoryStorage, ensureWebStorage } from './ensure-web-storage.js';

function blockedWindow(names: string[] = ['localStorage', 'sessionStorage']) {
  const win = {} as Record<string, unknown>;
  for (const name of names) {
    Object.defineProperty(win, name, {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  }
  return win;
}

describe('ensureWebStorage', () => {
  it('replaces a storage accessor that throws SecurityError with a working in-memory one', () => {
    const win = blockedWindow();
    expect(() => win.localStorage).toThrow('The operation is insecure.');

    ensureWebStorage(win);

    // The exact expression Privy evaluates at module load.
    expect(() => win.localStorage).not.toThrow();
    const ls = win.localStorage as Storage;
    expect(ls.getItem('a')).toBeNull();
    ls.setItem('a', '1');
    expect(ls.getItem('a')).toBe('1');
    expect(Object.keys(ls)).toBeDefined();
    expect(() => win.sessionStorage).not.toThrow();
  });

  it('leaves working storage untouched', () => {
    const real = createMemoryStorage();
    const win = { localStorage: real, sessionStorage: real };
    ensureWebStorage(win);
    expect(win.localStorage).toBe(real);
  });

  it('does not throw when the property cannot be redefined', () => {
    const win = {} as Record<string, unknown>;
    Object.defineProperty(win, 'localStorage', {
      configurable: false,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    expect(() => ensureWebStorage(win)).not.toThrow();
  });
});

describe('createMemoryStorage', () => {
  it('implements the Storage surface', () => {
    const s = createMemoryStorage();
    s.setItem('k', 'v');
    expect(s.length).toBe(1);
    expect(s.key(0)).toBe('k');
    s.removeItem('k');
    expect(s.getItem('k')).toBeNull();
    s.setItem('x', 'y');
    s.clear();
    expect(s.length).toBe(0);
  });
});
