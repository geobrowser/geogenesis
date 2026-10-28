import * as React from 'react';

import {
  type DebateRoomOwnershipCoordinator,
  type DebateRoomTabPriority,
  type DebateRoomTakeoverContext,
  createDebateRoomOwnershipCoordinator,
  debateRoomCoordinationName,
  debateRoomTabPriority,
} from './debate-room-ownership';

// One voice per person across Geo tabs: a tab holds one per-user lock while any of its voice
// surfaces is in use, and every other tab stops sending and playing.

export type VoiceSurfaceKind = 'lobby' | 'picker' | 'preview' | 'debate';

/** How a surface answers another tab asking for voice. */
export type VoiceYieldPolicy = 'yield' | 'explicit-only' | 'refuse';

export type VoiceOwnership = 'pending' | 'owned' | 'elsewhere';

export type VoiceTabState = {
  ownership: VoiceOwnership;
  /** The surface known to hold voice in the other tab, when it said. */
  heldBy: VoiceSurfaceKind | null;
};

export type VoiceSurface = {
  kind: VoiceSurfaceKind;
  policy: () => VoiceYieldPolicy;
  /** Stops sending, playing and capturing before the other tab is told it may go. */
  onYield: () => void | Promise<void>;
};

export type VoiceClaimOptions = {
  /**
   * A page opening or remounting, rather than the viewer asking ("Use voice here", turning a device
   * on, joining a debate). Wins only from a tab nearer the viewer than the owner.
   */
  automatic?: boolean;
  kind: VoiceSurfaceKind;
};

const POLICY_RANK: Record<VoiceYieldPolicy, number> = { yield: 0, 'explicit-only': 1, refuse: 2 };

/**
 * Whether a tab whose surfaces have `policies` hands voice to the asking tab. Focus alone never
 * takes voice: an automatic claim needs the requester nearer the viewer (focused > visible > hidden).
 */
export function shouldYieldVoice(
  policies: readonly VoiceYieldPolicy[],
  {
    automatic,
    requesterPriority,
    ownerPriority,
  }: Pick<DebateRoomTakeoverContext, 'automatic' | 'requesterPriority' | 'ownerPriority'>
): boolean {
  const strongest = strongestPolicy(policies);
  if (strongest === 'refuse') return false;
  if (!automatic) return true;
  if (strongest === 'explicit-only') return false;
  return requesterPriority > ownerPriority;
}

function strongestPolicy(policies: readonly VoiceYieldPolicy[]): VoiceYieldPolicy {
  return policies.reduce<VoiceYieldPolicy>(
    (strongest, policy) => (POLICY_RANK[policy] > POLICY_RANK[strongest] ? policy : strongest),
    'yield'
  );
}

/**
 * A debate room's answer while it holds its room: the intro gives voice up only to an explicit
 * claim, a debate in progress keeps it, and an ended one gives it to anyone.
 */
export function debateVoicePolicy(status: string | null, holdsRoom: boolean): VoiceYieldPolicy {
  if (!holdsRoom || status === null || status === 'complete' || status === 'cancelled') return 'yield';
  if (status === 'ready') return 'explicit-only';
  return 'refuse';
}

const SURFACE_KINDS: readonly string[] = ['lobby', 'picker', 'preview', 'debate'] satisfies VoiceSurfaceKind[];

function asSurfaceKind(label: string | undefined): VoiceSurfaceKind | null {
  return label && SURFACE_KINDS.includes(label) ? (label as VoiceSurfaceKind) : null;
}

const VOICE_SCOPE = 'voice';
const DEBATE_RECHECK_MS = 3_000;
const CLAIM_RETRY_MS = 250;

export type TabVoiceOwner = {
  register: (surface: VoiceSurface) => () => void;
  claim: (options: VoiceClaimOptions) => Promise<boolean>;
  /** Explicit claims until one holds voice or `stop()` says to give up; true once held. */
  claimUntilHeld: (options: { kind: VoiceSurfaceKind; stop: () => boolean }) => Promise<boolean>;
  /** Whether another tab holds voice right now, without asking for it. */
  heldElsewhere: () => Promise<boolean>;
  /** Tells tabs waiting on this one that its surfaces now yield, e.g. a debate that ended. */
  announceYieldable: () => void;
  getState: () => VoiceTabState;
  subscribe: (listener: () => void) => () => void;
};

const PENDING: VoiceTabState = { ownership: 'pending', heldBy: null };
const OWNED: VoiceTabState = { ownership: 'owned', heldBy: null };

