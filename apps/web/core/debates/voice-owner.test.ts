import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRoomTabPriority } from './debate-room-ownership';
import {
  type TabVoiceOwner,
  type VoiceSurfaceKind,
  type VoiceYieldPolicy,
  createTabVoiceOwner,
  debateVoicePolicy,
  shouldYieldVoice,
} from './voice-owner';

type Held = { name: string; mode: LockMode; tab: string | null; release: () => void };
type Queued = {
  name: string;
  mode: LockMode;
  tab: string | null;
  callback: (lock: Lock | null) => unknown;
  resolve: () => void;
  reject: (error: unknown) => void;
};

/**
 * Web Locks across fake tabs, as the spec has them: shared locks coexist, an exclusive one needs the
 * name free, the queue is FIFO, and `ifAvailable` fails while anything conflicts or is queued.
 */
class FakeLockManager {
  held: Held[] = [];
  queue: Queued[] = [];
  currentTab: string | null = null;

  request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void> | void) {
    const mode = options.mode ?? 'exclusive';
    const queuedHere = this.queue.some(request => request.name === name);
    if (!queuedHere && this.grantable(name, mode)) return this.run(name, mode, this.currentTab, callback);
    if (options.ifAvailable) return Promise.resolve(callback(null));
    return new Promise<void>((resolve, reject) => {
      const request: Queued = { name, mode, tab: this.currentTab, callback, resolve, reject };
      this.queue.push(request);
      options.signal?.addEventListener('abort', () => {
        if (!this.queue.includes(request)) return;
        this.queue = this.queue.filter(candidate => candidate !== request);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  }

  heldCount(name?: string) {
    return this.held.filter(lock => name === undefined || lock.name === name).length;
  }

  query() {
    return Promise.resolve({
      held: this.held.map(({ name, mode }) => ({ name, mode })),
      pending: this.queue.map(({ name, mode }) => ({ name, mode })),
    });
  }

  /** The browser drops a crashed tab's locks; without a tab, every holder's. */
  crash(tab?: string) {
    const dropped = this.held.filter(lock => tab === undefined || lock.tab === tab);
    this.held = this.held.filter(lock => !dropped.includes(lock));
    if (tab !== undefined) this.queue = this.queue.filter(request => request.tab !== tab);
    for (const name of new Set(dropped.map(lock => lock.name))) this.drain(name);
  }

  private grantable(name: string, mode: LockMode) {
    const here = this.held.filter(lock => lock.name === name);
    return mode === 'exclusive' ? here.length === 0 : here.every(lock => lock.mode === 'shared');
  }

  // A queued request's callback runs later in its own tab's event loop; the lock is held meanwhile.
  private run(
    name: string,
    mode: LockMode,
    tab: string | null,
    callback: (lock: Lock | null) => unknown,
    queued = false
  ) {
    const held: Held = { name, mode, tab, release: () => {} };
    this.held.push(held);
    return new Promise<void>(resolve => {
      held.release = () => {
        if (!this.held.includes(held)) return;
        this.held = this.held.filter(lock => lock !== held);
        resolve();
        this.drain(name);
      };
      const invoke = () => void Promise.resolve(callback({ name, mode })).then(held.release, held.release);
      if (queued) setTimeout(invoke, 0);
      else invoke();
    });
  }

  private drain(name: string) {
    for (;;) {
      const next = this.queue.find(request => request.name === name);
      if (!next || !this.grantable(name, next.mode)) return;
      this.queue = this.queue.filter(request => request !== next);
      void this.run(name, next.mode, next.tab, next.callback, true).then(next.resolve, next.reject);
    }
  }
}

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  static currentTab: string | null = null;
  readonly tab = FakeBroadcastChannel.currentTab;
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

  static crash(tab: string) {
    for (const channels of FakeBroadcastChannel.channels.values()) {
      for (const channel of channels) if (channel.tab === tab) channels.delete(channel);
    }
  }
}

let locks: FakeLockManager;

type FakeTab = {
  name: string;
  owner: TabVoiceOwner;
  priority: DebateRoomTabPriority;
  yields: number;
  /** Registers a surface and runs `fn` as this tab, so its lock and channel belong to it. */
  surface: (kind: VoiceSurfaceKind, policy?: VoiceYieldPolicy) => { policy: VoiceYieldPolicy; unregister: () => void };
  claim: (kind: VoiceSurfaceKind, automatic?: boolean) => Promise<boolean>;
};

function asTab<T>(name: string, fn: () => T): T {
  locks.currentTab = name;
  FakeBroadcastChannel.currentTab = name;
  try {
    return fn();
  } finally {
    locks.currentTab = null;
    FakeBroadcastChannel.currentTab = null;
  }
}

function openTab(name: string, priority: DebateRoomTabPriority = 2): FakeTab {
  const tab: FakeTab = {
    name,
    priority,
    yields: 0,
    owner: createTabVoiceOwner({ userId: 'user-a', getTabPriority: () => tab.priority }),
    surface: (kind, policy = 'yield') => {
      const handle = { policy, unregister: () => {} };
      handle.unregister = tab.owner.register({
        kind,
        policy: () => handle.policy,
        onYield: () => {
          tab.yields += 1;
        },
      });
      return handle;
    },
    claim: (kind, automatic = false) => asTab(name, () => tab.owner.claim({ kind, automatic })),
  };
  return tab;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  FakeBroadcastChannel.channels.clear();
  locks = new FakeLockManager();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  let instanceNumber = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `instance-${++instanceNumber}`) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});

