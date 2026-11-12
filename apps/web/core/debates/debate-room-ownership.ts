type TakeoverRequest = {
  type: 'takeover-request';
  requestId: string;
  requesterId: string;
  // Optional on the wire: tabs running a build that predates the field omit it, and the owner
  // assumes a focused requester so an old tab is never permanently unbeatable mid-deploy.
  requesterPriority?: DebateRoomTabPriority;
  // GEO-3149. True when the requester is a blocked tab reclaiming the room on its own because the
  // viewer turned to it, rather than the viewer pressing "Continue here". Absent on older builds,
  // which only ever sent explicit or focus-driven requests, so absent reads as explicit.
  automatic?: boolean;
  /** What the requester is, e.g. the voice surface asking. */
  requesterLabel?: string;
};

type TakeoverResponse = {
  type: 'takeover-response';
  requestId: string;
  requesterId: string;
  released: boolean;
  /** What the owner is: the one that refused, or the one that released. */
  ownerLabel?: string;
};

type TakeoverAck = {
  type: 'takeover-ack';
  requestId: string;
  requesterId: string;
};

type OwnershipMessage = TakeoverRequest | TakeoverResponse | TakeoverAck;

export type DebateRoomTakeoverContext = {
  requesterPriority: DebateRoomTabPriority;
  ownerPriority: DebateRoomTabPriority;
  automatic: boolean;
  requesterLabel?: string;
};

export type DebateRoomTakeoverOptions = {
  /** The tab is reclaiming the room because the viewer turned to it, not because they asked. */
  automatic?: boolean;
  requesterLabel?: string;
  onTookOverFromOtherTab?: (from?: string) => void;
};

type CreateDebateRoomOwnershipCoordinatorOptions = {
  debateId: string;
  userId: string;
  onTakeoverRequested: (context: DebateRoomTakeoverContext) => boolean | Promise<boolean>;
  // Test seam; production uses debateRoomTabPriority.
  getTabPriority?: () => DebateRoomTabPriority;
  /** Sent with a refusal so the requester can say what holds it. */
  describeOwner?: () => string | undefined;
  /** Another tab stole the lock instead of asking for it (we were frozen); stop sending. */
  onOwnershipLost?: () => void;
  /** An explicit takeover steals from a holder that never answers. Voice only; the room lock never steals. */
  stealUnresponsive?: boolean;
};

