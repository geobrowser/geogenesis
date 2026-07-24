import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDebateRoomOwnershipCoordinator } from './debate-room-ownership';

type QueuedLock = {
  callback: (lock: Lock | null) => Promise<void> | void;
  resolve: () => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
};

class FakeLockManager {
  private held = false;
  private queue: QueuedLock[] = [];

  request(
    _name: string,
    options: LockOptions,
    callback: (lock: Lock | null) => Promise<void> | void
  ): Promise<void> {
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
      if (this.held) {
        this.queue.push(queued);
      } else {
        void this.run(queued);
      }
    });
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

    await expect(first.acquire()).resolves.toBe(true);
    await expect(second.acquire()).resolves.toBe(false);

    first.close();
    second.close();
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

    first.close();
    second.close();
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

    first.close();
    second.close();
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

    first.close();
    second.close();
  });

  it('falls back to LiveKit identity handling when BroadcastChannel is unavailable', async () => {
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

    await expect(first.acquire()).resolves.toBe(true);
    await expect(second.acquire()).resolves.toBe(true);

    first.close();
    second.close();
  });
});
