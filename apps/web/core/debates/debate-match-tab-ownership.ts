export const debateMatchTabOwnershipTtlMs = 60 * 60 * 1_000;

const recordVersion = 1 as const;
const storageKeyPrefix = 'geo:debate-match-owner:';

export type DebateMatchTabOwnershipRecord = {
  version: typeof recordVersion;
  state: 'pending' | 'confirmed';
  userId: string;
  matchId: string;
  claimId: string;
  spaceId: string;
  instanceId: string;
  createdAt: number;
  acceptedAt: number | null;
};

type OwnershipMessage = {
  type: 'accept-confirmed';
  matchId: string;
  instanceId: string;
};

type CreateDebateMatchTabOwnershipCoordinatorOptions = {
  matchId: string;
  claimId: string;
  spaceId: string;
  userId: string;
  onAcceptedElsewhere: (matchId: string) => void;
  storage?: Storage | null;
  now?: () => number;
  isReloadNavigation?: () => boolean;
};

export type DebateMatchTabOwnershipCoordinator = {
  readonly instanceId: string;
  acquire: () => Promise<boolean>;
  beginAcceptance: () => DebateMatchTabOwnershipRecord | null;
  confirmAcceptance: () => DebateMatchTabOwnershipRecord | null;
  recover: () => Promise<boolean>;
  release: (options?: { clearRecord?: boolean }) => Promise<void>;
  close: () => void;
  ownsFlow: () => boolean;
};

export function createDebateMatchTabOwnershipCoordinator({
  matchId,
  claimId,
  spaceId,
  userId,
  onAcceptedElsewhere,
  storage = defaultSessionStorage(),
  now = Date.now,
  isReloadNavigation = defaultIsReloadNavigation,
}: CreateDebateMatchTabOwnershipCoordinatorOptions): DebateMatchTabOwnershipCoordinator {
  const instanceId = createInstanceId();
  const coordinationName = `geo:debate-match:${matchId}:${userId}`;
  const browserLockManager =
    typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  const lockManager = typeof browserLockManager?.request === 'function' ? browserLockManager : null;
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(coordinationName);
    } catch {
      channel = null;
    }
  }

  let ownsFlow = false;
  let closed = false;
  let releaseLock: (() => void) | null = null;
  let lockRequest: Promise<void> | null = null;
  let releaseRequest: Promise<void> | null = null;
  let acquisition: Promise<boolean> | null = null;

  const recordBelongsToInstance = () => {
    const record = readDebateMatchTabOwnership(userId, { storage, now });
    return record?.matchId === matchId && record.instanceId === instanceId;
  };

  const clearRecord = () => {
    if (!recordBelongsToInstance()) return;
    removeRecord(userId, storage);
  };

  const acquire = (): Promise<boolean> => {
    if (releaseRequest) return releaseRequest.then(acquire);
    if (ownsFlow) return Promise.resolve(true);
    if (closed) return Promise.resolve(false);
    if (!lockManager) {
      ownsFlow = true;
      return Promise.resolve(true);
    }
    if (acquisition) return acquisition;

    acquisition = new Promise<boolean>(resolve => {
      const request = lockManager.request(coordinationName, { ifAvailable: true, mode: 'exclusive' }, async lock => {
        const acquired = Boolean(lock) && !closed;
        resolve(acquired);
        if (!acquired) return;
        ownsFlow = true;
        await new Promise<void>(release => {
          releaseLock = release;
        });
        releaseLock = null;
        ownsFlow = false;
      });
      lockRequest = request.then(
        () => undefined,
        () => resolve(false)
      );
    })
      .catch(() => false)
      .finally(() => {
        acquisition = null;
      });

    return acquisition;
  };

  const release = async ({ clearRecord: shouldClearRecord = false }: { clearRecord?: boolean } = {}) => {
    if (shouldClearRecord) clearRecord();
    if (releaseRequest) {
      await releaseRequest;
      return;
    }
    if (!lockManager) {
      ownsFlow = false;
      return;
    }
    if (!releaseLock) return;
    const activeRequest = lockRequest;
    const releaseCurrentLock = releaseLock;
    ownsFlow = false;
    releaseCurrentLock();
    const completion = (activeRequest ?? Promise.resolve()).finally(() => {
      if (releaseRequest === completion) releaseRequest = null;
    });
    releaseRequest = completion;
    await completion;
  };

  if (channel) {
    channel.onmessage = event => {
      const message = event.data as OwnershipMessage;
      if (
        !message ||
        typeof message !== 'object' ||
        message.type !== 'accept-confirmed' ||
        message.matchId !== matchId ||
        message.instanceId === instanceId
      ) {
        return;
      }
      const record = readDebateMatchTabOwnership(userId, { storage, now });
      if (
        !lockManager &&
        ownsFlow &&
        record?.matchId === matchId &&
        record.instanceId === instanceId &&
        record.state === 'confirmed' &&
        instanceId.localeCompare(message.instanceId) < 0
      ) {
        return;
      }
      void release({ clearRecord: true });
      onAcceptedElsewhere(matchId);
    };
  }

  const writeState = (state: DebateMatchTabOwnershipRecord['state']) => {
    if (!ownsFlow || closed) return null;
    const existing = readDebateMatchTabOwnership(userId, { storage, now });
    const timestamp = now();
    const record: DebateMatchTabOwnershipRecord = {
      version: recordVersion,
      state,
      userId,
      matchId,
      claimId,
      spaceId,
      instanceId,
      createdAt: existing?.matchId === matchId ? existing.createdAt : timestamp,
      acceptedAt: state === 'confirmed' ? timestamp : null,
    };
    writeRecord(record, storage);
    return record;
  };

  return {
    instanceId,
    acquire,
    beginAcceptance: () => writeState('pending'),
    confirmAcceptance: () => {
      const existing = readDebateMatchTabOwnership(userId, { storage, now });
      if (existing?.matchId === matchId && existing.instanceId === instanceId && existing.state === 'confirmed') {
        return existing;
      }
      const record = writeState('confirmed');
      if (record && channel) {
        try {
          channel.postMessage({ type: 'accept-confirmed', matchId, instanceId } satisfies OwnershipMessage);
        } catch {
          // Shared activity still dismisses secondary tabs if the channel closes or rejects the message.
        }
      }
      return record;
    },
    recover: async () => {
      const record = readDebateMatchTabOwnership(userId, { storage, now });
      if (!record || record.matchId !== matchId || record.claimId !== claimId || record.spaceId !== spaceId) {
        return false;
      }
      if (!isReloadNavigation()) {
        removeRecord(userId, storage);
        return false;
      }
      if (!(await acquire())) {
        removeRecord(userId, storage);
        return false;
      }
      writeRecord({ ...record, instanceId }, storage);
      return true;
    },
    release,
    close: () => {
      closed = true;
      void release();
      channel?.close();
    },
    ownsFlow: () => ownsFlow,
  };
}

