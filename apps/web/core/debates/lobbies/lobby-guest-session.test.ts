import { describe, expect, it } from 'vitest';

import type { DebateLobbyGuestSession } from '../api';
import {
  type GuestSessionEvent,
  type GuestSessionState,
  orphanedAnswerLeaves,
  transition,
} from './lobby-guest-session';

const session = (secret = 's1'): DebateLobbyGuestSession => ({
  guest_id: 'g1',
  guest_secret: secret,
  lease_expires_at: 'x',
  heartbeat_interval_seconds: 20,
  voice: { token: 't', url: 'u', room_name: 'r', can_publish: false, start_muted: false, expires_at: 'x' },
});

const idle: GuestSessionState = { status: 'idle', attempt: 0 };
const starting: GuestSessionState = { status: 'starting', attempt: 1 };
const listening: GuestSessionState = { status: 'listening', attempt: 1, session: session() };
const handingOver: GuestSessionState = { status: 'handingOver', attempt: 1, session: session() };
const released: GuestSessionState = { status: 'released', attempt: 1 };
const refused: GuestSessionState = { status: 'refused', attempt: 1, message: 'full', retryAt: null };
const removed: GuestSessionState = { status: 'removed', attempt: 1 };
const ended: GuestSessionState = { status: 'ended', attempt: 1 };

const out = { signedIn: false };
const inn = { signedIn: true };

function run(state: GuestSessionState, event: GuestSessionEvent, signedIn = false) {
  return transition(state, event, { signedIn });
}

describe('guest session transitions', () => {
  it('starts from idle or after a refusal, numbering the attempt', () => {
    expect(run(idle, { type: 'start' })).toEqual({ next: { status: 'starting', attempt: 1 }, commands: [] });
    expect(run(refused, { type: 'start' }).next).toEqual({ status: 'starting', attempt: 2 });
    for (const state of [starting, listening, handingOver, released, removed, ended]) {
      expect(run(state, { type: 'start' }).next).toBe(state);
    }
  });

  it('never starts once signed in', () => {
    expect(transition(idle, { type: 'start' }, inn).next).toBe(idle);
    expect(transition(refused, { type: 'start' }, inn).next).toBe(refused);
  });

  it('adopts the answer for its own attempt and stores the secret', () => {
    expect(run(starting, { type: 'started', attempt: 1, session: session() })).toEqual({
      next: listening,
      commands: [{ type: 'storeSecret', secret: 's1' }],
    });
  });

  it('ignores an answer for another attempt or after the state moved on', () => {
    expect(run(starting, { type: 'started', attempt: 2, session: session() }).next).toBe(starting);
    expect(run(released, { type: 'started', attempt: 1, session: session() }).next).toBe(released);
  });

  it('leaves an answer that lands after sign-in', () => {
    expect(transition(starting, { type: 'started', attempt: 1, session: session('late') }, inn)).toEqual({
      next: released,
      commands: [{ type: 'leave', secret: 'late' }, { type: 'clearSecret' }],
    });
  });

  it('refuses for its own attempt; signed in, it releases', () => {
    expect(run(starting, { type: 'refused', attempt: 1, message: 'full', retryAt: 5 }).next).toEqual({
      status: 'refused',
      attempt: 1,
      message: 'full',
      retryAt: 5,
    });
    expect(transition(starting, { type: 'refused', attempt: 1, message: 'm', retryAt: null }, inn).next).toEqual(
      released
    );
  });

  it('a removal keeps the secret; an end forgets it', () => {
    expect(run(listening, { type: 'removed' })).toEqual({ next: removed, commands: [] });
    expect(run(starting, { type: 'removed' }).next).toEqual(removed);
    expect(run(listening, { type: 'ended' })).toEqual({ next: ended, commands: [{ type: 'clearSecret' }] });
    expect(run(handingOver, { type: 'removed' }).next).toBe(handingOver);
  });

  it('restarts a lapsed or dropped session on the same secret, but not once signed in', () => {
    expect(run(listening, { type: 'restart' })).toEqual({ next: { status: 'starting', attempt: 2 }, commands: [] });
    expect(transition(listening, { type: 'restart' }, inn)).toEqual({
      next: released,
      commands: [{ type: 'clearSecret' }],
    });
    expect(run(handingOver, { type: 'restart' }).next).toBe(handingOver);
  });

  it('hands over on the member join, with no leave: the join ended the session', () => {
    expect(transition(listening, { type: 'memberJoined' }, inn)).toEqual({ next: handingOver, commands: [] });
    expect(run(handingOver, { type: 'roomDone' })).toEqual({ next: released, commands: [{ type: 'clearSecret' }] });
  });

  it('with no guest room playing, the member join releases at once', () => {
    for (const state of [idle, starting, refused]) {
      expect(transition(state, { type: 'memberJoined' }, inn)).toEqual({
        next: { status: 'released', attempt: state.attempt },
        commands: [{ type: 'clearSecret' }],
      });
    }
  });

  it('abandons as a guest when the signed-in path failed', () => {
    expect(transition(listening, { type: 'abandon' }, inn)).toEqual({
      next: released,
      commands: [{ type: 'leave', secret: 's1' }, { type: 'clearSecret' }],
    });
    expect(transition(refused, { type: 'abandon' }, inn).commands).toEqual([{ type: 'clearSecret' }]);
    // A removed guest stays removed.
    expect(transition(removed, { type: 'abandon' }, inn).next).toBe(removed);
  });

  it('a released session stays released', () => {
    const events: GuestSessionEvent[] = [
      { type: 'start' },
      { type: 'restart' },
      { type: 'memberJoined' },
      { type: 'roomDone' },
      { type: 'abandon' },
      { type: 'removed' },
      { type: 'ended' },
    ];
    for (const event of events) expect(transition(released, event, out).next).toBe(released);
  });
});

describe('orphanedAnswerLeaves', () => {
  // A page that unmounted mid-resume must not end the session its remount resumed on the same secret.
  it('keeps the session stored for this lobby, leaves any other', () => {
    expect(orphanedAnswerLeaves('s1', 's1')).toBe(false);
    expect(orphanedAnswerLeaves('s2', 's1')).toBe(true);
    expect(orphanedAnswerLeaves('s1', null)).toBe(true);
  });
});
