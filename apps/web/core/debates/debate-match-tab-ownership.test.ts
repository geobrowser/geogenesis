import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDebateMatchTabOwnershipCoordinator,
  debateMatchTabOwnershipTtlMs,
  readDebateMatchTabOwnership,
} from './debate-match-tab-ownership';

type QueuedLock = {
  callback: (lock: Lock | null) => Promise<void> | void;
  resolve: () => void;
  reject: (error: unknown) => void;
};

class FakeLockManager {
  private held = new Set<string>();

  request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void> | void): Promise<void> {
    if (options.ifAvailable && this.held.has(name)) return Promise.resolve(callback(null));

    return new Promise<void>((resolve, reject) => {
      const queued: QueuedLock = { callback, resolve, reject };
      void this.run(name, queued);
    });
  }

  private async run(name: string, queued: QueuedLock) {
    this.held.add(name);
    try {
      await queued.callback({ name, mode: 'exclusive' });
      queued.resolve();
    } catch (error) {
      queued.reject(error);
    } finally {
      this.held.delete(name);
    }
  }
}

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();

  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(private readonly name: string) {
    const channels = FakeBroadcastChannel.channels.get(name) ?? new Set();
    channels.add(this);
    FakeBroadcastChannel.channels.set(name, channels);
  }

  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this) queueMicrotask(() => channel.onmessage?.(new MessageEvent('message', { data })));
    }
  }

  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  FakeBroadcastChannel.channels.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: new FakeLockManager() });
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  let instanceNumber = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `instance-${++instanceNumber}`) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});

