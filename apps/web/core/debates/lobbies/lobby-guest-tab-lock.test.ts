import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Grant = (lock: { name: string } | null) => Promise<unknown> | unknown;
type Holder = { reject: (error: unknown) => void; done: () => void };

/** One browser's lock manager: every module copy imported below is one tab. */
function fakeLockManager() {
  let holder: Holder | null = null;
  const manager = {
    request: vi.fn((name: string, options: LockOptions, grant: Grant) => {
      if (holder && options.ifAvailable) return Promise.resolve(grant(null));
      if (holder && options.steal) {
        holder.reject(new DOMException('stolen', 'AbortError'));
        holder = null;
      }
      return new Promise((resolve, reject) => {
        const self: Holder = { reject, done: () => undefined };
        self.done = () => {
          if (holder === self) holder = null;
        };
        holder = self;
        Promise.resolve(grant({ name })).then(value => {
          self.done();
          resolve(value);
        });
      });
    }),
    query: vi.fn(async () => ({ held: holder ? [{ name: 'geo.debates.lobby-guest-listening' }] : [], pending: [] })),
  };
  return { manager, isHeld: () => holder !== null };
}

let browser: ReturnType<typeof fakeLockManager>;

/** A fresh module copy, as another tab would load. */
async function openTab() {
  vi.resetModules();
  return import('./lobby-guest-tab-lock');
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  window.localStorage.clear();
  browser = fakeLockManager();
  vi.stubGlobal('navigator', { locks: browser.manager });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('guest tab lock', () => {
  it('takes a free lock once and keeps it', async () => {
    const tab = await openTab();
    await expect(tab.acquireGuestTabLock()).resolves.toBe(true);
    await expect(tab.acquireGuestTabLock()).resolves.toBe(true);
    expect(browser.manager.request).toHaveBeenCalledTimes(1);
  });

  it('does not take a lock another tab holds, and says that tab listens', async () => {
    const first = await openTab();
    await first.acquireGuestTabLock();
    const second = await openTab();
    await expect(second.acquireGuestTabLock()).resolves.toBe(false);
    await expect(second.isGuestListeningElsewhere()).resolves.toBe(true);
    await expect(first.isGuestListeningElsewhere()).resolves.toBe(false);
  });

  it('a press steals it, and the other tab hears that it lost it', async () => {
    const first = await openTab();
    const lost = vi.fn();
    first.onGuestTabLockLost(lost);
    await first.acquireGuestTabLock();
    const second = await openTab();
    await expect(second.acquireGuestTabLock({ steal: true })).resolves.toBe(true);
    await tick();
    expect(lost).toHaveBeenCalledTimes(1);
    await expect(first.isGuestListeningElsewhere()).resolves.toBe(true);
  });

  it('records the holder’s lobby on a grant and before a steal', async () => {
    const first = await openTab();
    await first.acquireGuestTabLock({ lobbyId: 'lobby1' });
    expect(first.lobbyListeningElsewhere()).toBe('lobby1');
    const second = await openTab();
    await second.acquireGuestTabLock({ steal: true, lobbyId: 'lobby2' });
    expect(first.lobbyListeningElsewhere()).toBe('lobby2');
  });

  it('keeps the lock through a release and a remount in the same tick', async () => {
    const tab = await openTab();
    await tab.acquireGuestTabLock();
    tab.releaseGuestTabLock();
    await tab.acquireGuestTabLock();
    await tick();
    expect(browser.isHeld()).toBe(true);
    expect(browser.manager.request).toHaveBeenCalledTimes(1);
  });

  it('frees it a tick after a release, or at once for pagehide', async () => {
    const tab = await openTab();
    await tab.acquireGuestTabLock();
    tab.releaseGuestTabLock();
    expect(browser.isHeld()).toBe(true);
    await tick();
    await tick();
    expect(browser.isHeld()).toBe(false);

    await tab.acquireGuestTabLock();
    tab.releaseGuestTabLock({ now: true });
    await tick();
    expect(browser.isHeld()).toBe(false);
  });

  it('a reload takes the lock back: a waiting tab never queues for it', async () => {
    const listening = await openTab();
    await listening.acquireGuestTabLock();
    const waiting = await openTab();
    await waiting.acquireGuestTabLock();
    listening.releaseGuestTabLock({ now: true });
    await tick();
    const reloaded = await openTab();
    await expect(reloaded.acquireGuestTabLock()).resolves.toBe(true);
  });

  it('without Web Locks every tab may listen, and nobody knows of another', async () => {
    vi.stubGlobal('navigator', {});
    const tab = await openTab();
    await expect(tab.acquireGuestTabLock()).resolves.toBe(true);
    await expect(tab.isGuestListeningElsewhere()).resolves.toBeNull();
  });
});