export type DebateRoomOwnershipCoordinator = {
  readonly instanceId: string;
  readonly coordinationMode: DebateRoomOwnershipCoordinationMode;
  acquire: () => Promise<DebateRoomOwnershipAcquireResult>;
  requestTakeover: (options?: DebateRoomTakeoverOptions) => Promise<boolean>;
  waitForLock: (signal: AbortSignal) => Promise<boolean>;
  release: () => Promise<void>;
  close: () => void;
  ownsConnection: () => boolean;
  /** The refusing owner's label from the last takeover this coordinator asked for. */
  lastRefusedBy: () => string | undefined;
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
const takeoverAckedResponseTimeoutMs = 10_000;
const localReleaseBarriers = new Map<string, Promise<void>>();

export function debateRoomCoordinationName(debateId: string, userId: string) {
  return `geo:debate-room:${debateId}:${userId}`;
}

export function createDebateRoomOwnershipCoordinator({
  debateId,
  userId,
  onTakeoverRequested,
  getTabPriority = debateRoomTabPriority,
  describeOwner,
  onOwnershipLost,
  stealUnresponsive = false,
}: CreateDebateRoomOwnershipCoordinatorOptions): DebateRoomOwnershipCoordinator {
  const instanceId = createInstanceId();
  const coordinationName = debateRoomCoordinationName(debateId, userId);
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
  const pendingTakeovers = new Map<string, (released: boolean, ownerLabel?: string) => void>();
  const pendingAcks = new Map<string, () => void>();
  const queuedLockAborts = new Set<() => void>();
  let queuedGrant: Promise<boolean> | null = null;
  let lastRefusedBy: string | undefined;

  let takeoversInFlight = 0;
  let lostDuringTakeover = false;
  let releasedDuringTakeover = false;

  // Another tab stole our lock. Mid-handover, report it only if the handover did not release.
  const handleLockLost = () => {
    if (!ownsConnection) return;
    ownsConnection = false;
    releaseLock = null;
    if (takeoversInFlight > 0) {
      lostDuringTakeover = true;
      return;
    }
    onOwnershipLost?.();
  };

  const fallBackToLiveKitIdentity = () => {
    lockRequestsAvailable = false;
    coordinationMode = 'livekit-fallback';
    channel?.close();
    channel = null;
  };

  const postTakeoverResponse = (message: TakeoverRequest, released: boolean, ownerLabel: string | undefined) => {
    if (!channel || closed) return;
    try {
      channel.postMessage({
        type: 'takeover-response',
        requestId: message.requestId,
        requesterId: message.requesterId,
        released,
        ownerLabel,
      } satisfies TakeoverResponse);
    } catch {
      // The channel may close while an async takeover decision is finishing. The requester will
      // time out and retain its current non-owner state.
    }
  };

  // Resolves the in-flight acquisition stagger immediately: a takeover arriving mid-stagger and
  // release()/close() must not sit out the residual delay (nothing else re-checks cancellation
  // until the timer or a focus event fires).
  let finishActiveStagger: (() => void) | null = null;

  // Holds off the lock request in proportion to how far the tab is from the user's attention, so
  // the focused tab reaches navigator.locks first even when a background tab's connect() started
  // earlier. Resolves early if the tab gains focus mid-wait.
  const awaitAcquisitionStagger = (delay: number, cancelled: () => boolean) =>
    new Promise<void>(resolve => {
      let settled = false;
      let timer: number | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (finishActiveStagger === finish) finishActiveStagger = null;
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
      finishActiveStagger = finish;
    });

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
    if (acquisition) {
      // The dedup slot may hold a mid-stagger acquisition; a takeover must not inherit the
      // residual delay, so settle the stagger now and share the (correct) result.
      if (skipStagger) finishActiveStagger?.();
      return acquisition;
    }

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
          () => {
            handleLockLost();
            resolve('unavailable');
          }
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
    // A cancelled stagger would otherwise run out its timer, holding the local-release barrier —
    // and any same-tab successor waiting on it — for the residual delay.
    finishActiveStagger?.();
    ownsConnection = false;
    releaseLock?.();
    const barrier = registerLocalReleaseBarrier(coordinationName, activeRequest);
    releaseRequest = barrier;
    void barrier.finally(() => {
      if (releaseRequest === barrier) releaseRequest = null;
    });
    await barrier;
  };

  // Takes the lock from a frozen holder that never acked.
  const stealLock = () =>
    new Promise<boolean>(resolve => {
      if (!lockManager || closed) return resolve(false);
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      let request: Promise<void>;
      try {
        request = lockManager.request(coordinationName, { steal: true, mode: 'exclusive' }, async lock => {
          if (closed || !lock) return settle(false);
          ownsConnection = true;
          settle(true);
          await new Promise<void>(release => {
            releaseLock = release;
          });
          releaseLock = null;
          ownsConnection = false;
        });
      } catch {
        return settle(false);
      }
      const activeRequest = request.then(
        () => undefined,
        () => {
          handleLockLost();
          settle(false);
        }
      );
      lockRequest = activeRequest;
      void activeRequest.finally(() => {
        if (lockRequest === activeRequest) lockRequest = null;
      });
    });

  // Waits in the lock queue, so it gets the lock as soon as the holder lets go.
  const waitForLock = (signal: AbortSignal) => {
    const grant = queueForLock(signal);
    queuedGrant = grant;
    void grant.finally(() => {
      if (queuedGrant === grant) queuedGrant = null;
    });
    return grant;
  };

  const queueForLock = (signal: AbortSignal) =>
    new Promise<boolean>(resolve => {
      if (ownsConnection) return resolve(true);
      if (!lockManager || !lockRequestsAvailable || closed || signal.aborted) return resolve(false);
      const queue = new AbortController();
      const abort = () => queue.abort();
      const stopListening = () => {
        signal.removeEventListener('abort', abort);
        queuedLockAborts.delete(abort);
      };
      signal.addEventListener('abort', abort, { once: true });
      queuedLockAborts.add(abort);
      let granted = false;
      let activeRequest: Promise<void> | null = null;
      let request: Promise<void>;
      try {
        request = lockManager.request(coordinationName, { mode: 'exclusive', signal: queue.signal }, async lock => {
          stopListening();
          if (closed || signal.aborted || !lock) return resolve(false);
          granted = true;
          ownsConnection = true;
          if (activeRequest) lockRequest = activeRequest;
          resolve(true);
          await new Promise<void>(release => {
            releaseLock = release;
          });
          releaseLock = null;
          ownsConnection = false;
        });
      } catch {
        stopListening();
        return resolve(false);
      }
      const settled: Promise<void> = request.then(
        () => undefined,
        () => {
          stopListening();
          // Only a lock we held can be lost.
          if (granted) handleLockLost();
          resolve(false);
        }
      );
      activeRequest = settled;
      if (granted) lockRequest = settled;
      void settled.finally(() => {
        if (lockRequest === settled) lockRequest = null;
      });
    });

  if (channel) {
    channel.onmessage = event => {
      const message = event.data as OwnershipMessage;
      if (!message || typeof message !== 'object') return;

      if (message.type === 'takeover-ack') {
        if (message.requesterId === instanceId) pendingAcks.get(message.requestId)?.();
        return;
      }

      if (message.type === 'takeover-response' && message.requesterId === instanceId) {
        if (pendingTakeovers.has(message.requestId)) lastRefusedBy = message.released ? undefined : message.ownerLabel;
        pendingTakeovers.get(message.requestId)?.(message.released, message.ownerLabel);
        return;
      }

      if (message.type !== 'takeover-request' || message.requesterId === instanceId || !ownsConnection) return;
      const takeoverContext: DebateRoomTakeoverContext = {
        requesterPriority: message.requesterPriority ?? 2,
        ownerPriority: getTabPriority(),
        automatic: message.automatic === true,
        requesterLabel: message.requesterLabel,
      };
      try {
        channel?.postMessage({
          type: 'takeover-ack',
          requestId: message.requestId,
          requesterId: message.requesterId,
        } satisfies TakeoverAck);
      } catch {}
      // Read before the handover, while this tab is still what holds it.
      const ownerLabel = describeOwner?.();
      takeoversInFlight += 1;
      void Promise.resolve(onTakeoverRequested(takeoverContext))
        .then(async released => {
          if (released) await release();
          postTakeoverResponse(message, released, ownerLabel);
          return released;
        })
        .catch(() => {
          postTakeoverResponse(message, false, ownerLabel);
          return false;
        })
        .then(released => {
          if (released) releasedDuringTakeover = true;
          takeoversInFlight -= 1;
          if (takeoversInFlight > 0) return;
          const lost = lostDuringTakeover && !releasedDuringTakeover;
          lostDuringTakeover = false;
          releasedDuringTakeover = false;
          if (lost) onOwnershipLost?.();
        });
    };
  }

  return {
    instanceId,
    get coordinationMode() {
      return coordinationMode;
    },
    acquire: () => acquireLock(),
    requestTakeover: async ({
      automatic = false,
      requesterLabel,
      onTookOverFromOtherTab,
    }: DebateRoomTakeoverOptions = {}) => {
      lastRefusedBy = undefined;
      if (ownsConnection) return true;
      if (!lockManager || !lockRequestsAvailable) return (await acquireLock(true)).acquired;
      if (closed) return false;
      if ((await acquireLock(true)).acquired) return true;
      if (!channel) return false;
      const takeoverChannel = channel;

      const requestId = createInstanceId();
      let releasedBy: string | undefined;
      type TakeoverOutcome = 'released' | 'refused' | 'unanswered' | 'timeout';
      const outcome = await new Promise<TakeoverOutcome>(resolve => {
        const settle = (value: TakeoverOutcome) => {
          window.clearTimeout(timeout);
          pendingTakeovers.delete(requestId);
          pendingAcks.delete(requestId);
          resolve(value);
        };
        let timeout = window.setTimeout(() => settle('timeout'), takeoverResponseTimeoutMs);
        pendingAcks.set(requestId, () => {
          pendingAcks.delete(requestId);
          window.clearTimeout(timeout);
          timeout = window.setTimeout(() => settle('unanswered'), takeoverAckedResponseTimeoutMs);
        });
        pendingTakeovers.set(requestId, (released, ownerLabel) => {
          if (released) releasedBy = ownerLabel;
          settle(released ? 'released' : 'refused');
        });
        try {
          takeoverChannel.postMessage({
            type: 'takeover-request',
            requestId,
            requesterId: instanceId,
            requesterPriority: getTabPriority(),
            automatic,
            requesterLabel,
          } satisfies TakeoverRequest);
        } catch {
          settle('timeout');
        }
      });

      if (outcome === 'refused') return false;
      if (outcome === 'released') {
        let acquired = (await acquireLock(true)).acquired;
        const waiting = queuedGrant;
        if (!acquired && waiting) {
          acquired = await Promise.race([
            waiting,
            new Promise<boolean>(resolve => window.setTimeout(() => resolve(false), takeoverResponseTimeoutMs)),
          ]);
        }
        if (acquired) onTookOverFromOtherTab?.(releasedBy);
        return acquired;
      }
      // Never answered (frozen), or acked but never finished handing over: only an explicit claim,
      // and only where stealing is turned on, takes the lock anyway.
      if (automatic || !stealUnresponsive) return false;
      const stolen = await stealLock();
      if (stolen) onTookOverFromOtherTab?.();
      return stolen;
    },
    waitForLock,
    release,
    close: () => {
      closed = true;
      for (const abort of [...queuedLockAborts]) abort();
      void release();
      for (const resolve of pendingTakeovers.values()) resolve(false);
      pendingTakeovers.clear();
      pendingAcks.clear();
      channel?.close();
    },
    ownsConnection: () => ownsConnection,
    lastRefusedBy: () => lastRefusedBy,
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

export type DebateRoomReleaseDecisionInput = DebateRoomTakeoverContext & {
  status: string | null;
  /** The owner's MediaRecorder has started; releasing now would tear an in-flight recording down. */
  recordingStarted: boolean;
  /** `preflight` with nothing recorded and its window still open. */
  preflightStillPending: boolean;
};

/**
 * Whether the tab holding a debate room hands it to another tab of the same browser that asked.
 *
 * Nothing is recorded or timed during the intro (`ready`) or the connecting window, so any tab may
 * take the room then. Past that, a tab nearer the viewer's attention may still pull the room from
 * one further away (focused over visible over hidden) until recording starts, which is what keeps a
 * background tab from ever holding the room against the one the viewer is looking at (GEO-3149).
 *
 * An automatic request — a blocked tab reclaiming because the viewer turned to it — is honoured only
 * when the requester really is nearer the viewer than the owner. Without that, two windows side by
 * side (both visible, neither focused) would hand the room back and forth forever, each release
 * re-arming the other's reclaim.
 */
export function shouldReleaseDebateRoom({
  status,
  recordingStarted,
  preflightStillPending,
  requesterPriority,
  ownerPriority,
  automatic,
}: DebateRoomReleaseDecisionInput): boolean {
  const requesterNearer = requesterPriority > ownerPriority;
  if (automatic && !requesterNearer) return false;
  if (status === 'ready' || status === 'connecting') return true;
  if (status === 'preflight' && preflightStillPending) return true;
  return requesterNearer && !recordingStarted && (status === 'connecting' || status === 'preflight');
}
