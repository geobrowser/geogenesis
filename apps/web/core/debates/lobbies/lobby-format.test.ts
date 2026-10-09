import { describe, expect, it } from 'vitest';

import { type DebateLobbyMember, type DebateLobbyRole, GeoChatRequestError } from '../api';
import {
  debatingCount,
  debatingLabel,
  hostAfterChange,
  hostsLabel,
  inDebateLabel,
  isAlreadyInAnotherLobby,
  lobbyErrorMessage,
  lobbyScheduleLabel,
  lobbyTimeLabel,
  memberActions,
  memberStatus,
  moderationErrorMessage,
  moderationLogLabel,
  moderationNoticeText,
  notYetOpenLabel,
  otherLobbyIdFrom,
  pairLabel,
  pairSubject,
  personName,
  raisedHands,
  rosterOrder,
  sinceLabel,
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
    on_roster_since: '2026-10-05T10:00:00Z',
    stepped_out: false,
    in_debate: false,
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
  it('recognizes the 409 and reads the other lobby id from its details', () => {
    const error = new GeoChatRequestError('you are in another lobby', 'already_in_another_lobby', 409, null, {
      current_lobby_id: '0000000000000000000000000000ABCD',
    });
    expect(isAlreadyInAnotherLobby(error)).toBe(true);
    expect(otherLobbyIdFrom(error)).toBe('0000000000000000000000000000abcd');
    expect(isAlreadyInAnotherLobby(new GeoChatRequestError('x', 'lobby_closed', 409))).toBe(false);
    // The message text is never parsed.
    expect(
      otherLobbyIdFrom(
        new GeoChatRequestError('lobby 0000000000000000000000000000abce', 'already_in_another_lobby', 409)
      )
    ).toBeNull();
  });
});

describe('lobbyErrorMessage', () => {
  const refused = (code: string, status = 409, details: Record<string, unknown> | null = null) =>
    new GeoChatRequestError(`raw ${code}`, code, status, null, details);

  it('never shows the server message', () => {
    expect(lobbyErrorMessage(refused('rate_limited', 429), 'x')).not.toContain('raw');
    expect(lobbyErrorMessage(refused('lobby_limit_reached', 409, { limit: 5 }), 'x')).toBe(
      'You already have 5 lobbies open or scheduled. End one to open another.'
    );
    expect(lobbyErrorMessage(refused('lobby_limit_reached'), 'x')).not.toContain('raw');
    for (const code of [
      'lobby_host_required',
      'lobby_connection_in_use',
      'lobby_name_required',
      'lobby_name_too_long',
      'lobby_name_invalid',
      'lobby_start_in_past',
      'lobby_start_too_far',
      'lobby_already_open',
      'lobby_closed',
      'lobby_banned',
      'lobby_not_found',
      'lobby_stepped_out',
      'lobby_not_present',
      'lobby_voice_full',
      'voice_capacity_reached',
      'voice_unavailable',
      'livekit_not_configured',
    ]) {
      const message = lobbyErrorMessage(refused(code), 'fallback');
      expect(message).not.toContain('raw');
      expect(message).not.toBe('fallback');
    }
  });

  it('names the per-lobby voice cap', () => {
    expect(lobbyErrorMessage(refused('lobby_voice_full', 409, { limit: 40 }), 'x')).toContain('40 people');
    expect(lobbyErrorMessage(refused('voice_capacity_reached', 503), 'x')).toBe(
      'Voice is busy right now. Try again in a minute.'
    );
  });

  it('falls back for an unknown code or a network failure', () => {
    expect(lobbyErrorMessage(refused('something_new'), 'Could not join.')).toBe('Could not join.');
    expect(lobbyErrorMessage(new TypeError('Failed to fetch'), 'Could not join.')).toBe('Could not join.');
  });
});

