import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type DebateRoomOwnershipCoordinator, createDebateRoomOwnershipCoordinator } from './debate-room-ownership';

type QueuedLock = {
  callback: (lock: Lock | null) => Promise<void> | void;
  resolve: () => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
};

class FakeLockManager {
  private held = false;
  private queue: QueuedLock[] = [];
  private pausedRequests = 0;

  pauseNextRequest() {
    this.pausedRequests += 1;
  }

  request(_name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void> | void): Promise<void> {
    if (options.ifAvailable && this.held) {
      return Promise.resolve(callback(null));
    }

    return new Promise<void>((resolve, reject) => {
      const queued = { callback, resolve, reject, signal: options.signal };
      if (options.signal?.aborted) {
        reject(options.signal.reason);
        return;
      }
      options.signal?.addEventListener(
        'abort',
        () => {
          this.queue = this.queue.filter(candidate => candidate !== queued);
          reject(options.signal?.reason);
        },
        { once: true }
      );
      if (this.held || this.pausedRequests > 0) {
        if (this.pausedRequests > 0) this.pausedRequests -= 1;
        this.queue.push(queued);
      } else {
        void this.run(queued);
      }
    });
  }

  grantNextRequest() {
    if (this.held) return;
    const next = this.queue.shift();
    if (next) void this.run(next);
  }

  private async run(queued: QueuedLock) {
    this.held = true;
    try {
      await queued.callback({ name: 'debate-room', mode: 'exclusive' });
      queued.resolve();
    } catch (error) {
      queued.reject(error);
    } finally {
      this.held = false;
      const next = this.queue.shift();
      if (next) void this.run(next);
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

async function closeCoordinators(...coordinators: DebateRoomOwnershipCoordinator[]) {
  for (const coordinator of coordinators) coordinator.close();
  await Promise.all(coordinators.map(coordinator => coordinator.release()));
}

beforeEach(() => {
  FakeBroadcastChannel.channels.clear();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: new FakeLockManager(),
  });
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  let instanceNumber = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `instance-${++instanceNumber}`) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});

describe('debate room ownership', () => {
  it('allows only one tab to own a participant connection', async () => {
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    const second = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });

    expect(first.coordinationMode).toBe('lock-and-broadcast');
    await expect(first.acquire()).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });
    await expect(second.acquire()).resolves.toEqual({ acquired: false, waitedForLocalRelease: false });

    await closeCoordinators(first, second);
  });

  it('hands ownership to another tab only after the current owner releases it', async () => {
    const onTakeoverRequested = vi.fn().mockResolvedValue(true);
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested,
    });
    const second = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    await first.acquire();
    await second.acquire();

    await expect(second.requestTakeover()).resolves.toBe(true);
    expect(onTakeoverRequested).toHaveBeenCalledOnce();
    expect(first.ownsConnection()).toBe(false);
    expect(second.ownsConnection()).toBe(true);

    await closeCoordinators(first, second);
  });

  it('keeps the original owner when an active debate refuses takeover', async () => {
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => false,
    });
    const second = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    await first.acquire();
    await second.acquire();

    await expect(second.requestTakeover()).resolves.toBe(false);
    expect(first.ownsConnection()).toBe(true);
    expect(second.ownsConnection()).toBe(false);

    await closeCoordinators(first, second);
  });

  it('reclaims a free local lock after a duplicate connection displaced the tab', async () => {
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    const second = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    await first.acquire();
    await first.release();

    await expect(second.requestTakeover()).resolves.toBe(true);

    await closeCoordinators(first, second);
  });

  it('waits for an immediate same-tab predecessor to close before acquiring', async () => {
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    await first.acquire();

    first.close();
    const successor = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });

    await expect(successor.acquire()).resolves.toEqual({ acquired: true, waitedForLocalRelease: true });
    expect(successor.ownsConnection()).toBe(true);

    await closeCoordinators(first, successor);
  });

  it('drains a close during pending acquisition before a successor requests the lock', async () => {
    const lockManager = new FakeLockManager();
    lockManager.pauseNextRequest();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: lockManager });
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });

    const firstAcquisition = first.acquire();
    first.close();
    const successor = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    const successorAcquisition = successor.acquire();
    lockManager.grantNextRequest();

    await expect(firstAcquisition).resolves.toEqual({ acquired: false, waitedForLocalRelease: false });
    await expect(successorAcquisition).resolves.toEqual({ acquired: true, waitedForLocalRelease: true });

    await closeCoordinators(first, successor);
  });

  it('drains chained local closes without making a successor wait on itself', async () => {
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    await first.acquire();

    first.close();
    const closingSuccessor = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    const closingAcquisition = closingSuccessor.acquire();
    closingSuccessor.close();
    const finalSuccessor = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    const finalAcquisition = finalSuccessor.acquire();

    await expect(closingAcquisition).resolves.toEqual({ acquired: false, waitedForLocalRelease: true });
    await expect(finalAcquisition).resolves.toEqual({ acquired: true, waitedForLocalRelease: true });

    await closeCoordinators(first, closingSuccessor, finalSuccessor);
  });

  it('keeps repeated release and close calls idempotent', async () => {
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    await first.acquire();

    first.close();
    await Promise.all([first.release(), first.release()]);

    const successor = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    await expect(successor.acquire()).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });

    await closeCoordinators(first, successor);
  });

  it('keeps Web Lock ownership enforcement when BroadcastChannel is unavailable', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    const second = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });

    expect(first.coordinationMode).toBe('lock-only');
    expect(second.coordinationMode).toBe('lock-only');
    await expect(first.acquire()).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });
    await expect(second.acquire()).resolves.toEqual({ acquired: false, waitedForLocalRelease: false });
    await expect(second.requestTakeover()).resolves.toBe(false);

    await closeCoordinators(first, second);
  });

  it('keeps Web Lock ownership enforcement when BroadcastChannel construction fails', async () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('BroadcastChannel is blocked');
        }
      }
    );
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    const second = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });

    expect(first.coordinationMode).toBe('lock-only');
    await expect(first.acquire()).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });
    await expect(second.acquire()).resolves.toEqual({ acquired: false, waitedForLocalRelease: false });

    await closeCoordinators(first, second);
  });

  it('falls back to LiveKit identity handling when Web Locks are unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const first = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });
    const second = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });

    expect(first.coordinationMode).toBe('livekit-fallback');
    expect(second.coordinationMode).toBe('livekit-fallback');
    await expect(first.acquire()).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });
    await expect(second.acquire()).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });

    await closeCoordinators(first, second);
  });
});
