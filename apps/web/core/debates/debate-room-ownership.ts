type TakeoverRequest = {
  type: 'takeover-request';
  requestId: string;
  requesterId: string;
  // Optional on the wire: tabs running a build that predates the field omit it, and the owner
  // assumes a focused requester so an old tab is never permanently unbeatable mid-deploy.
  requesterPriority?: DebateRoomTabPriority;
};

type TakeoverResponse = {
  type: 'takeover-response';
  requestId: string;
  requesterId: string;
  released: boolean;
};

type OwnershipMessage = TakeoverRequest | TakeoverResponse;

export type DebateRoomTakeoverContext = {
  requesterPriority: DebateRoomTabPriority;
  ownerPriority: DebateRoomTabPriority;
};

type CreateDebateRoomOwnershipCoordinatorOptions = {
  debateId: string;
  userId: string;
  onTakeoverRequested: (context: DebateRoomTakeoverContext) => boolean | Promise<boolean>;
  // Test seam; production uses debateRoomTabPriority.
  getTabPriority?: () => DebateRoomTabPriority;
};

export type DebateRoomOwnershipCoordinator = {
  readonly instanceId: string;
  readonly coordinationMode: DebateRoomOwnershipCoordinationMode;
  acquire: () => Promise<DebateRoomOwnershipAcquireResult>;
  requestTakeover: () => Promise<boolean>;
  release: () => Promise<void>;
  close: () => void;
  ownsConnection: () => boolean;
};

export type DebateRoomOwnershipAcquireResult = {
  acquired: boolean;
  waitedForLocalRelease: boolean;
};

export type DebateRoomOwnershipCoordinationMode = 'lock-and-broadcast' | 'lock-only' | 'livekit-fallback';

// 0 = hidden, 1 = visible but unfocused, 2 = focused. Biases the ownership race toward the tab
// the user is looking at: without it, whichever tab's connect() ran microseconds earlier owns the
// debate — and after a rematch the background tab structurally wins, because the foreground tab
// is still persisting its recording when the navigation fan-out lands.
export type DebateRoomTabPriority = 0 | 1 | 2;

export function debateRoomTabPriority(): DebateRoomTabPriority {
  // Without a document we cannot tell, so claim focus rather than add an artificial delay.
  if (typeof document === 'undefined') return 2;
  if (document.visibilityState !== 'visible') return 0;
  return typeof document.hasFocus === 'function' && !document.hasFocus() ? 1 : 2;
}

// A hidden tab waits long enough for a focused tab to reach its own lock request first, but far
// less than the ~10s connecting window, so a genuinely solo hidden tab still connects comfortably.
const acquisitionStaggerMs: Record<DebateRoomTabPriority, number> = { 0: 700, 1: 250, 2: 0 };

const takeoverResponseTimeoutMs = 1_500;
const localReleaseBarriers = new Map<string, Promise<void>>();