describe('shouldYieldVoice', () => {
  const owners: { label: string; policy: VoiceYieldPolicy }[] = [
    { label: 'lobby', policy: 'yield' },
    { label: 'picker', policy: 'yield' },
    { label: 'preview', policy: 'yield' },
    { label: 'debate in ready', policy: 'explicit-only' },
    { label: 'live debate', policy: 'refuse' },
  ];
  const priorities: DebateRoomTabPriority[] = [0, 1, 2];

  for (const { label, policy } of owners) {
    for (const automatic of [false, true]) {
      for (const requesterPriority of priorities) {
        for (const ownerPriority of priorities) {
          const expected =
            policy === 'refuse'
              ? false
              : !automatic
                ? true
                : policy === 'explicit-only'
                  ? false
                  : requesterPriority > ownerPriority;
          it(`${label} owner, ${automatic ? 'automatic' : 'explicit'} claim, requester ${requesterPriority} vs owner ${ownerPriority}: ${expected ? 'yields' : 'keeps'}`, () => {
            expect(shouldYieldVoice([policy], { automatic, requesterPriority, ownerPriority })).toBe(expected);
          });
        }
      }
    }
  }

  it('answers for the strongest surface in the tab', () => {
    const explicit = { automatic: false, requesterPriority: 2, ownerPriority: 0 } as const;
    expect(shouldYieldVoice(['yield', 'refuse'], explicit)).toBe(false);
    expect(shouldYieldVoice(['explicit-only', 'yield'], { ...explicit, automatic: true })).toBe(false);
    expect(shouldYieldVoice([], { ...explicit, automatic: true })).toBe(true);
  });
});

describe('debateVoicePolicy', () => {
  it.each([
    ['ready', true, 'explicit-only'],
    ['connecting', true, 'refuse'],
    ['preflight', true, 'refuse'],
    ['in_progress', true, 'refuse'],
    ['thanking', true, 'refuse'],
    ['complete', true, 'yield'],
    ['cancelled', true, 'yield'],
    ['in_progress', false, 'yield'],
    [null, true, 'yield'],
  ] as const)('%s, holding the room %s: %s', (status, holdsRoom, expected) => {
    expect(debateVoicePolicy(status, holdsRoom)).toBe(expected);
  });
});