describe('debate match tab ownership', () => {
  it('allows only one tab to begin an action for the same match', async () => {
    const first = coordinator({ storage: new MemoryStorage() });
    const second = coordinator({ storage: new MemoryStorage() });

    await expect(first.acquire()).resolves.toBe(true);
    await expect(second.acquire()).resolves.toBe(false);

    first.close();
    second.close();
  });

  it('persists pending ownership before confirmation and broadcasts only after success', async () => {
    const firstStorage = new MemoryStorage();
    const secondStorage = new MemoryStorage();
    const acceptedElsewhere = vi.fn();
    const first = coordinator({ storage: firstStorage });
    const second = coordinator({ storage: secondStorage, onAcceptedElsewhere: acceptedElsewhere });

    await first.acquire();
    expect(first.beginAcceptance()).toMatchObject({ state: 'pending', instanceId: first.instanceId });
    expect(readDebateMatchTabOwnership('user-a', { storage: firstStorage, now: () => 1_000 })).toMatchObject({
      state: 'pending',
    });
    expect(readDebateMatchTabOwnership('user-a', { storage: secondStorage, now: () => 1_000 })).toBeNull();
    expect(acceptedElsewhere).not.toHaveBeenCalled();

    expect(first.confirmAcceptance()).toMatchObject({ state: 'confirmed', acceptedAt: 1_000 });
    expect(first.confirmAcceptance()).toMatchObject({ state: 'confirmed', acceptedAt: 1_000 });
    await vi.waitFor(() => expect(acceptedElsewhere).toHaveBeenCalledWith('match-1'));
    expect(acceptedElsewhere).toHaveBeenCalledTimes(1);
    expect(readDebateMatchTabOwnership('user-a', { storage: firstStorage, now: () => 1_000 })).toMatchObject({
      state: 'confirmed',
    });

    first.close();
    second.close();
  });

  it('clears a failed pending attempt when its owner releases it', async () => {
    const storage = new MemoryStorage();
    const owner = coordinator({ storage });
    const retryingTab = coordinator({ storage: new MemoryStorage() });

    await owner.acquire();
    owner.beginAcceptance();
    await owner.release({ clearRecord: true });

    expect(readDebateMatchTabOwnership('user-a', { storage, now: () => 1_000 })).toBeNull();
    await expect(retryingTab.acquire()).resolves.toBe(true);

    owner.close();
    retryingTab.close();
  });

  it('recovers ownership only for an actual reload and rejects a duplicated-tab marker', async () => {
    const originalStorage = new MemoryStorage();
    const original = coordinator({ storage: originalStorage });
    await original.acquire();
    original.beginAcceptance();
    original.confirmAcceptance();
    const clonedRecord = originalStorage.getItem('geo:debate-match-owner:user-a')!;
    await original.release();
    original.close();

    const reloadStorage = new MemoryStorage();
    reloadStorage.setItem('geo:debate-match-owner:user-a', clonedRecord);
    const reload = coordinator({ storage: reloadStorage, isReloadNavigation: () => true });
    await expect(reload.recover()).resolves.toBe(true);
    expect(reload.ownsFlow()).toBe(true);
    expect(readDebateMatchTabOwnership('user-a', { storage: reloadStorage, now: () => 1_000 })).toMatchObject({
      instanceId: reload.instanceId,
      state: 'confirmed',
    });
    await reload.release();
    reload.close();

    const duplicateStorage = new MemoryStorage();
    duplicateStorage.setItem('geo:debate-match-owner:user-a', clonedRecord);
    const duplicate = coordinator({ storage: duplicateStorage, isReloadNavigation: () => false });
    await expect(duplicate.recover()).resolves.toBe(false);
    expect(readDebateMatchTabOwnership('user-a', { storage: duplicateStorage, now: () => 1_000 })).toBeNull();
    duplicate.close();
  });

  it('does not promote a duplicate after the owner closes', async () => {
    const ownerStorage = new MemoryStorage();
    const owner = coordinator({ storage: ownerStorage });
    await owner.acquire();
    owner.beginAcceptance();
    owner.confirmAcceptance();

    const duplicateStorage = new MemoryStorage();
    duplicateStorage.setItem('geo:debate-match-owner:user-a', ownerStorage.getItem('geo:debate-match-owner:user-a')!);
    const duplicate = coordinator({ storage: duplicateStorage, isReloadNavigation: () => false });
    await owner.release();
    owner.close();

    await expect(duplicate.recover()).resolves.toBe(false);
    expect(duplicate.ownsFlow()).toBe(false);
    duplicate.close();
  });

  it('removes malformed and expired records before they can recover', () => {
    const storage = new MemoryStorage();
    storage.setItem('geo:debate-match-owner:user-a', '{not json');
    expect(readDebateMatchTabOwnership('user-a', { storage })).toBeNull();

    storage.setItem(
      'geo:debate-match-owner:user-a',
      JSON.stringify({
        version: 1,
        state: 'confirmed',
        userId: 'user-a',
        matchId: 'match-1',
        claimId: 'claim-1',
        spaceId: 'space-1',
        instanceId: 'old',
        createdAt: 1_000,
        acceptedAt: 1_000,
      })
    );
    expect(
      readDebateMatchTabOwnership('user-a', {
        storage,
        now: () => 1_000 + debateMatchTabOwnershipTtlMs,
      })
    ).toMatchObject({ state: 'confirmed' });
    expect(
      readDebateMatchTabOwnership('user-a', {
        storage,
        now: () => 1_000 + debateMatchTabOwnershipTtlMs + 1,
      })
    ).toBeNull();
  });

  it('degrades without Web Locks or BroadcastChannel without crashing', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    vi.stubGlobal('BroadcastChannel', undefined);
    const owner = coordinator({ storage: new MemoryStorage() });

    await expect(owner.acquire()).resolves.toBe(true);
    expect(() => owner.beginAcceptance()).not.toThrow();
    expect(() => owner.confirmAcceptance()).not.toThrow();
    owner.close();
  });

  it('uses a confirmation broadcast to stop a late fallback success when Web Locks are unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const first = coordinator({ storage: new MemoryStorage() });
    const second = coordinator({ storage: new MemoryStorage() });
    await first.acquire();
    await second.acquire();
    first.beginAcceptance();
    second.beginAcceptance();

    first.confirmAcceptance();

    await vi.waitFor(() => expect(second.ownsFlow()).toBe(false));
    expect(second.confirmAcceptance()).toBeNull();
    first.close();
    second.close();
  });

  it('keeps one deterministic fallback owner when two tabs confirm before broadcasts arrive', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const firstAcceptedElsewhere = vi.fn();
    const secondAcceptedElsewhere = vi.fn();
    const first = coordinator({ storage: new MemoryStorage(), onAcceptedElsewhere: firstAcceptedElsewhere });
    const second = coordinator({ storage: new MemoryStorage(), onAcceptedElsewhere: secondAcceptedElsewhere });
    await first.acquire();
    await second.acquire();
    first.beginAcceptance();
    second.beginAcceptance();

    first.confirmAcceptance();
    second.confirmAcceptance();

    await vi.waitFor(() => expect(second.ownsFlow()).toBe(false));
    expect(first.ownsFlow()).toBe(true);
    expect(firstAcceptedElsewhere).not.toHaveBeenCalled();
    expect(secondAcceptedElsewhere).toHaveBeenCalledWith('match-1');
    first.close();
    second.close();
  });
});

function coordinator({
  storage,
  onAcceptedElsewhere = vi.fn(),
  isReloadNavigation = () => false,
}: {
  storage: Storage;
  onAcceptedElsewhere?: (matchId: string) => void;
  isReloadNavigation?: () => boolean;
}) {
  return createDebateMatchTabOwnershipCoordinator({
    matchId: 'match-1',
    claimId: 'claim-1',
    spaceId: 'space-1',
    userId: 'user-a',
    storage,
    now: () => 1_000,
    isReloadNavigation,
    onAcceptedElsewhere,
  });
}