describe('memberActions (GEO-3134)', () => {
  const host = { hosting: true, role: 'host' as const, creator: false };
  const creatorHost = { ...host, creator: true };
  const acting = { hosting: true, role: 'speaker' as const, creator: false };
  const target = (role: DebateLobbyRole, creator = false) => ({ role, creator });

  it('gives a non-host nothing, even a host by role who is away', () => {
    expect(memberActions({ hosting: false, role: 'speaker', creator: false }, target('speaker'), false)).toEqual([]);
    expect(memberActions({ hosting: false, role: 'host', creator: true }, target('speaker'), false)).toEqual([]);
  });

  it('offers a host the full menu on a speaker and on a listener', () => {
    expect(memberActions(host, target('speaker'), false)).toEqual([
      'promote',
      'mute',
      'move-to-listeners',
      'remove',
      'ban',
    ]);
    expect(memberActions(host, target('listener'), false)).toEqual(['promote', 'move-to-speakers', 'remove', 'ban']);
  });

  it('offers only Remove as host on another host, and never on the creator unless the viewer is it', () => {
    expect(memberActions(host, target('host'), false)).toEqual(['remove-host']);
    expect(memberActions(host, target('host', true), false)).toEqual([]);
    expect(memberActions(creatorHost, target('host'), false)).toEqual(['remove-host']);
  });

  it('lets a host step down, the creator included', () => {
    expect(memberActions(host, target('host'), true)).toEqual(['remove-host']);
    expect(memberActions(creatorHost, target('host', true), true)).toEqual(['remove-host']);
  });

  it('keeps who hosts away from the acting host', () => {
    expect(memberActions(acting, target('speaker'), false)).toEqual(['mute', 'move-to-listeners', 'remove', 'ban']);
    expect(memberActions(acting, target('host'), false)).toEqual([]);
    expect(memberActions(acting, target('speaker'), true)).toEqual([]);
  });
});

describe('raisedHands', () => {
  it('lists raised hands oldest first', () => {
    const members = [
      { ...member('a', 'listener'), hand_raised_at: '2026-10-05T10:02:00Z' },
      member('b', 'listener'),
      { ...member('c', 'listener'), hand_raised_at: '2026-10-05T10:01:00Z' },
    ];
    expect(raisedHands(members).map(m => m.user_id)).toEqual(['c', 'a']);
  });
});

describe('moderation copy', () => {
  it('reads lobby_not_present as needing to be in the lobby', () => {
    expect(moderationErrorMessage(new GeoChatRequestError('raw', 'lobby_not_present', 409))).toBe(
      'Join the lobby to moderate.'
    );
    expect(moderationErrorMessage(new GeoChatRequestError('raw', 'lobby_target_is_host', 409))).toBe(
      'Remove them as host first.'
    );
    expect(moderationErrorMessage(new GeoChatRequestError('raw', 'unknown_code', 500))).toBe(
      'That didn’t work. Try again.'
    );
  });

  it('maps every moderation refusal', () => {
    for (const code of [
      'lobby_member_not_found',
      'lobby_target_is_self',
      'lobby_target_is_host',
      'lobby_creator_host',
      'lobby_last_host',
      'lobby_target_banned',
      'lobby_target_not_in_voice',
      'lobby_not_listener',
      'lobby_removed',
    ]) {
      expect(lobbyErrorMessage(new GeoChatRequestError('raw', code, 409), 'fallback')).not.toBe('fallback');
    }
  });

  it('tells the viewer what a host did, except kick and ban, which have screens', () => {
    expect(moderationNoticeText('mute')).toBe('A host muted you. Unmute when you’re ready.');
    expect(moderationNoticeText('move_to_listeners')).toMatch(/listeners/);
    expect(moderationNoticeText('kick')).toBeNull();
    expect(moderationNoticeText('ban')).toBeNull();
  });

  it('labels log entries', () => {
    const adam = { user_id: 'aa-1', profile_space_id: 's', display_name: 'Adam', avatar_cid: null };
    const sam = { user_id: 'bb', profile_space_id: 's', display_name: 'Sam', avatar_cid: null };
    expect(moderationLogLabel({ action: 'mute', actor: adam, target: sam })).toBe('Adam muted Sam');
    expect(moderationLogLabel({ action: 'move_to_listeners', actor: adam, target: sam })).toBe(
      'Adam moved Sam to listeners'
    );
    expect(moderationLogLabel({ action: 'remove_host', actor: adam, target: { ...adam, user_id: 'AA1' } })).toBe(
      'Adam stepped down as host'
    );
    expect(moderationLogLabel({ action: 'promote', actor: null, target: sam })).toBe('Sam started hosting');
    expect(moderationLogLabel({ action: 'end', actor: adam, target: null })).toBe('Adam ended the lobby');
  });

  it('says how long a hand has been up', () => {
    const now = Date.parse('2026-10-05T10:05:00Z');
    expect(sinceLabel('2026-10-05T10:04:40Z', now)).toBe('20 s');
    expect(sinceLabel('2026-10-05T10:02:00Z', now)).toBe('3 min');
  });
});

