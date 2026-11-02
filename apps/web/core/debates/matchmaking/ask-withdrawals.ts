/**
 * Requests and challenges the viewer took back themselves (GEO-3463). Taking one back is not "nobody
 * took it", so the panel's ended state skips them.
 *
 * Recorded by the withdraw and reject mutations themselves rather than by the strip's Cancel, because
 * an ask can be taken back from anywhere — full screen's sent-request card, a lobby — and every one of
 * those has to count. A module of its own, with no imports, so the hooks that write it and the hook
 * that reads it can both depend on it without depending on each other.
 */
const withdrawnAt = new Map<string, number>();

/**
 * Other tabs on this device hear each mark too: the ask is the account's, so a Cancel in one tab
 * otherwise read as "Nobody took it" in the next. geo-chat's requests and activity carry only live
 * asks, and the history that says `cancelled` is not on geo-chat main yet, so there is no server
 * answer to read instead; another device still sees the plain ending.
 */
export const ASK_WITHDRAWALS_CHANNEL = 'geo-debate-ask-withdrawals';

type WithdrawalMessage = { type: 'mark' | 'unmark'; id: string };

const channel = openChannel();

function openChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  try {
    const opened = new BroadcastChannel(ASK_WITHDRAWALS_CHANNEL);
    // Node's own (jsdom tests) would keep the process alive; browsers have no such method.
    (opened as { unref?: () => void }).unref?.();
    opened.addEventListener('message', (event: MessageEvent<unknown>) => {
      const message = event.data as Partial<WithdrawalMessage> | null;
      if (!message || typeof message.id !== 'string') return;
      if (message.type === 'mark') withdrawnAt.set(message.id, Date.now());
      else if (message.type === 'unmark') withdrawnAt.delete(message.id);
    });
    return opened;
  } catch {
    return null;
  }
}

function tellOtherTabs(message: WithdrawalMessage) {
  try {
    channel?.postMessage(message);
  } catch {
    // A closed channel only costs the other tabs the mark.
  }
}

/**
 * How long a mark is believed. Long enough to outlast the refetch that drops the ask, short enough
 * that the map never grows: an ask lives for minutes, and nothing asks about one after it has gone.
 */
export const ASK_WITHDRAWN_TTL_MS = 2 * 60_000;

/** Marked when the press goes out, not when it lands: a poll can drop the ask before the response. */
export function markAskWithdrawn(id: string) {
  withdrawnAt.set(id, Date.now());
  tellOtherTabs({ type: 'mark', id });
}

/** The withdraw failed, so the ask is still out and may yet end unanswered. */
export function unmarkAskWithdrawn(id: string) {
  withdrawnAt.delete(id);
  tellOtherTabs({ type: 'unmark', id });
}

/**
 * Whether `id` was taken back by the viewer. Read without forgetting: the panel and full screen each
 * mount a `HubAskProvider`, and the first to ask must not leave the second reading "nobody took it".
 */
export function askWasWithdrawn(id: string) {
  const now = Date.now();
  for (const [key, at] of withdrawnAt) {
    if (now - at > ASK_WITHDRAWN_TTL_MS) withdrawnAt.delete(key);
  }
  return withdrawnAt.has(id);
}
