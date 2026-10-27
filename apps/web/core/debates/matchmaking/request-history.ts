'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import {
  type DebateHistoryItem,
  type DebateHistoryResponse,
  type DebateParticipantSummary,
  listDebateHistory,
} from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { opponentName } from '../rooms/room-opponent';
import { sameId } from '../rooms/room-presence';

/** One page, as GEO-3464 sizes it: enough to fill a few days of the timeline per scroll. */
export const HISTORY_PAGE_SIZE = 50;

/**
 * What already happened, for the Requests timeline to show above the now-line (GEO-3463).
 *
 * geo-chat's history list (GEO-3464) is new. Until it is deployed the route answers 404, and any
 * failure here — that, an outage, a refused session — reads as `unavailable` rather than as an
 * error: the timeline falls back to the debates the viewer has had, and nothing above the now-line
 * is worth blanking the tab over. No retries for the same reason: a missing route stays missing.
 */
export function useDebateHistory(enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  const query = useInfiniteQuery({
    ...debateQueryNetworkOptions,
    // Under the account's keys, so the gateway refreshes it when a request ends or a lobby closes.
    queryKey: debateQueryKeys.history(accountKey),
    queryFn: ({ pageParam, signal }) =>
      listDebateHistory(pageParam, HISTORY_PAGE_SIZE, getPrivyIdentityToken, accountKey, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last: DebateHistoryResponse) => last.next_cursor,
    enabled: enabled && authenticated,
    staleTime: 30_000,
  });

  const items = React.useMemo(() => {
    const seen = new Set<string>();
    const all: DebateHistoryItem[] = [];
    // The cursor keeps pages from overlapping, but a refetch of page one after new activity can
    // repeat an id the later pages already hold; the first copy wins.
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        all.push(item);
      }
    }
    return all;
  }, [query.data]);

  return {
    items,
    // Only when nothing has loaded. A later page failing (TanStack keeps the pages it has and still
    // reports an error) leaves the history standing, and is `loadMoreFailed` instead.
    unavailable: query.isError && !query.data,
    isLoading: query.isLoading,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    /**
     * The last page asked for failed: a bad cursor (#299 refuses one with a 400) or an outage. Paging
     * stops here until the viewer asks again with `loadMore`. `hasMore` still says yes after a failure,
     * and the scroll sentinel re-arms on every fetch, so left alone it re-requested the page at
     * round-trip speed for as long as the top was in view. Stays set while a retry is in flight, and
     * clears when one succeeds.
     */
    loadMoreFailed: query.isFetchNextPageError,
    loadMore: query.fetchNextPage,
  };
}

/**
 * Each history item's people by name. geo-chat sends them (`others`); found by id rather than by
 * position, because it leaves out anyone it has no user row for and the two lists then differ.
 * `lookUp` covers a response from before it did.
 */
export function historyNames(
  item: Pick<DebateHistoryItem, 'other_user_ids' | 'others'>,
  lookUp: (userId: string | null) => DebateParticipantSummary | null
) {
  return item.other_user_ids.map(id =>
    opponentName(item.others?.find(person => sameId(person.user_id, id)) ?? lookUp(id))
  );
}

/** The ids `others` does not name, which are the only ones worth asking the graph about. */
export function unnamedHistoryUserIds(items: DebateHistoryItem[]) {
  const ids = new Set<string>();
  for (const item of items) {
    for (const id of item.other_user_ids) {
      if (!item.others?.some(person => sameId(person.user_id, id))) ids.add(id);
    }
  }
  return [...ids];
}

/** What a history row is called, in the viewer's words. */
export function historyTitle(item: DebateHistoryItem, names: string[]): string {
  const name = names[0] ?? 'someone';
  switch (item.kind) {
    case 'debate':
      return `Debate with ${name}`;
    case 'lobby':
      return item.lobby?.name ?? 'Debate lobby';
    case 'scheduled_invite':
      // An arranged invite has no inviter (`direction` null): it is simply a debate with them.
      return item.direction === 'incoming'
        ? `${name} invited you`
        : item.direction === 'outgoing'
          ? `Invite to ${name}`
          : `Debate with ${name}`;
    case 'challenge':
      return item.direction === 'incoming' ? `${name} asked you` : `You asked ${name}`;
    case 'claim_request':
      if (item.direction === 'incoming') return `${name} asked you`;
      // One person named is the one who took it, or a request that only ever went to them (GEO-3333).
      if (names.length === 1) return item.outcome === 'accepted' ? `${name} took your request` : `You asked ${name}`;
      return 'Requested · people who disagree';
  }
}