export function createTabVoiceOwner({
  userId,
  getTabPriority = debateRoomTabPriority,
}: {
  userId: string;
  // Test seam; production uses debateRoomTabPriority.
  getTabPriority?: () => DebateRoomTabPriority;
}): TabVoiceOwner {
  const surfaces = new Set<VoiceSurface>();
  const listeners = new Set<() => void>();
  let state: VoiceTabState = PENDING;
  let coordinator: DebateRoomOwnershipCoordinator | null = null;
  let inflight: { automatic: boolean; owned: Promise<boolean> } | null = null;
  let teardown: ReturnType<typeof setTimeout> | null = null;
  let notices: BroadcastChannel | null = null;
  let debateWatch: ReturnType<typeof setInterval> | null = null;
  const lockName = debateRoomCoordinationName(VOICE_SCOPE, userId);
  const lockManager = () => (typeof navigator !== 'undefined' ? navigator.locks : undefined);

  const waitingOnDebate = () => state.ownership === 'elsewhere' && state.heldBy === 'debate';
  const restoreButton = () => {
    if (waitingOnDebate()) setState({ ownership: 'elsewhere', heldBy: null });
  };

  // The debate tab can go without a notice (crash, unload) or this tab can miss one while frozen.
  // A free lock gives the button back; a held one is asked whether it would yield now. Only
  // query(): a lock request here, even shared, would block the next exclusive claim.
  const recheckDebateHold = async () => {
    if (!waitingOnDebate() || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
    try {
      const { held = [] } = (await lockManager()?.query()) ?? {};
      if (!held.some(lock => lock.name === lockName)) return restoreButton();
    } catch {
      // Fall through to asking.
    }
    try {
      notices?.postMessage({ type: 'policy-query' });
    } catch {
      // The next check asks again.
    }
  };

  const startDebateWatch = () => {
    if (debateWatch !== null) return;
    debateWatch = setInterval(() => void recheckDebateHold(), DEBATE_RECHECK_MS);
    window.addEventListener('focus', recheckDebateHold);
    document.addEventListener('visibilitychange', recheckDebateHold);
  };

  const stopDebateWatch = () => {
    if (debateWatch === null) return;
    clearInterval(debateWatch);
    debateWatch = null;
    window.removeEventListener('focus', recheckDebateHold);
    document.removeEventListener('visibilitychange', recheckDebateHold);
  };

  const setState = (next: VoiceTabState) => {
    if (next.ownership === state.ownership && next.heldBy === state.heldBy) return;
    state = next;
    if (waitingOnDebate()) startDebateWatch();
    else stopDebateWatch();
    listeners.forEach(listener => listener());
  };

  const surfacePolicies = () => [...surfaces].map(surface => surface.policy());

  const strongestSurface = () => {
    let strongest: VoiceSurface | null = null;
    for (const surface of surfaces) {
      if (!strongest || POLICY_RANK[surface.policy()] > POLICY_RANK[strongest.policy()]) strongest = surface;
    }
    return strongest;
  };

  // A tab told "your debate tab" has no button; it gets one back once that tab would yield.
  const ensureNotices = () => {
    if (notices || typeof BroadcastChannel === 'undefined') return;
    try {
      notices = new BroadcastChannel(`geo:voice-notice:${userId}`);
    } catch {
      return;
    }
    notices.onmessage = event => {
      const type = (event.data as { type?: string } | null)?.type;
      if (type === 'yieldable') return restoreButton();
      if (type === 'policy-query' && coordinator?.ownsConnection() && strongestPolicy(surfacePolicies()) === 'yield') {
        announceYieldable();
      }
    };
  };

  const announceYieldable = () => {
    try {
      notices?.postMessage({ type: 'yieldable' });
    } catch {
      // Best effort: the waiting tab still has its notice.
    }
  };

  const ensureCoordinator = () => {
    ensureNotices();
    if (coordinator) return coordinator;
    const created = createDebateRoomOwnershipCoordinator({
      debateId: VOICE_SCOPE,
      userId,
      getTabPriority,
      describeOwner: () => strongestSurface()?.kind,
      onTakeoverRequested: async context => {
        if (!shouldYieldVoice(surfacePolicies(), context)) return false;
        // Off the air before the UI moves: unmounting the room first would drop the handle to await.
        await Promise.allSettled([...surfaces].map(surface => Promise.resolve().then(surface.onYield)));
        setState({ ownership: 'elsewhere', heldBy: asSurfaceKind(context.requesterLabel) });
        return true;
      },
    });
    coordinator = created;
    return created;
  };

  const close = () => {
    const owned = coordinator?.ownsConnection() ?? false;
    coordinator?.close();
    coordinator = null;
    inflight = null;
    if (owned) announceYieldable();
    notices?.close();
    notices = null;
    setState(PENDING);
    stopDebateWatch();
  };

  const owner: TabVoiceOwner = {
    register: surface => {
      if (teardown !== null) {
        clearTimeout(teardown);
        teardown = null;
      }
      surfaces.add(surface);
      return () => {
        surfaces.delete(surface);
        if (surfaces.size > 0 || teardown !== null) return;
        // Deferred so an in-app move between surfaces (lobby into a debate) keeps the hold.
        teardown = setTimeout(() => {
          teardown = null;
          if (surfaces.size === 0) close();
        }, 0);
      };
    },
    claim: function claim({ automatic = false, kind }): Promise<boolean> {
      const active = ensureCoordinator();
      // Without Web Locks and BroadcastChannel no tab can ask another to stop, so voice is never
      // withheld; LiveKit's one-identity rule still covers the same room in two tabs.
      if (active.coordinationMode !== 'lock-and-broadcast' || active.ownsConnection()) {
        setState(OWNED);
        return Promise.resolve(true);
      }
      if (inflight) {
        // An explicit claim behind a refused automatic one still gets asked as explicit.
        if (automatic || !inflight.automatic) return inflight.owned;
        return inflight.owned.then(owned => owned || claim({ automatic: false, kind }));
      }
      const attempt = active
        .requestTakeover({ automatic, requesterLabel: kind })
        .then(owned => {
          if (coordinator !== active) return false;
          setState(owned ? OWNED : { ownership: 'elsewhere', heldBy: asSurfaceKind(active.lastRefusedBy()) });
          return owned;
        })
        .finally(() => {
          if (inflight?.owned === attempt) inflight = null;
        });
      inflight = { automatic, owned: attempt };
      return attempt;
    },
    claimUntilHeld: async ({ kind, stop }) => {
      while (!stop()) {
        if (await owner.claim({ kind })) return true;
        if (stop()) return false;
        await new Promise(resolve => setTimeout(resolve, CLAIM_RETRY_MS));
      }
      return false;
    },
    heldElsewhere: async () => {
      if (state.ownership === 'owned') return false;
      if (state.ownership === 'elsewhere') return true;
      const locks = lockManager();
      if (typeof BroadcastChannel === 'undefined' || typeof locks?.query !== 'function') return false;
      try {
        const { held = [] } = await locks.query();
        return held.some(lock => lock.name === lockName);
      } catch {
        return false;
      }
    },
    announceYieldable,
    getState: () => state,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return owner;
}

const tabOwners = new Map<string, TabVoiceOwner>();

/** This tab's voice owner for `userId`. */
export function tabVoiceOwner(userId: string): TabVoiceOwner {
  let owner = tabOwners.get(userId);
  if (!owner) {
    owner = createTabVoiceOwner({ userId });
    tabOwners.set(userId, owner);
  }
  return owner;
}

type UseVoiceOwnershipOptions = {
  userId: string | null | undefined;
  kind: VoiceSurfaceKind;
  /** Registered (and, with `claimOnActive`, claimed) only while true. */
  active: boolean;
  /** Claims voice as soon as the surface is active: a page the viewer opened. */
  claimOnActive?: boolean;
  /** Changing it claims again, e.g. a different lobby. */
  claimKey?: string;
  policy?: () => VoiceYieldPolicy;
  onYield?: () => void | Promise<void>;
};

export type VoiceOwnershipHandle = VoiceTabState & {
  /** An explicit claim: "Use voice here", or turning a device on. */
  takeOver: () => Promise<boolean>;
  /** Explicit claims until one holds voice or `stop()` says to give up. */
  claimUntilHeld: (stop: () => boolean) => Promise<boolean>;
  /** For a connection replaced outside the lock (another device): shown as elsewhere until taken back. */
  markElsewhere: () => void;
  heldElsewhere: () => Promise<boolean>;
  announceYieldable: () => void;
};

const yieldAlways = (): VoiceYieldPolicy => 'yield';

export function useVoiceOwnership({
  userId,
  kind,
  active,
  claimOnActive = false,
  claimKey,
  policy = yieldAlways,
  onYield,
}: UseVoiceOwnershipOptions): VoiceOwnershipHandle {
  const owner = userId ? tabVoiceOwner(userId) : null;
  const currentPolicy = React.useEffectEvent(() => policy());
  const yieldVoice = React.useEffectEvent(() => onYield?.());
  const [replaced, setReplaced] = React.useState(false);

  React.useEffect(() => {
    if (!owner || !active) return;
    const unregister = owner.register({
      kind,
      policy: currentPolicy,
      onYield: yieldVoice,
    });
    if (claimOnActive) void owner.claim({ kind, automatic: true });
    return unregister;
  }, [active, claimKey, claimOnActive, kind, owner]);

  const tabState = React.useSyncExternalStore(
    owner?.subscribe ?? noopSubscribe,
    owner?.getState ?? pendingState,
    pendingState
  );

  const takeOver = React.useCallback(async () => {
    // Signed out: there is no one's voice to coordinate.
    if (!owner) return true;
    const owned = await owner.claim({ kind });
    if (owned) setReplaced(false);
    return owned;
  }, [kind, owner]);
  const claimUntilHeld = React.useCallback(
    (stop: () => boolean) => (owner ? owner.claimUntilHeld({ kind, stop }) : Promise.resolve(true)),
    [kind, owner]
  );
  const markElsewhere = React.useCallback(() => setReplaced(true), []);
  const heldElsewhere = React.useCallback(() => owner?.heldElsewhere() ?? Promise.resolve(false), [owner]);
  const announceYieldable = React.useCallback(() => owner?.announceYieldable(), [owner]);

  const state: VoiceTabState = !active
    ? PENDING
    : replaced && tabState.ownership === 'owned'
      ? { ...tabState, ownership: 'elsewhere' }
      : tabState;
  return { ...state, takeOver, claimUntilHeld, markElsewhere, heldElsewhere, announceYieldable };
}

const noopSubscribe = () => () => {};
const pendingState = () => PENDING;
