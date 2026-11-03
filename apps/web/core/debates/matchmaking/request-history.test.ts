import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import type { DebateHistoryItem, DebateHistoryResponse } from '../api';
import { historyItem } from './requests-fixtures';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  listDebateHistory: mocks.list,
}));
vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ authenticated: true, accountKey: 'account-a', getPrivyIdentityToken: vi.fn() }),
}));

const {
  dedupeHistory,
  historyNames,
  historyOutcomeLabel,
  historyTitle,
  historyWatchable,
  isSettledHistoryItem,
  unnamedHistoryUserIds,
  useDebateHistory,
} = await import('./request-history');

// The shared item, made plain: no claim, no one named, at a fixed time, and simply expired.
const item = (overrides: Partial<DebateHistoryItem>) =>
  historyItem({
    occurred_at: '2026-10-22T12:00:00Z',
    outcome: 'expired',
    other_user_ids: [],
    claim: null,
    ...overrides,
  });

const person = (id: string, name: string) => ({
  user_id: id,
  profile_space_id: `p-${id}`,
  display_name: name,
  avatar_cid: null,
});

const label = (
  kind: DebateHistoryItem['kind'],
  direction: DebateHistoryItem['direction'],
  outcome: string,
  otherUserIds: string[] = []
) => historyOutcomeLabel({ kind, direction, outcome, other_user_ids: otherUserIds });

describe('historyOutcomeLabel', () => {
  // A targeted request (GEO-3333) went to one person, as a challenge does: nobody "took" it.
  it('says nobody answered a request that went to one person, and nobody took a fan-out', () => {
    expect(label('claim_request', 'outgoing', 'expired', ['user-them'])).toBe('No answer');
    expect(label('claim_request', 'outgoing', 'expired')).toBe('Nobody took it');
  });

  // GEO-3464's distinction a recipient needs: passing and being beaten to it are not the same.
  it('tells a recipient who passed from one someone else beat to it', () => {
    expect(label('claim_request', 'incoming', 'declined')).toBe('You passed');
    expect(label('claim_request', 'incoming', 'taken_by_other')).toBe('Someone else took it');
    expect(label('claim_request', 'incoming', 'expired')).toBe('Missed');
  });

  it('says nobody took a claim request that ran out or was passed on by everyone', () => {
    expect(label('claim_request', 'outgoing', 'expired')).toBe('Nobody took it');
    expect(label('claim_request', 'outgoing', 'passed_by_everyone')).toBe('Nobody took it');
  });

  // One person was asked, so nobody "took" it.
  it('says a challenge went unanswered rather than untaken', () => {
    expect(label('challenge', 'outgoing', 'expired')).toBe('No answer');
    expect(label('challenge', 'outgoing', 'accepted')).toBe('They accepted');
  });

  // geo-chat#299 tells invites from the viewer's side itself, whoever sent them.
  it('reads invites from the viewer’s side', () => {
    expect(label('scheduled_invite', 'incoming', 'declined')).toBe('You declined');
    expect(label('scheduled_invite', 'outgoing', 'declined')).toBe('You declined');
    expect(label('scheduled_invite', 'outgoing', 'declined_by_other')).toBe('They declined');
    expect(label('scheduled_invite', 'outgoing', 'superseded')).toBe('The time went to another debate');
  });

  // geo-chat#299 never calls a past booking with no debate behind it `accepted`.
  it('says a booking that never became a debate didn’t happen', () => {
    expect(label('scheduled_invite', 'outgoing', 'missed')).toBe('Didn’t happen');
    expect(label('scheduled_invite', 'incoming', 'unknown')).toBeNull();
  });

  // geo-chat withdraws a claim request itself when its sender's readiness lapses, so "You" or "They"
  // would guess. A challenge is only ever called off by a person.
  it('says a claim request was cancelled without saying by whom', () => {
    expect(label('claim_request', 'outgoing', 'cancelled')).toBe('Cancelled');
    expect(label('claim_request', 'incoming', 'cancelled')).toBe('Cancelled');
    expect(label('challenge', 'outgoing', 'cancelled')).toBe('You cancelled');
    expect(label('challenge', 'incoming', 'cancelled')).toBe('They cancelled');
  });

  // An arranged invite has no inviter, but the outcome still says whose answer it was.
  it('reads an arranged invite from the viewer’s side too', () => {
    expect(label('scheduled_invite', null, 'declined')).toBe('You declined');
    expect(label('scheduled_invite', null, 'declined_by_other')).toBe('They declined');
  });

  it('describes debates and lobbies', () => {
    expect(label('debate', null, 'held')).toBe('Debated');
    expect(label('debate', null, 'never_started')).toBe('Didn’t start');
    expect(label('lobby', null, 'joined')).toBe('You joined');
  });

  // Requests that ended before outcomes were recorded: say nothing rather than guess.
  it('says nothing for an unknown outcome', () => {
    expect(label('claim_request', 'outgoing', 'unknown')).toBeNull();
    expect(label('claim_request', 'incoming', 'unknown')).toBeNull();
  });
});