/** Watch only a debate that actually happened; the request that led to it is not a second way in. */
export function historyWatchable(item: Pick<DebateHistoryItem, 'kind' | 'outcome' | 'debate_id'>) {
  return item.kind === 'debate' && item.debate_id !== null && (item.outcome === 'held' || item.outcome === 'abandoned');
}

/** The uuid in a history id (`scheduled_invite:<uuid>`), for matching against the live lists. */
function historySourceId(item: Pick<DebateHistoryItem, 'id'>) {
  const at = item.id.indexOf(':');
  return at === -1 ? item.id : item.id.slice(at + 1);
}

/**
 * History without what the timeline already shows. geo-chat gives every kind its own entry, so one
 * debate arrives as the request (or challenge, or invite) that led to it *and* as the debate itself;
 * the debate row stands for both. And anything still live — a booked room, an invite still open, a
 * lobby that is on now — is already drawn at its own time from the live reads.
 */
export function dedupeHistory(
  items: DebateHistoryItem[],
  live: { requestIds: Iterable<string>; lobbyIds: Iterable<string> }
) {
  const debateIds = items.filter(item => item.kind === 'debate' && item.debate_id).map(item => item.debate_id!);
  const liveRequests = [...live.requestIds];
  const liveLobbies = [...live.lobbyIds];
  return items.filter(item => {
    if (item.kind !== 'debate' && item.debate_id && debateIds.some(id => sameId(id, item.debate_id!))) return false;
    if (item.kind === 'scheduled_invite' && liveRequests.some(id => sameId(id, historySourceId(item)))) return false;
    if (item.kind === 'lobby' && item.lobby && liveLobbies.some(id => sameId(id, item.lobby!.room_id))) return false;
    return true;
  });
}

/**
 * Settled and in the past. Still-open things (a pending invite) are already on
 * the timeline from the live reads, at their own time, so history would only repeat them.
 */
export function isSettledHistoryItem(item: DebateHistoryItem, now: number) {
  // geo-chat lists only finished debates; a still-pending invite is the one open thing it can send.
  if (item.outcome === 'pending') return false;
  const at = Date.parse(item.occurred_at);
  return Number.isFinite(at) && at <= now;
}

/**
 * How an item ended, in the viewer's words. A recipient who passed and one who was beaten to it are
 * told apart (GEO-3464), and "unknown" — a request that ended before outcomes were recorded — says
 * nothing rather than guessing.
 */
export function historyOutcomeLabel(item: Pick<DebateHistoryItem, 'kind' | 'direction' | 'outcome'>): string | null {
  // `direction` still decides the request and challenge wording below; invites carry their own side.
  const { kind, direction, outcome } = item;
  if (kind === 'debate') {
    return outcome === 'held'
      ? 'Debated'
      : outcome === 'never_started'
        ? 'Didn’t start'
        : outcome === 'abandoned'
          ? 'Ended early'
          : null;
  }
  if (kind === 'lobby') return 'You joined';
  if (kind === 'scheduled_invite') {
    switch (outcome) {
      case 'accepted':
        return 'Booked';
      // Told from the viewer's side by geo-chat (#299): `declined` is the viewer's own answer, and
      // `declined_by_other` the other debater's, whoever sent it — an arranged invite included.
      case 'declined':
        return 'You declined';
      case 'declined_by_other':
        return 'They declined';
      case 'expired':
        return 'Nobody answered in time';
      case 'cancelled':
        return 'Cancelled';
      case 'superseded':
        return 'The time went to another debate';
      default:
        return null;
    }
  }
  if (direction === 'incoming') {
    switch (outcome) {
      case 'accepted':
        return 'You took it';
      case 'declined':
        return 'You passed';
      case 'taken_by_other':
        return 'Someone else took it';
      case 'cancelled':
        return 'They cancelled';
      case 'expired':
        return 'Missed';
      default:
        return null;
    }
  }
  switch (outcome) {
    case 'accepted':
      // The title names who took a claim request, so the outcome need not say "someone".
      return kind === 'challenge' ? 'They accepted' : 'Accepted';
    case 'declined':
      return 'They declined';
    case 'cancelled':
      return 'You cancelled';
    case 'expired':
      // A challenge went to one person, so nobody "took" it; they simply did not answer.
      return kind === 'challenge' ? 'No answer' : 'Nobody took it';
    case 'passed_by_everyone':
      return 'Nobody took it';
    default:
      return null;
  }
}
