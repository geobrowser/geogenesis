/** geo-chat's last answer about the signed-in account's session; written by `api.ts`, read by the recovery hook and copy. */

export type GeoChatProfileState = 'attached' | 'pending' | 'missing';

/** `profile` on the `/auth/session` and `/auth/session/refresh` responses. Absent on older geo-chat. */
export type GeoChatSessionProfile = {
  state: GeoChatProfileState;
  profile_space_id: string;
  person_id: string | null;
  display_name: string | null;
  avatar_cid: string | null;
  pending_since: string | null;
  retry_after_ms: number | null;
};

/**
 * Why the session exchange refused. `setting_up` resolves once the account is registered;
 * `unreachable` is geo-chat failing to reach its own upstreams. Both clear on their own.
 */
export type GeoChatRefusalReason = 'setting_up' | 'unreachable';

export type GeoChatAccountStatus =
  | { kind: 'unknown' }
  | { kind: 'refused'; reason: GeoChatRefusalReason; code: string | null }
  | {
      kind: 'accepted';
      profile: GeoChatProfileState;
      pendingSince: string | null;
      retryAfterMs: number | null;
    };

const UNKNOWN: GeoChatAccountStatus = { kind: 'unknown' };

const REFUSED_RETRY_BASE_MS = 2_000;
export const REFUSED_RETRY_MAX_MS = 30_000;

/** The wait before retrying a refused session exchange: 2 s doubling to 30 s. */
export function refusedRetryDelayMs(attempt: number) {
  return Math.min(REFUSED_RETRY_BASE_MS * 2 ** attempt, REFUSED_RETRY_MAX_MS);
}

let current: { accountKey: string | null; status: GeoChatAccountStatus } = { accountKey: null, status: UNKNOWN };
/** The signed-in account, kept by `useGeoChatAccountRecovery`; undefined until it mounts. */
let liveAccountKey: string | null | undefined;

export function setLiveGeoChatAccountKey(accountKey: string | null) {
  liveAccountKey = accountKey;
}

/** False once the viewer signed out or switched away from `accountKey`, for work that outlives its caller. */
export function isLiveGeoChatAccount(accountKey: string | null) {
  return liveAccountKey === undefined || liveAccountKey === accountKey;
}
const listeners = new Set<() => void>();

function sameStatus(a: GeoChatAccountStatus, b: GeoChatAccountStatus) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'refused' && b.kind === 'refused') return a.reason === b.reason && a.code === b.code;
  if (a.kind === 'accepted' && b.kind === 'accepted') {
    return a.profile === b.profile && a.pendingSince === b.pendingSince && a.retryAfterMs === b.retryAfterMs;
  }
  return true;
}

export function setGeoChatAccountStatus(accountKey: string | null, status: GeoChatAccountStatus) {
  if (current.accountKey === accountKey && sameStatus(current.status, status)) return;
  current = { accountKey, status };
  listeners.forEach(listener => listener());
}

/** The status for `accountKey`, or `unknown` when the last one recorded belongs to someone else. */
export function getGeoChatAccountStatus(accountKey: string | null): GeoChatAccountStatus {
  return accountKey !== null && current.accountKey === accountKey ? current.status : UNKNOWN;
}

export function subscribeGeoChatAccountStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A session response's profile as a status. No `profile` is an older geo-chat: attached. */
export function acceptedStatus(profile: GeoChatSessionProfile | null | undefined): GeoChatAccountStatus {
  if (!profile) return { kind: 'accepted', profile: 'attached', pendingSince: null, retryAfterMs: null };
  return {
    kind: 'accepted',
    profile: profile.state,
    pendingSince: profile.pending_since,
    retryAfterMs: profile.retry_after_ms,
  };
}

/** A 401 from the session exchange, by code. All but `no_embedded_wallet` clear by waiting; older geo-chat sends `invalid_privy_token` for an unregistered account. */
export function sessionRefusalReason(status: number, code: string | null): GeoChatRefusalReason | null {
  if (status !== 401) return null;
  if (code === 'no_embedded_wallet') return null;
  if (code === 'auth_upstream_failed') return 'unreachable';
  return 'setting_up';
}

export function resetGeoChatAccountStatusForTests() {
  current = { accountKey: null, status: UNKNOWN };
  liveAccountKey = undefined;
  listeners.clear();
}
