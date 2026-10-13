'use client';

/**
 * One listening guest tab per browser: a Web Lock held by the tab that plays. Other tabs wait on a
 * press, never queue on the lock, so a reload of the listening tab takes it back first.
 */
const LOCK_NAME = 'geo.debates.lobby-guest-listening';

type LockManagerLike = Pick<LockManager, 'request' | 'query'>;

function lockManager(): LockManagerLike | null {
  try {
    return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
  } catch {
    return null;
  }
}

let held = false;
let releaseHeld: (() => void) | null = null;
let pending: Promise<boolean> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
/** Numbers each request, so only the one holding the lock reports its loss. */
let requestSeq = 0;
let holderSeq = 0;
const lostListeners = new Set<() => void>();

function cancelRelease() {
  if (releaseTimer === null) return;
  clearTimeout(releaseTimer);
  releaseTimer = null;
}

function request(manager: LockManagerLike, options: LockOptions): Promise<boolean> {
  const seq = ++requestSeq;
  return new Promise<boolean>(resolve => {
    manager
      .request(LOCK_NAME, options, lock => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        held = true;
        holderSeq = seq;
        resolve(true);
        return new Promise<void>(done => {
          releaseHeld = done;
        });
      })
      .then(
        () => undefined,
        () => {
          // Another tab stole the lock from this request.
          resolve(false);
          if (holderSeq !== seq) return;
          held = false;
          releaseHeld = null;
          lostListeners.forEach(listener => listener());
        }
      );
  });
}

/**
 * Takes the lock if no tab holds it. `steal` takes it from the tab that does, for a visitor's
 * press. Resolves whether this tab holds it.
 */
export function acquireGuestTabLock({ steal = false }: { steal?: boolean } = {}): Promise<boolean> {
  cancelRelease();
  const manager = lockManager();
  if (!manager || held) return Promise.resolve(true);
  if (pending && !steal) return pending;
  const attempt = request(manager, steal ? { steal: true } : { ifAvailable: true }).finally(() => {
    if (pending === attempt) pending = null;
  });
  pending = attempt;
  return attempt;
}

function release() {
  releaseTimer = null;
  if (!held) return;
  held = false;
  holderSeq = 0;
  releaseHeld?.();
  releaseHeld = null;
}

/**
 * Deferred a tick, so a remount (StrictMode, or the next lobby page) keeps it. `now` for pagehide,
 * where a frozen page would never run the tick.
 */
export function releaseGuestTabLock({ now = false }: { now?: boolean } = {}) {
  cancelRelease();
  if (now) release();
  else releaseTimer = setTimeout(release, 0);
}

/** Called when another tab takes the lock from this one. */
export function onGuestTabLockLost(listener: () => void) {
  lostListeners.add(listener);
  return () => {
    lostListeners.delete(listener);
  };
}

/** Whether another tab in this browser listens now; null when it cannot be known. */
export async function isGuestListeningElsewhere(): Promise<boolean | null> {
  const manager = lockManager();
  if (!manager) return null;
  if (held) return false;
  try {
    const snapshot = await manager.query();
    return (snapshot.held ?? []).some(lock => lock.name === LOCK_NAME);
  } catch {
    return null;
  }
}