describe('isSettledHistoryItem', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  const item = (outcome: string, occurredAt: string) => ({ outcome, occurred_at: occurredAt }) as DebateHistoryItem;

  it('keeps settled items in the past', () => {
    expect(isSettledHistoryItem(item('expired', '2026-10-22T12:00:00Z'), now)).toBe(true);
    expect(isSettledHistoryItem(item('missed', '2026-10-22T12:00:00Z'), now)).toBe(true);
  });

  it('drops still-open items and anything not yet happened', () => {
    expect(isSettledHistoryItem(item('pending', '2026-10-22T12:00:00Z'), now)).toBe(false);
    expect(isSettledHistoryItem(item('accepted', '2026-10-24T12:00:00Z'), now)).toBe(false);
  });
});

describe('historyNames', () => {
  // geo-chat leaves out anyone it has no user row for, so `others` can be shorter than the ids.
  it('names each id by id, not by position', () => {
    const entry = item({ other_user_ids: ['gone', 'b'], others: [person('b', 'Ben')] });
    expect(historyNames(entry, () => null)).toEqual(['Your opponent', 'Ben']);
  });

  it('only asks the graph about ids geo-chat did not name', () => {
    const entries = [item({ other_user_ids: ['a', 'b'], others: [person('a', 'Ana')] })];
    expect(unnamedHistoryUserIds(entries)).toEqual(['b']);
  });
});

describe('historyTitle', () => {
  // geo-chat#299's shapes for a sent claim request: the taker, the one recipient, or nobody.
  it('names who took an accepted claim request', () => {
    expect(historyTitle(item({ outcome: 'accepted', other_user_ids: ['a'] }), ['Ana'])).toBe('Ana took your request');
  });

  it('names the one person a targeted request went to', () => {
    expect(historyTitle(item({ other_user_ids: ['a'] }), ['Ana'])).toBe('You asked Ana');
  });

  it('keeps the fan-out wording for an untargeted request nobody took', () => {
    const entry = item({ outcome: 'passed_by_everyone', other_user_ids: [] });
    expect(
      historyTitle(
        entry,
        historyNames(entry, () => null)
      )
    ).toBe('Requested · people who disagree');
  });

  it('calls an arranged invite a debate with them, not an invitation', () => {
    expect(historyTitle(item({ kind: 'scheduled_invite', direction: null }), ['Ana'])).toBe('Debate with Ana');
  });
});

