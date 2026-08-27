import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type DebateRoomOwnershipCoordinator,
  type DebateRoomTabPriority,
  type DebateRoomTakeoverContext,
  createDebateRoomOwnershipCoordinator,
  debateRoomTabPriority,
} from './debate-room-ownership';

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
  // Tests that don't inject getTabPriority run as a focused tab, so the acquisition stagger stays
  // out of every pre-existing timing expectation.
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
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

  it('falls back to LiveKit identity handling when a Web Lock request fails', async () => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: vi.fn().mockRejectedValue(new Error('Web Locks are unavailable')),
      },
    });
    const coordinator = createDebateRoomOwnershipCoordinator({
      debateId: 'debate-1',
      userId: 'user-a',
      onTakeoverRequested: () => true,
    });

    expect(coordinator.coordinationMode).toBe('lock-and-broadcast');
    await expect(coordinator.acquire()).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });
    expect(coordinator.coordinationMode).toBe('livekit-fallback');
    expect(coordinator.ownsConnection()).toBe(true);

    await closeCoordinators(coordinator);
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

describe('debateRoomTabPriority', () => {
  function stubVisibility(visibilityState: DocumentVisibilityState, hasFocus: boolean | undefined) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibilityState });
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: hasFocus === undefined ? undefined : () => hasFocus,
    });
  }

  afterEach(() => {
    // Restore the jsdom prototype getters shadowed by the instance properties above.
    Reflect.deleteProperty(document, 'visibilityState');
    Reflect.deleteProperty(document, 'hasFocus');
  });

  it('ranks hidden below visible below focused, and fails open without hasFocus', () => {
    stubVisibility('hidden', true);
    expect(debateRoomTabPriority()).toBe(0);

    stubVisibility('visible', false);
    expect(debateRoomTabPriority()).toBe(1);

    stubVisibility('visible', true);
    expect(debateRoomTabPriority()).toBe(2);

    // Browsers without hasFocus must claim focus: the worst case is the pre-stagger race, never
    // a tab that voluntarily delays itself behind everyone else.
    stubVisibility('visible', undefined);
    expect(debateRoomTabPriority()).toBe(2);
  });
});

