import type { DebateLobbyGuestSession } from '../api';

/**
 * A visitor's guest session as one machine (GEO-3129). `attempt` numbers each start, so an answer
 * is matched to the start that asked and a StrictMode re-run never sends a second one.
 */
export type GuestSessionState =
  | { status: 'idle'; attempt: number }
  | { status: 'starting'; attempt: number }
  | { status: 'listening'; attempt: number; session: DebateLobbyGuestSession }
  /** The member join ended it server-side; the room plays until the member room is up. */
  | { status: 'handingOver'; attempt: number; session: DebateLobbyGuestSession }
  /** Done: handed over, or signed in and not becoming a member here. */
  | { status: 'released'; attempt: number }
  | { status: 'refused'; attempt: number; message: string; retryAt: number | null }
  | { status: 'removed'; attempt: number }
  | { status: 'ended'; attempt: number };

export type GuestSessionEvent =
  /** Start listening, or retry after a refusal. Never once signed in. */
  | { type: 'start' }
  | { type: 'started'; attempt: number; session: DebateLobbyGuestSession }
  | { type: 'refused'; attempt: number; message: string; retryAt: number | null }
  /** A host removed the guests: from the start's 403 or the heartbeat. */
  | { type: 'removed' }
  | { type: 'ended' }
  /** The lease lapsed, or the room needs a fresh token: start again on the same secret. */
  | { type: 'restart' }
  | { type: 'memberJoined' }
  /** The member room is up, or will not come up: drop the guest room. */
  | { type: 'roomDone' }
  /** Signed in, and the member path failed: stop being a guest. */
  | { type: 'abandon' };

export type GuestSessionCommand =
  { type: 'leave'; secret: string } | { type: 'storeSecret'; secret: string } | { type: 'clearSecret' };

export type GuestSessionContext = { signedIn: boolean };

type Transition = { next: GuestSessionState; commands: GuestSessionCommand[] };

const stay = (state: GuestSessionState): Transition => ({ next: state, commands: [] });
const starting = (state: GuestSessionState): Transition => ({
  next: { status: 'starting', attempt: state.attempt + 1 },
  commands: [],
});
const released = (state: GuestSessionState, commands: GuestSessionCommand[] = []): Transition => ({
  next: { status: 'released', attempt: state.attempt },
  commands,
});

/** Every transition, and what it must send or store. Anything not listed leaves the state alone. */
export function transition(
  state: GuestSessionState,
  event: GuestSessionEvent,
  { signedIn }: GuestSessionContext
): Transition {
  switch (event.type) {
    case 'start':
      if (signedIn) return stay(state);
      return state.status === 'idle' || state.status === 'refused' ? starting(state) : stay(state);

    case 'started':
      if (state.status !== 'starting' || state.attempt !== event.attempt) return stay(state);
      // Signed in while it was in flight: a signed-in person is never a guest.
      if (signedIn)
        return released(state, [{ type: 'leave', secret: event.session.guest_secret }, { type: 'clearSecret' }]);
      return {
        next: { status: 'listening', attempt: state.attempt, session: event.session },
        commands: [{ type: 'storeSecret', secret: event.session.guest_secret }],
      };

    case 'refused':
      if (state.status !== 'starting' || state.attempt !== event.attempt) return stay(state);
      if (signedIn) return released(state, [{ type: 'clearSecret' }]);
      return {
        next: { status: 'refused', attempt: state.attempt, message: event.message, retryAt: event.retryAt },
        commands: [],
      };

    case 'removed':
      // The secret is kept, so the page that holds it stays removed.
      return state.status === 'starting' || state.status === 'listening'
        ? { next: { status: 'removed', attempt: state.attempt }, commands: [] }
        : stay(state);

    case 'ended':
      return state.status === 'starting' || state.status === 'listening'
        ? { next: { status: 'ended', attempt: state.attempt }, commands: [{ type: 'clearSecret' }] }
        : stay(state);

    case 'restart':
      if (state.status !== 'listening') return stay(state);
      // Signed in, the session is over server-side and may not start again.
      return signedIn ? released(state, [{ type: 'clearSecret' }]) : starting(state);

    case 'memberJoined':
      // The join carried the secret and ended the session; no leave follows.
      if (state.status === 'listening') {
        return { next: { status: 'handingOver', attempt: state.attempt, session: state.session }, commands: [] };
      }
      if (state.status === 'idle' || state.status === 'starting' || state.status === 'refused') {
        return released(state, [{ type: 'clearSecret' }]);
      }
      return stay(state);

    case 'roomDone':
      return state.status === 'handingOver' ? released(state, [{ type: 'clearSecret' }]) : stay(state);

    case 'abandon':
      if (state.status === 'listening') {
        return released(state, [{ type: 'leave', secret: state.session.guest_secret }, { type: 'clearSecret' }]);
      }
      if (state.status === 'idle' || state.status === 'starting' || state.status === 'refused') {
        return released(state, [{ type: 'clearSecret' }]);
      }
      return stay(state);
  }
}

/**
 * What a start's answer does once its state has moved on (or its page went): leave it, unless it
 * is the session stored for this lobby, which a remounted page resumed on the same secret.
 */
export function orphanedAnswerLeaves(answerSecret: string, storedSecret: string | null) {
  return answerSecret !== storedSecret;
}
