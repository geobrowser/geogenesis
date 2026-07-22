type TakeoverRequest = {
  type: 'takeover-request';
  requestId: string;
  requesterId: string;
};

type TakeoverResponse = {
  type: 'takeover-response';
  requestId: string;
  requesterId: string;
  released: boolean;
};

type OwnershipMessage = TakeoverRequest | TakeoverResponse;

type CreateDebateRoomOwnershipCoordinatorOptions = {
  debateId: string;
  userId: string;
  onTakeoverRequested: () => boolean | Promise<boolean>;
};

export type DebateRoomOwnershipCoordinator = {
  readonly instanceId: string;
  acquire: () => Promise<boolean>;
  requestTakeover: () => Promise<boolean>;
  release: () => Promise<void>;
  close: () => void;
  ownsConnection: () => boolean;
};

const takeoverResponseTimeoutMs = 1_500;

export function createDebateRoomOwnershipCoordinator({
  debateId,
  userId,
  onTakeoverRequested,
}: CreateDebateRoomOwnershipCoordinatorOptions): DebateRoomOwnershipCoordinator {
  const instanceId = createInstanceId();
  const coordinationName = `geo:debate-room:${debateId}:${userId}`;
  const canCoordinate =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.locks?.request) &&
    typeof BroadcastChannel !== 'undefined';
  let channel: BroadcastChannel | null = null;
  if (canCoordinate) {
    try {
      channel = new BroadcastChannel(coordinationName);
    } catch {
      channel = null;
    }
  }
  const supportsCoordination = channel !== null;
  let ownsConnection = false;
  let closed = false;
  let releaseLock: (() => void) | null = null;
  let lockRequest: Promise<void> | null = null;
  let releaseRequest: Promise<void> | null = null;
  let acquisition: Promise<boolean> | null = null;
  const pendingTakeovers = new Map<string, (released: boolean) => void>();

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

  const acquireLock = (): Promise<boolean> => {
    if (releaseRequest) return releaseRequest.then(acquireLock);
    if (ownsConnection) return Promise.resolve(true);
    if (!supportsCoordination) {
      ownsConnection = true;
      return Promise.resolve(true);
    }
    if (closed) return Promise.resolve(false);
    if (acquisition) return acquisition;

    acquisition = new Promise<boolean>(resolve => {
      const request = navigator.locks.request(
        coordinationName,
        { ifAvailable: true, mode: 'exclusive' },
        async lock => {
          resolve(Boolean(lock));
          if (!lock || closed) return;
          ownsConnection = true;
          await new Promise<void>(release => {
            releaseLock = release;
          });
          releaseLock = null;
          ownsConnection = false;
        }
      );
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

  const release = async () => {
    if (releaseRequest) {
      await releaseRequest;
      return;
    }
    if (!supportsCoordination) {
      ownsConnection = false;
      return;
    }
    if (!releaseLock) return;
    const activeRequest = lockRequest;
    const releaseCurrentLock = releaseLock;
    ownsConnection = false;
    releaseCurrentLock();
    const request = activeRequest ?? Promise.resolve();
    const completion = request.finally(() => {
      if (releaseRequest === completion) releaseRequest = null;
    });
    releaseRequest = completion;
    await releaseRequest;
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
      void Promise.resolve(onTakeoverRequested())
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
    acquire: acquireLock,
    requestTakeover: async () => {
      if (ownsConnection) return true;
      if (!supportsCoordination) return acquireLock();
      if (!channel || closed) return false;
      if (await acquireLock()) return true;

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
          channel.postMessage({
            type: 'takeover-request',
            requestId,
            requesterId: instanceId,
          } satisfies TakeoverRequest);
        } catch {
          window.clearTimeout(timeout);
          pendingTakeovers.delete(requestId);
          resolve(false);
        }
      });
      if (!released) return false;
      return acquireLock();
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

function createInstanceId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