export function readDebateMatchTabOwnership(
  userId: string,
  { storage = defaultSessionStorage(), now = Date.now }: { storage?: Storage | null; now?: () => number } = {}
): DebateMatchTabOwnershipRecord | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(storageKey(userId));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const record = JSON.parse(raw) as Partial<DebateMatchTabOwnershipRecord>;
    if (!isValidRecord(record) || now() - recordTimestamp(record) > debateMatchTabOwnershipTtlMs) {
      removeRecord(userId, storage);
      return null;
    }
    return record;
  } catch {
    removeRecord(userId, storage);
    return null;
  }
}

export function clearDebateMatchTabOwnership(userId: string, storage: Storage | null = defaultSessionStorage()) {
  removeRecord(userId, storage);
}

export function debateMatchOwnershipMatchesDebate(
  record: Pick<DebateMatchTabOwnershipRecord, 'userId' | 'claimId' | 'spaceId'>,
  debate: { claim: { id: string; space_id: string }; participants: { user_id: string }[] },
  userId: string
) {
  return (
    record.userId === userId &&
    record.claimId === debate.claim.id &&
    record.spaceId === debate.claim.space_id &&
    debate.participants.some(participant => participant.user_id === userId)
  );
}

function isValidRecord(record: Partial<DebateMatchTabOwnershipRecord>): record is DebateMatchTabOwnershipRecord {
  return (
    record.version === recordVersion &&
    (record.state === 'pending' || record.state === 'confirmed') &&
    typeof record.userId === 'string' &&
    typeof record.matchId === 'string' &&
    typeof record.claimId === 'string' &&
    typeof record.spaceId === 'string' &&
    typeof record.instanceId === 'string' &&
    typeof record.createdAt === 'number' &&
    (record.state === 'pending' ? record.acceptedAt === null : typeof record.acceptedAt === 'number')
  );
}

function recordTimestamp(record: DebateMatchTabOwnershipRecord) {
  return record.state === 'confirmed' ? (record.acceptedAt ?? record.createdAt) : record.createdAt;
}

function writeRecord(record: DebateMatchTabOwnershipRecord, storage: Storage | null) {
  if (!storage) return;
  try {
    storage.setItem(storageKey(record.userId), JSON.stringify(record));
  } catch {
    // Storage is a recovery aid. Ownership still remains protected by the live Web Lock.
  }
}

function removeRecord(userId: string, storage: Storage | null) {
  if (!storage) return;
  try {
    storage.removeItem(storageKey(userId));
  } catch {
    // Ignore unavailable or privacy-restricted storage.
  }
}

function storageKey(userId: string) {
  return `${storageKeyPrefix}${userId}`;
}

function defaultSessionStorage() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

function defaultIsReloadNavigation() {
  if (typeof performance === 'undefined') return false;
  const navigation = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return navigation?.type === 'reload';
}

function createInstanceId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
