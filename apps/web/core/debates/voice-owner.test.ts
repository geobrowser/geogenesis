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

type Holder = { release: () => void; tab: string | null };
type Waiter = { name: string; callback: (lock: Lock | null) => unknown; resolve: () => void; tab: string | null };

/** Web Locks across fake tabs: one holder per name, queued requests granted when it goes, crashes included. */
class FakeLockManager {
  held = new Map<string, Holder>();
  waiting: Waiter[] = [];
  currentTab: string | null = null;

  request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void> | void) {
    if (options.ifAvailable && this.held.has(name)) return Promise.resolve(callback(null));
    if (this.held.has(name)) {
      return new Promise<void>((resolve, reject) => {
        const waiter: Waiter = { name, callback, resolve, tab: this.currentTab };
        this.waiting.push(waiter);
        options.signal?.addEventListener('abort', () => {
          this.waiting = this.waiting.filter(candidate => candidate !== waiter);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }
    return this.grant(name, callback, this.currentTab);
  }

  private grant(name: string, callback: (lock: Lock | null) => unknown, tab: string | null) {
    const holder: Holder = { release: () => {}, tab };
    this.held.set(name, holder);
    return new Promise<void>(resolve => {
      holder.release = () => {
        if (this.held.get(name) !== holder) return;
        this.held.delete(name);
        resolve();
        this.next(name);
      };
      void Promise.resolve(callback({ name, mode: 'exclusive' })).then(holder.release);
    });
  }

  private next(name: string) {
    const waiter = this.waiting.find(candidate => candidate.name === name);
    if (!waiter) return;
    this.waiting = this.waiting.filter(candidate => candidate !== waiter);
    void this.grant(name, waiter.callback, waiter.tab).then(waiter.resolve);
  }

  query() {
    return Promise.resolve({
      held: [...this.held.keys()].map(name => ({ name, mode: 'exclusive' as const })),
      pending: [],
    });
  }

  /** The browser drops a crashed tab's locks; without a tab, every holder's. */
  crash(tab?: string) {
    for (const [name, holder] of [...this.held]) {
      if (tab !== undefined && holder.tab !== tab) continue;
      this.held.delete(name);
      this.next(name);
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
    expect(locks.held.size).toBe(1);
  });

  it('frees voice when the owning tab closes', async () => {
    const first = openTab('first', 2);
    const lobby = first.surface('lobby');
    await first.claim('lobby', true);

    lobby.unregister();
    await flush();
    await flush();
    expect(locks.held.size).toBe(0);

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
    await flush();
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: null });
    await expect(lobbyTab.claim('lobby')).resolves.toBe(true);
  });

  it('watches a debate that took voice from this tab, without blocking its claim', async () => {
    const lobbyTab = openTab('lobby', 2);
    lobbyTab.surface('lobby');
    await lobbyTab.claim('lobby', true);

    const debateTab = openTab('debate', 0);
    debateTab.surface('debate', 'refuse');
    await expect(debateTab.claim('debate')).resolves.toBe(true);
    await flush();
    expect(lobbyTab.owner.getState()).toEqual({ ownership: 'elsewhere', heldBy: 'debate' });
    expect(locks.waiting).toHaveLength(1);

    // The debate's lock was granted after the handover, outside the tab scope the fake tracks.
    locks.crash();
    FakeBroadcastChannel.crash('debate');
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