export function createDebateRoomOwnershipCoordinator({
  debateId,
  userId,
  onTakeoverRequested,
  getTabPriority = debateRoomTabPriority,
}: CreateDebateRoomOwnershipCoordinatorOptions): DebateRoomOwnershipCoordinator {
  const instanceId = createInstanceId();
  const coordinationName = `geo:debate-room:${debateId}:${userId}`;
  const lockManager =
    typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function' ? navigator.locks : null;
  let channel: BroadcastChannel | null = null;
  if (lockManager && typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(coordinationName);
    } catch {
      channel = null;
    }
  }
  let coordinationMode: DebateRoomOwnershipCoordinationMode = lockManager
    ? channel
      ? 'lock-and-broadcast'
      : 'lock-only'
    : 'livekit-fallback';
  let lockRequestsAvailable = lockManager !== null;
  let ownsConnection = false;
  let closed = false;
  let releaseLock: (() => void) | null = null;
  let lockRequest: Promise<void> | null = null;
  let releaseRequest: Promise<void> | null = null;
  let acquisition: Promise<DebateRoomOwnershipAcquireResult> | null = null;
  let activeAcquisitionAttempt: { cancelled: boolean } | null = null;
  const pendingTakeovers = new Map<string, (released: boolean) => void>();

  const fallBackToLiveKitIdentity = () => {
    lockRequestsAvailable = false;
    coordinationMode = 'livekit-fallback';
    channel?.close();
    channel = null;
  };

  const postTakeoverResponse = (message: TakeoverRequest, released: boolean) => {
    if (!channel || closed) return;
    try {
      channel.postMessage({
        type: 'takeover-response',
        requestId: message.requestId,
        requesterId: message.requesterId,
        released,
      } satisfies TakeoverResponse);
    } catch {
      // The channel may close while an async takeover decision is finishing. The requester will
      // time out and retain its current non-owner state.
    }
  };

  // Holds off the lock request in proportion to how far the tab is from the user's attention, so
  // the focused tab reaches navigator.locks first even when a background tab's connect() started
  // earlier. Resolves early if the tab gains focus mid-wait.
  const awaitAcquisitionStagger = async (delay: number, cancelled: () => boolean) => {
    await new Promise<void>(resolve => {
      let settled = false;
      let timer: number | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer !== null) window.clearTimeout(timer);
        window.removeEventListener('focus', onPriorityChange);
        document.removeEventListener('visibilitychange', onPriorityChange);
        resolve();
      };
      const onPriorityChange = () => {
        if (getTabPriority() === 2 || cancelled()) finish();
      };
      timer = window.setTimeout(finish, delay);
      window.addEventListener('focus', onPriorityChange);
      document.addEventListener('visibilitychange', onPriorityChange);
    });
  };

  const acquireLock = (skipStagger = false): Promise<DebateRoomOwnershipAcquireResult> => {
    if (ownsConnection) return Promise.resolve({ acquired: true, waitedForLocalRelease: false });
    if (closed) return Promise.resolve({ acquired: false, waitedForLocalRelease: false });
    if (!lockManager || !lockRequestsAvailable) {
      // No stagger here: with LiveKit DUPLICATE_IDENTITY as the arbiter the LAST connect wins, so
      // delaying a hidden tab would hand it the room instead of the focused one. The focused tab
      // recovers through the auto-takeover-on-focus path instead.
      ownsConnection = true;
      return Promise.resolve({ acquired: true, waitedForLocalRelease: false });
    }
    if (acquisition) return acquisition;

    const attempt = { cancelled: false };
    activeAcquisitionAttempt = attempt;
    let waitedForLocalRelease = false;
    const currentAcquisition = (async () => {
      if (localReleaseBarriers.has(coordinationName)) {
        waitedForLocalRelease = await waitForLocalReleaseBarriers(coordinationName, () => closed || attempt.cancelled);
      }
      if (closed || attempt.cancelled) return { acquired: false, waitedForLocalRelease };
      if (ownsConnection) return { acquired: true, waitedForLocalRelease };
      // Takeovers skip the stagger: they are an explicit user action, already focus-driven. A
      // zero delay must not even await — callers rely on an unstaggered acquire registering its
      // lock request synchronously (the close/release drain machinery depends on it).
      const staggerDelay = skipStagger ? 0 : acquisitionStaggerMs[getTabPriority()];
      if (staggerDelay > 0 && typeof window !== 'undefined') {
        await awaitAcquisitionStagger(staggerDelay, () => closed || attempt.cancelled);
        if (closed || attempt.cancelled) return { acquired: false, waitedForLocalRelease };
        if (ownsConnection) return { acquired: true, waitedForLocalRelease };
      }

      const lockResult = await new Promise<'acquired' | 'blocked' | 'unavailable'>(resolve => {
        let request: Promise<void>;
        try {
          request = lockManager.request(coordinationName, { ifAvailable: true, mode: 'exclusive' }, async lock => {
            const acquiredLock = Boolean(lock) && !closed && !attempt.cancelled;
            resolve(acquiredLock ? 'acquired' : 'blocked');
            if (!acquiredLock) return;
            ownsConnection = true;
            await new Promise<void>(release => {
              releaseLock = release;
            });
            releaseLock = null;
            ownsConnection = false;
          });
        } catch {
          resolve('unavailable');
          return;
        }
        const activeRequest = request.then(
          () => undefined,
          () => resolve('unavailable')
        );
        lockRequest = activeRequest;
        void activeRequest.finally(() => {
          if (lockRequest === activeRequest) lockRequest = null;
        });
      });

      if (lockResult === 'unavailable') {
        if (closed || attempt.cancelled) return { acquired: false, waitedForLocalRelease };
        fallBackToLiveKitIdentity();
        ownsConnection = true;
        return { acquired: true, waitedForLocalRelease };
      }

      return { acquired: lockResult === 'acquired', waitedForLocalRelease };
    })()
      .catch(() => ({ acquired: false, waitedForLocalRelease }))
      .finally(() => {
        if (acquisition === currentAcquisition) acquisition = null;
        if (activeAcquisitionAttempt === attempt) activeAcquisitionAttempt = null;
      });

    acquisition = currentAcquisition;
    return currentAcquisition;
  };

  const release = async () => {
    if (releaseRequest) {
      await releaseRequest;
      return;
    }
    if (!lockManager || !lockRequestsAvailable) {
      ownsConnection = false;
      return;
    }
    const activeRequest = lockRequest ?? acquisition?.then(() => undefined);
    if (!activeRequest) return;
    if (activeAcquisitionAttempt) activeAcquisitionAttempt.cancelled = true;
    ownsConnection = false;
    releaseLock?.();
    const barrier = registerLocalReleaseBarrier(coordinationName, activeRequest);
    releaseRequest = barrier;
    void barrier.finally(() => {
      if (releaseRequest === barrier) releaseRequest = null;
    });
    await barrier;
  };

  if (channel) {
    channel.onmessage = event => {
      const message = event.data as OwnershipMessage;
      if (!message || typeof message !== 'object') return;

      if (message.type === 'takeover-response' && message.requesterId === instanceId) {
        pendingTakeovers.get(message.requestId)?.(message.released);
        return;
      }

      if (message.type !== 'takeover-request' || message.requesterId === instanceId || !ownsConnection) return;
      const takeoverContext: DebateRoomTakeoverContext = {
        requesterPriority: message.requesterPriority ?? 2,
        ownerPriority: getTabPriority(),
      };
      void Promise.resolve(onTakeoverRequested(takeoverContext))
        .then(async released => {
          if (released) await release();
          postTakeoverResponse(message, released);
        })
        .catch(() => {
          postTakeoverResponse(message, false);
        });
    };
  }

  return {
    instanceId,
    get coordinationMode() {
      return coordinationMode;
    },
    acquire: () => acquireLock(),
    requestTakeover: async () => {
      if (ownsConnection) return true;
      if (!lockManager || !lockRequestsAvailable) return (await acquireLock(true)).acquired;
      if (closed) return false;
      if ((await acquireLock(true)).acquired) return true;
      if (!channel) return false;
      const takeoverChannel = channel;

      const requestId = createInstanceId();
      const released = await new Promise<boolean>(resolve => {
        const timeout = window.setTimeout(() => {
          pendingTakeovers.delete(requestId);
          resolve(false);
        }, takeoverResponseTimeoutMs);
        pendingTakeovers.set(requestId, result => {
          window.clearTimeout(timeout);
          pendingTakeovers.delete(requestId);
          resolve(result);
        });
        try {
          takeoverChannel.postMessage({
            type: 'takeover-request',
            requestId,
            requesterId: instanceId,
            requesterPriority: getTabPriority(),
          } satisfies TakeoverRequest);
        } catch {
          window.clearTimeout(timeout);
          pendingTakeovers.delete(requestId);
          resolve(false);
        }
      });
      if (!released) return false;
      return (await acquireLock(true)).acquired;
    },
    release,
    close: () => {
      closed = true;
      void release();
      for (const resolve of pendingTakeovers.values()) resolve(false);
      pendingTakeovers.clear();
      channel?.close();
    },
    ownsConnection: () => ownsConnection,
  };
}

function registerLocalReleaseBarrier(coordinationName: string, activeRequest: Promise<void>) {
  const barrier = activeRequest
    .catch(() => undefined)
    .finally(() => {
      if (localReleaseBarriers.get(coordinationName) === barrier) localReleaseBarriers.delete(coordinationName);
    });
  localReleaseBarriers.set(coordinationName, barrier);
  return barrier;
}

async function waitForLocalReleaseBarriers(coordinationName: string, cancelled: () => boolean) {
  let waited = false;
  let barrier = localReleaseBarriers.get(coordinationName);
  while (barrier && !cancelled()) {
    waited = true;
    await barrier;
    barrier = localReleaseBarriers.get(coordinationName);
  }
  return waited;
}

function createInstanceId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