describe('inDebateLabel', () => {
  it('names the claim the pair is debating', () => {
    expect(
      inDebateLabel({ phase: 'on_claim', claim_entity_id: 'c1', claim_name: ' Cats are better ', space_id: 's1' })
    ).toBe('In a debate on “Cats are better”');
  });

  it('says the pair is still picking', () => {
    expect(inDebateLabel({ phase: 'choosing_claim' })).toBe('In a debate, picking a claim');
  });

  // null: hidden by a moderator, or the viewer is off the roster. undefined: an older geo-chat.
  it.each([null, undefined])('falls back to the plain line for %s', subject => {
    expect(inDebateLabel(subject)).toBe('In a debate');
  });

  it('falls back to the plain line for a claim with no name', () => {
    expect(inDebateLabel({ phase: 'on_claim', claim_entity_id: 'c1', claim_name: '', space_id: 's1' })).toBe(
      'In a debate'
    );
  });
});

describe('memberStatus', () => {
  it('reads In a debate first, then the availability toggle', () => {
    expect(memberStatus({ in_debate: true, available_to_debate: false })).toBe('in_debate');
    expect(memberStatus({ in_debate: false, available_to_debate: true })).toBe('looking');
    expect(memberStatus({ in_debate: false, available_to_debate: false })).toBe('chatting');
  });

  it('lets the viewer’s own toggle stand in for the roster’s flag', () => {
    expect(memberStatus({ in_debate: false, available_to_debate: true }, false)).toBe('chatting');
    expect(memberStatus({ in_debate: false, available_to_debate: false }, undefined)).toBe('chatting');
  });

  it('says nothing for a geo-chat that predates the flag', () => {
    expect(memberStatus({ in_debate: false })).toBeNull();
  });
});

describe('debating count', () => {
  it('counts people in a debate, not pairs', () => {
    expect(debatingCount([{ in_debate: true }, { in_debate: true }, { in_debate: false }])).toBe(2);
    expect(debatingLabel(2)).toBe('2 debating');
  });
});

describe('pairs', () => {
  const person = (id: string, inLobby = true) => ({
    user_id: id,
    profile_space_id: `space-${id}`,
    display_name: id.toUpperCase(),
    avatar_cid: null,
    in_lobby: inLobby,
  });

  it('reads "A vs. B", or the one name when the partner is hidden', () => {
    expect(pairLabel({ people: [person('a'), person('b', false)] })).toBe('A vs. B');
    expect(pairLabel({ people: [person('a')] })).toBe('A');
  });

  it('takes the claim from a lobby member’s roster row, matching ids across spellings', () => {
    const subject = { phase: 'on_claim' as const, claim_entity_id: 'c', claim_name: 'Cats', space_id: 's' };
    const debater = {
      ...member('0193aaaa-bbbb', 'speaker'),
      in_debate: true,
      in_debate_subject: subject,
    };
    const pair = { people: [person('outsider', false), person('0193aaaabbbb')] };
    expect(pairSubject(pair, [debater])).toBe(subject);
    expect(pairSubject({ people: [person('outsider', false)] }, [debater])).toBeNull();
  });
});