describe('focus-weighted acquisition', () => {
  // Unique per test: the local-release barrier map is module-global and keyed by debateId/userId,
  // so a mid-stagger close leaking a barrier must not be able to hang the next test.
  let staggerDebateId = 'debate-stagger-0';
  let staggerDebateNumber = 0;

  beforeEach(() => {
    staggerDebateId = `debate-stagger-${++staggerDebateNumber}`;
  });

  function createTab(
    getTabPriority: () => DebateRoomTabPriority,
    onTakeoverRequested: (context: DebateRoomTakeoverContext) => boolean | Promise<boolean> = () => true
  ) {
    return createDebateRoomOwnershipCoordinator({
      debateId: staggerDebateId,
      userId: 'user-a',
      onTakeoverRequested,
      getTabPriority,
    });
  }

  it('lets a focused tab win the lock over a hidden tab that asked first', async () => {
    vi.useFakeTimers();
    const hidden = createTab(() => 0);
    const focused = createTab(() => 2);

    const hiddenAcquisition = hidden.acquire();
    const focusedAcquisition = focused.acquire();

    await expect(focusedAcquisition).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });
    await vi.advanceTimersByTimeAsync(700);
    await expect(hiddenAcquisition).resolves.toEqual({ acquired: false, waitedForLocalRelease: false });

    await closeCoordinators(hidden, focused);
  });

  it('keeps first-come ordering between two hidden tabs', async () => {
    vi.useFakeTimers();
    const first = createTab(() => 0);
    const second = createTab(() => 0);

    const firstAcquisition = first.acquire();
    const secondAcquisition = second.acquire();
    await vi.advanceTimersByTimeAsync(700);

    await expect(firstAcquisition).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });
    await expect(secondAcquisition).resolves.toEqual({ acquired: false, waitedForLocalRelease: false });

    await closeCoordinators(first, second);
  });

  it('acquires early when the tab gains focus mid-stagger', async () => {
    vi.useFakeTimers();
    let priority: DebateRoomTabPriority = 0;
    const tab = createTab(() => priority);

    let settled = false;
    const acquisition = tab.acquire();
    void acquisition.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    priority = 2;
    window.dispatchEvent(new Event('focus'));

    // Resolves without the 700ms hidden-tab stagger elapsing.
    await expect(acquisition).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });

    await closeCoordinators(tab);
  });

  it('settles a mid-stagger acquire immediately when a takeover arrives', async () => {
    vi.useFakeTimers();
    const tab = createTab(() => 0);

    const acquisition = tab.acquire();
    // No timer advance: the takeover hits the acquisition dedup slot while its 700ms stagger is
    // pending and must force-settle it rather than inherit the residual delay.
    await expect(tab.requestTakeover()).resolves.toBe(true);
    await expect(acquisition).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });

    await closeCoordinators(tab);
  });

  it('does not make a same-tab successor wait out a predecessor stagger after close', async () => {
    vi.useFakeTimers();
    const hidden = createTab(() => 0);

    void hidden.acquire();
    hidden.close();

    // No timer advance: close() must settle the cancelled stagger so the local-release barrier
    // resolves now, not 700ms later — a StrictMode remount would otherwise pay the delay twice.
    const successor = createTab(() => 2);
    await expect(successor.acquire()).resolves.toEqual({ acquired: true, waitedForLocalRelease: true });

    await closeCoordinators(hidden, successor);
  });

  it('does not acquire when closed during the stagger', async () => {
    vi.useFakeTimers();
    const tab = createTab(() => 0);

    const acquisition = tab.acquire();
    tab.close();
    await vi.advanceTimersByTimeAsync(700);

    await expect(acquisition).resolves.toEqual({ acquired: false, waitedForLocalRelease: false });
    expect(tab.ownsConnection()).toBe(false);

    await closeCoordinators(tab);
  });

  it('skips the stagger for explicit takeovers and hands both priorities to the owner', async () => {
    vi.useFakeTimers();
    const onTakeoverRequested = vi.fn().mockResolvedValue(true);
    const owner = createTab(() => 0, onTakeoverRequested);
    const requester = createTab(() => 2);

    const ownerAcquisition = owner.acquire();
    await vi.advanceTimersByTimeAsync(700);
    await expect(ownerAcquisition).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });

    // No timer advance: a hidden owner's release must not delay the takeover by another stagger.
    await expect(requester.requestTakeover()).resolves.toBe(true);
    expect(onTakeoverRequested).toHaveBeenCalledWith({ requesterPriority: 2, ownerPriority: 0 });

    await closeCoordinators(owner, requester);
  });

  it('treats a takeover request without a priority as coming from a focused tab', async () => {
    const onTakeoverRequested = vi.fn().mockResolvedValue(false);
    const owner = createTab(() => 1, onTakeoverRequested);
    await owner.acquire();

    // An old tab running a build that predates requesterPriority omits the field entirely.
    const legacyChannel = new FakeBroadcastChannel(`geo:debate-room:${staggerDebateId}:user-a`);
    legacyChannel.postMessage({ type: 'takeover-request', requestId: 'legacy-1', requesterId: 'legacy-instance' });
    await new Promise(resolve => queueMicrotask(() => resolve(undefined)));

    expect(onTakeoverRequested).toHaveBeenCalledWith({ requesterPriority: 2, ownerPriority: 1 });

    legacyChannel.close();
    await closeCoordinators(owner);
  });

  it('does not stagger the LiveKit fallback, where last connect wins', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const hidden = createTab(() => 0);

    // Resolves immediately under real timers: a delay here would hand the room to the hidden tab,
    // because DUPLICATE_IDENTITY arbitration favors the LAST tab to connect.
    await expect(hidden.acquire()).resolves.toEqual({ acquired: true, waitedForLocalRelease: false });

    await closeCoordinators(hidden);
  });
});
