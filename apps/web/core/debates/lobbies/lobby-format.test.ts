import { describe, expect, it } from 'vitest';

import { type DebateLobbyMember, type DebateLobbyRole, GeoChatRequestError } from '../api';
import {
  hostAfterChange,
  hostsLabel,
  isAlreadyInAnotherLobby,
  lobbyScheduleLabel,
  lobbyTimeLabel,
  notYetOpenLabel,
  otherLobbyIdFrom,
  personName,
  rosterOrder,
} from './lobby-format';

function member(userId: string, role: DebateLobbyRole, actingHost = false): DebateLobbyMember {
  return {
    acting_host: actingHost,
    user_id: userId,
    profile_space_id: `space-${userId}`,
    display_name: userId.toUpperCase(),
    avatar_cid: null,
    role,
    creator: false,
    present_since: '2026-10-05T10:00:00Z',
  };
}

const time = (at: Date) => at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

describe('hostsLabel', () => {
  it('names one, two, or two and a count', () => {
    expect(hostsLabel([])).toBeNull();
    expect(hostsLabel([{ display_name: 'Adam' }])).toBe('Adam');
    expect(hostsLabel([{ display_name: 'Adam' }, { display_name: 'Priya' }])).toBe('Adam and Priya');
    expect(hostsLabel([{ display_name: 'Adam' }, { display_name: 'Priya' }, { display_name: null }])).toBe(
      'Adam, Priya and 1 more'
    );
  });

  it('stands in for a missing name', () => {
    expect(personName({ display_name: '  ' })).toBe('Someone');
  });
});

describe('lobby times', () => {
  const now = new Date(2026, 9, 5, 12, 0).getTime();

  it('drops the day for today and names the weekday this week', () => {
    const today = new Date(2026, 9, 5, 18, 0);
    expect(lobbyTimeLabel(today.toISOString(), now)).toBe(time(today));

    const tuesday = new Date(2026, 9, 6, 18, 0);
    expect(lobbyTimeLabel(tuesday.toISOString(), now)).toBe(
      `${tuesday.toLocaleDateString(undefined, { weekday: 'short' })} ${time(tuesday)}`
    );

    const later = new Date(2026, 9, 20, 18, 0);
    expect(lobbyTimeLabel(later.toISOString(), now)).toContain(time(later));
    expect(lobbyTimeLabel('nope', now)).toBeNull();
  });

  it('gives a scheduled lobby its start and open time until it opens', () => {
    const starts = new Date(2026, 9, 5, 18, 0);
    const opens = new Date(2026, 9, 5, 17, 50);
    const lobby = { scheduled: true, starts_at: starts.toISOString(), opens_at: opens.toISOString(), open: false };

    expect(lobbyScheduleLabel(lobby, now)).toBe(`${time(starts)} · opens ${time(opens)}`);
    expect(lobbyScheduleLabel({ ...lobby, open: true }, now)).toBeNull();
    expect(lobbyScheduleLabel({ ...lobby, scheduled: false }, now)).toBeNull();
    expect(notYetOpenLabel(lobby, now)).toBe(`Opens ${time(opens)} · starts ${time(starts)}`);
  });
});

describe('rosterOrder', () => {
  it('puts hosts first, then speakers, then listeners, keeping server order within a role', () => {
    const order = rosterOrder([
      member('a', 'speaker'),
      member('b', 'listener'),
      member('c', 'host'),
      member('d', 'speaker'),
    ]).map(m => m.user_id);
    expect(order).toEqual(['c', 'a', 'd', 'b']);
  });

  it('lists the acting host with the hosts', () => {
    const order = rosterOrder([member('a', 'speaker'), member('b', 'speaker', true)]).map(m => m.user_id);
    expect(order).toEqual(['b', 'a']);
  });
});

describe('hostAfterChange', () => {
  const lobby = (stamp: string | null, members: DebateLobbyMember[]) => ({ hosts_changed_at: stamp, members });

  it('names whoever hosts once the stamp moves, and nobody on the first view', () => {
    expect(hostAfterChange(undefined, lobby('t1', [member('b', 'speaker', true)]))).toBeNull();
    expect(hostAfterChange('t1', lobby('t1', [member('b', 'speaker', true)]))).toBeNull();
    expect(hostAfterChange(null, lobby('t1', [member('b', 'speaker', true)]))?.user_id).toBe('b');
    // The acting host ends when a host returns; the host is named.
    expect(hostAfterChange('t1', lobby('t2', [member('a', 'host'), member('b', 'speaker')]))?.user_id).toBe('a');
    // The acting host left with nobody to take over.
    expect(hostAfterChange('t2', lobby('t3', [member('c', 'listener')]))).toBeNull();
  });
});

describe('another lobby', () => {
  it('recognizes the 409 and reads the other lobby id from its message', () => {
    const error = new GeoChatRequestError(
      'you are already in lobby 0000000000000000000000000000ABCD; leave it to join this one',
      'already_in_another_lobby',
      409
    );
    expect(isAlreadyInAnotherLobby(error)).toBe(true);
    expect(otherLobbyIdFrom(error)).toBe('0000000000000000000000000000abcd');
    expect(isAlreadyInAnotherLobby(new GeoChatRequestError('x', 'lobby_closed', 409))).toBe(false);
    expect(otherLobbyIdFrom(new GeoChatRequestError('no id', 'already_in_another_lobby', 409))).toBeNull();
    // Structured field first.
    expect(
      otherLobbyIdFrom(
        new GeoChatRequestError('no id', 'already_in_another_lobby', 409, null, {
          current_lobby_id: '0000000000000000000000000000ABCE',
        })
      )
    ).toBe('0000000000000000000000000000abce');
  });
});