describe('tab voice owner', () => {
  it('lets a picker opened in a new focused tab take voice from a hidden lobby tab', async () => {
    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await expect(lobbyTab.claim('lobby', true)).resolves.toBe(true);

    lobbyTab.priority = 0;
    const pickerTab = openTab('picker', 2);
    pickerTab.surface('picker');
    await expect(pickerTab.claim('picker', true)).resolves.toBe(true);

    expect(lobbyTab.yields).toBe(1);
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: 'picker' });
    expect(pickerTab.owner.getState()).toEqual({ ownership: 'owned', heldBy: null });
  });

  it('hands voice between two visible windows on "Use voice here"', async () => {
    const left = openTab('left', 2);
    left.surface('lobby');
    await left.claim('lobby', true);

    // Side by side: the right window opens unfocused-visible and must not steal by remounting.
    const right = openTab('right', 1);
    right.surface('picker');
    await expect(right.claim('picker', true)).resolves.toBe(false);
    expect(right.owner.getState().ownership).toBe('elsewhere');

    left.priority = 1;
    await expect(right.claim('picker')).resolves.toBe(true);
    expect(left.owner.getState().ownership).toBe('elsewhere');

    await expect(left.claim('lobby')).resolves.toBe(true);
    expect(right.owner.getState().ownership).toBe('elsewhere');
    expect(right.yields).toBe(1);
  });

  it('never lets a focused stale tab take voice by itself', async () => {
    const pickerTab = openTab('picker', 1);
    pickerTab.surface('picker');
    await pickerTab.claim('picker', true);

    const lobbyTab = openTab('lobby', 1);
    lobbyTab.surface('lobby');
    await expect(lobbyTab.claim('lobby', true)).resolves.toBe(false);
    expect(pickerTab.yields).toBe(0);
  });

  it('keeps voice in a live debate and says so to the asking tab', async () => {
    const debateTab = openTab('debate', 0);
    const debate = debateTab.surface('debate', 'refuse');
    await debateTab.claim('debate');

    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await expect(lobbyTab.claim('lobby')).resolves.toBe(false);
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: 'debate' });
    expect(debateTab.yields).toBe(0);

    // Once the debate is over it yields to any taker, and the waiting tab gets its button back.
    debate.policy = 'yield';
    debateTab.owner.announceYieldable();
    await flush();
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: null });
    await expect(lobbyTab.claim('lobby')).resolves.toBe(true);
    expect(debateTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: 'lobby' });
  });

  it('gives a debate in its intro to "Use voice here" but not to a remount', async () => {
    const debateTab = openTab('debate', 0);
    debateTab.surface('debate', 'explicit-only');
    await debateTab.claim('debate');

    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await expect(lobbyTab.claim('lobby', true)).resolves.toBe(false);
    await expect(lobbyTab.claim('lobby')).resolves.toBe(true);
    expect(debateTab.yields).toBe(1);
  });

  it('announces only from the tab holding voice, and only when it would yield', async () => {
    const debateTab = openTab('debate', 0);
    const debate = debateTab.surface('debate', 'refuse');
    await debateTab.claim('debate');
    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby');

    // Still live: nothing to announce.
    debateTab.owner.announceYieldable();
    // Another tab that does not hold voice.
    const bystander = openTab('bystander', 1);
    bystander.surface('preview');
    asTab('bystander', () => bystander.owner.announceYieldable());
    await flush();
    expect(lobbyTab.owner.getState().heldBy).toBe('debate');

    debate.policy = 'yield';
    debateTab.owner.announceYieldable();
    await flush();
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: null });
  });

  it('asks again for a claim made while this tab is still handing voice over', async () => {
    const debateTab = openTab('debate', 0);
    let policy: VoiceYieldPolicy = 'explicit-only';
    let finishYield = () => {};
    let yieldStarted = () => {};
    const started = new Promise<void>(resolve => (yieldStarted = resolve));
    asTab('debate', () =>
      debateTab.owner.register({
        kind: 'debate',
        policy: () => policy,
        onYield: () =>
          new Promise<void>(resolve => {
            finishYield = resolve;
            yieldStarted();
          }),
      })
    );
    await debateTab.claim('debate');

    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    const lobbyClaim = lobbyTab.claim('lobby');
    await started;

    // The intro flips to connecting mid-handover and claims voice for the room.
    policy = 'refuse';
    const debateClaim = debateTab.claim('debate');
    finishYield();
    await expect(lobbyClaim).resolves.toBe(true);
    await expect(debateClaim).resolves.toBe(true);
    expect(debateTab.owner.getState()).toEqual({ ownership: 'owned', heldBy: null });
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: 'debate' });
    expect(locks.heldCount()).toBe(1);
  });

  it('takes voice from a lobby tab when a debate claims it', async () => {
    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby', true);

    const debateTab = openTab('debate', 0);
    debateTab.surface('debate', 'refuse');
    await expect(debateTab.claim('debate')).resolves.toBe(true);
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: 'debate' });
  });

  it('asks again as explicit when "Use voice here" lands behind a page-open claim', async () => {
    const left = openTab('left', 2);
    left.surface('lobby');
    await left.claim('lobby', true);

    const right = openTab('right', 1);
    right.surface('picker');
    const mounting = right.claim('picker', true);
    const pressed = right.claim('picker');
    await expect(mounting).resolves.toBe(false);
    await expect(pressed).resolves.toBe(true);
    expect(left.owner.getState().ownership).toBe('elsewhere');
  });

  it('shares one hold between surfaces of the same tab', async () => {
    const tab = openTab('one', 2);
    tab.surface('lobby');
    await tab.claim('lobby', true);
    tab.surface('preview');
    await expect(tab.claim('preview')).resolves.toBe(true);
    expect(tab.yields).toBe(0);
  });

  it('keeps the hold across an in-app move from the lobby into a debate', async () => {
    const tab = openTab('one', 2);
    const lobby = tab.surface('lobby');
    await tab.claim('lobby', true);

    lobby.unregister();
    tab.surface('debate', 'refuse');
    await flush();
    expect(tab.owner.getState().ownership).toBe('owned');
    expect(locks.heldCount()).toBe(1);
  });

  it('frees voice when the owning tab closes', async () => {
    const first = openTab('first', 2);
    const lobby = first.surface('lobby');
    await first.claim('lobby', true);

    lobby.unregister();
    await flush();
    await flush();
    expect(locks.heldCount()).toBe(0);

    const second = openTab('second', 0);
    second.surface('picker');
    await expect(second.claim('picker', true)).resolves.toBe(true);
  });

  it('gives the waiting tab its button back when the debate tab closes', async () => {
    const debateTab = openTab('debate', 0);
    const debate = debateTab.surface('debate', 'refuse');
    await debateTab.claim('debate');
    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby');
    expect(lobbyTab.owner.getState().heldBy).toBe('debate');

    debate.unregister();
    await flush();
    await flush();
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: null });
    await expect(lobbyTab.claim('lobby')).resolves.toBe(true);
  });

  it('gives the waiting tab its button back when the debate tab goes without a word', async () => {
    const debateTab = openTab('debate', 0);
    debateTab.surface('debate', 'refuse');
    await debateTab.claim('debate');
    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby');
    expect(lobbyTab.owner.getState().heldBy).toBe('debate');

    // Closed, crashed or reloaded: no React cleanup, no notice, only the lock let go.
    locks.crash('debate');
    FakeBroadcastChannel.crash('debate');
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: null });
    await expect(lobbyTab.claim('lobby')).resolves.toBe(true);
  });

  it('lets a debate tab taking the room over claim voice while a lobby tab waits on it', async () => {
    const firstDebate = openTab('debate-1', 1);
    const room = firstDebate.surface('debate', 'refuse');
    await firstDebate.claim('debate');
    const lobbyTab = openTab('lobby', 0);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby');
    expect(lobbyTab.owner.getState().heldBy).toBe('debate');

    // "Continue here": the first tab hands the room over, then the new tab claims voice at once.
    room.policy = 'yield';
    const secondDebate = openTab('debate-2', 2);
    secondDebate.surface('debate', 'refuse');
    await expect(secondDebate.claim('debate')).resolves.toBe(true);
    expect(locks.heldCount()).toBe(1);
    expect(lobbyTab.owner.getState().ownership).toBe('elsewhere');
  });

  it('lets a reloaded debate tab claim voice back while a lobby tab waits on it', async () => {
    const debateTab = openTab('debate', 1);
    debateTab.surface('debate', 'refuse');
    await debateTab.claim('debate');
    const lobbyTab = openTab('lobby', 0);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby');

    locks.crash();
    FakeBroadcastChannel.crash('debate');
    const reloaded = openTab('debate-reloaded', 2);
    reloaded.surface('debate', 'refuse');
    await expect(reloaded.claim('debate')).resolves.toBe(true);
  });

  it('keeps claiming for a debate until it holds voice', async () => {
    // A lock held by a tab that never answers, e.g. a frozen tab's granted request.
    let letGo = () => {};
    void locks.request('geo:debate-room:voice:user-a', {}, () => new Promise<void>(resolve => (letGo = resolve)));
    const debateTab = openTab('debate', 2);
    debateTab.surface('debate', 'refuse');
    await expect(debateTab.claim('debate')).resolves.toBe(false);

    const held = asTab('debate', () => debateTab.owner.claimUntilHeld({ kind: 'debate', stop: () => false }));
    letGo();
    await expect(held).resolves.toBe(true);
    expect(debateTab.owner.getState()).toEqual({ ownership: 'owned', heldBy: null });
  }, 10_000);

  it('stops claiming once the debate no longer needs voice', async () => {
    void locks.request('geo:debate-room:voice:user-a', {}, () => new Promise<void>(() => {}));
    const debateTab = openTab('debate', 2);
    debateTab.surface('debate', 'refuse');
    let stopped = false;
    const held = asTab('debate', () => debateTab.owner.claimUntilHeld({ kind: 'debate', stop: () => stopped }));
    stopped = true;
    await expect(held).resolves.toBe(false);
  }, 10_000);

  it('checks again every few seconds while a waiting tab is on screen', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const debateTab = openTab('debate', 0);
    debateTab.surface('debate', 'refuse');
    await debateTab.claim('debate');
    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby');

    locks.crash();
    FakeBroadcastChannel.crash('debate');
    await flush();
    expect(lobbyTab.owner.getState().heldBy).toBe('debate');
    vi.advanceTimersByTime(3_000);
    await flush();
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: null });
  });

  it('keeps the button hidden while the debate really is live', async () => {
    const debateTab = openTab('debate', 0);
    debateTab.surface('debate', 'refuse');
    await debateTab.claim('debate');
    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby');

    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(lobbyTab.owner.getState().heldBy).toBe('debate');
    expect(lobbyTab.owner.getState().ownership).toBe('elsewhere');
  });

  it('gives a tab that missed the notice its button back when it is looked at again', async () => {
    const debateTab = openTab('debate', 0);
    const debate = debateTab.surface('debate', 'refuse');
    await debateTab.claim('debate');
    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby');

    // The debate ends while the lobby tab is frozen: its notice is lost, and the lock stays held.
    debate.policy = 'yield';
    expect(lobbyTab.owner.getState().heldBy).toBe('debate');

    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    await flush();
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: null });
  });

  it('frees voice when the owning tab crashes', async () => {
    const first = openTab('first', 2);
    first.surface('debate', 'refuse');
    await first.claim('debate');
    locks.crash('first');
    FakeBroadcastChannel.crash('first');

    const second = openTab('second', 0);
    second.surface('lobby');
    await expect(second.claim('lobby', true)).resolves.toBe(true);
  });

  it('reports whether another tab holds voice without asking for it', async () => {
    const lobbyTab = openTab('lobby', 0);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby', true);

    const cardTab = openTab('card', 2);
    cardTab.surface('preview');
    await expect(cardTab.owner.heldElsewhere()).resolves.toBe(true);
    expect(lobbyTab.yields).toBe(0);
    expect(lobbyTab.owner.getState().ownership).toBe('owned');
  });

  it('never withholds voice without Web Locks', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const first = openTab('first', 2);
    first.surface('lobby');
    const second = openTab('second', 2);
    second.surface('picker');
    await expect(first.claim('lobby', true)).resolves.toBe(true);
    await expect(second.claim('picker', true)).resolves.toBe(true);
    await expect(second.owner.heldElsewhere()).resolves.toBe(false);
  });

  it('never withholds voice without BroadcastChannel', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const first = openTab('first', 2);
    first.surface('lobby');
    const second = openTab('second', 2);
    second.surface('picker');
    await expect(first.claim('lobby', true)).resolves.toBe(true);
    await expect(second.claim('picker', true)).resolves.toBe(true);
    await expect(second.owner.heldElsewhere()).resolves.toBe(false);
  });
});