describe('dedupeHistory', () => {
  const debate = item({ id: 'debate:d1', kind: 'debate', direction: null, outcome: 'held', debate_id: 'd1' });

  it('drops the request, challenge or invite a listed debate came from', () => {
    const request = item({ id: 'claim_request:r1', outcome: 'accepted', debate_id: 'D1' });
    const invite = item({ id: 'scheduled_invite:s1', kind: 'scheduled_invite', outcome: 'accepted', debate_id: 'd1' });
    expect(dedupeHistory([debate, request, invite], { requestIds: [], lobbyIds: [] })).toEqual([debate]);
  });

  it('keeps a request whose debate is not listed', () => {
    const request = item({ id: 'claim_request:r1', outcome: 'accepted', debate_id: 'd9' });
    expect(dedupeHistory([request], { requestIds: [], lobbyIds: [] })).toEqual([request]);
  });

  // Accepted before geo-chat's 0137, a request has no `debate_id`, and nothing exact links it.
  it('folds a legacy accepted request into the debate on its claim with the same person just after', () => {
    const claim = historyItem().claim;
    const held = item({
      id: 'debate:d2',
      kind: 'debate',
      direction: null,
      outcome: 'held',
      debate_id: 'd2',
      occurred_at: '2026-10-22T12:01:30Z',
      other_user_ids: ['user-them'],
      claim,
    });
    const legacy = { outcome: 'accepted', other_user_ids: ['USER-THEM'], claim };
    const sent = item({ id: 'claim_request:r1', direction: 'outgoing', ...legacy });
    const offered = item({ id: 'claim_request:r2', direction: 'incoming', ...legacy });
    expect(dedupeHistory([held, sent], { requestIds: [], lobbyIds: [] })).toEqual([held]);
    expect(dedupeHistory([held, offered], { requestIds: [], lobbyIds: [] })).toEqual([held]);
  });

  it('folds a missed invite into the debate that never started at its time, with the same person', () => {
    const neverStarted = item({
      id: 'debate:d3',
      kind: 'debate',
      direction: null,
      outcome: 'never_started',
      debate_id: 'd3',
      occurred_at: '2026-10-22T15:05:00Z',
      other_user_ids: ['user-them'],
    });
    const missed = item({
      id: 'scheduled_invite:s2',
      kind: 'scheduled_invite',
      direction: 'outgoing',
      outcome: 'missed',
      occurred_at: '2026-10-22T15:00:00Z',
      scheduled_start_at: '2026-10-22T15:00:00Z',
      other_user_ids: ['user-them'],
    });
    expect(dedupeHistory([neverStarted, missed], { requestIds: [], lobbyIds: [] })).toEqual([neverStarted]);
  });

  it('keeps an unlinked entry that does not match its neighbouring debate', () => {
    const claim = historyItem().claim;
    const held = item({
      id: 'debate:d2',
      kind: 'debate',
      direction: null,
      outcome: 'held',
      debate_id: 'd2',
      occurred_at: '2026-10-22T12:01:30Z',
      other_user_ids: ['user-them'],
      claim,
    });
    const accepted = { outcome: 'accepted', claim, other_user_ids: ['user-them'] };
    // Someone else, another claim, a debate an hour later, and a request that was not accepted.
    const otherPerson = item({ id: 'claim_request:a', ...accepted, other_user_ids: ['user-else'] });
    const otherClaim = item({
      id: 'claim_request:b',
      ...accepted,
      claim: { ...claim!, id: 'c9', claim_entity_id: 'e9' },
    });
    const earlier = item({ id: 'claim_request:c', ...accepted, occurred_at: '2026-10-22T11:00:00Z' });
    const notAccepted = item({ id: 'claim_request:d', ...accepted, outcome: 'expired' });
    // A missed invite beside a debate that happened is two things, not one.
    const missed = item({
      id: 'scheduled_invite:s2',
      kind: 'scheduled_invite',
      outcome: 'missed',
      occurred_at: '2026-10-22T12:00:00Z',
      scheduled_start_at: '2026-10-22T12:00:00Z',
      other_user_ids: ['user-them'],
    });
    const rest = [otherPerson, otherClaim, earlier, notAccepted, missed];
    expect(dedupeHistory([held, ...rest], { requestIds: [], lobbyIds: [] })).toEqual([held, ...rest]);
  });

  it('drops invites and lobbies the live lists still show', () => {
    const invite = item({ id: 'scheduled_invite:S-1', kind: 'scheduled_invite', outcome: 'accepted' });
    const lobby = item({ id: 'lobby:l1', kind: 'lobby', outcome: 'joined', lobby: { room_id: 'l1', name: 'NYC' } });
    expect(dedupeHistory([invite, lobby], { requestIds: ['s1'], lobbyIds: ['L1'] })).toEqual([]);
  });
});

describe('historyWatchable', () => {
  it('offers Watch only on a debate that happened', () => {
    expect(historyWatchable(item({ kind: 'debate', outcome: 'held', debate_id: 'd1' }))).toBe(true);
    expect(historyWatchable(item({ kind: 'debate', outcome: 'never_started', debate_id: 'd1' }))).toBe(false);
    expect(historyWatchable(item({ outcome: 'accepted', debate_id: 'd1' }))).toBe(false);
  });
});

describe('useDebateHistory', () => {
  function renderHistory() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);
    return renderHook(() => useDebateHistory(true), { wrapper });
  }

  it('reads as unavailable when the first page fails', async () => {
    mocks.list.mockReset().mockRejectedValue(new Error('404'));
    const { result } = renderHistory();
    await waitFor(() => expect(result.current.unavailable).toBe(true));
  });

  // A later page failing keeps what has loaded: the graph stand-in must not join it.
  it('stays available when only a later page fails', async () => {
    const page: DebateHistoryResponse = { items: [item({})], next_cursor: 'next' };
    mocks.list.mockReset().mockResolvedValueOnce(page).mockRejectedValueOnce(new Error('timeout'));
    const { result } = renderHistory();
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await result.current.loadMore();
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.unavailable).toBe(false);
    expect(result.current.items).toHaveLength(1);
  });

  // `hasMore` still says yes after a failed page, so the timeline needs this to stop paging until
  // the viewer asks again, and to know a retry that worked lets it carry on.
  it('says a later page failed until a retry of it succeeds', async () => {
    const first: DebateHistoryResponse = { items: [item({ id: 'a' })], next_cursor: 'next' };
    const second: DebateHistoryResponse = { items: [item({ id: 'b' })], next_cursor: null };
    mocks.list
      .mockReset()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('400 bad cursor'))
      .mockResolvedValueOnce(second);
    const { result } = renderHistory();
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.loadMoreFailed).toBe(false);

    await result.current.loadMore();
    await waitFor(() => expect(result.current.loadMoreFailed).toBe(true));
    expect(result.current.hasMore).toBe(true);

    await result.current.loadMore();
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.loadMoreFailed).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });
});
