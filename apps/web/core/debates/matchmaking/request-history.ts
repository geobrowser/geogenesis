'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { type DebateHistoryItem, type DebateHistoryResponse, listDebateHistory } from '../api';
import { debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';

/** One page, as GEO-3464 sizes it: enough to fill a few days of the timeline per scroll. */
export const HISTORY_PAGE_SIZE = 50;

export function debateHistoryQueryKey(accountKey: string | null) {
  return ['debates', 'history', accountKey] as const;
}

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
    queryKey: debateHistoryQueryKey(accountKey),
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
    unavailable: query.isError,
    isLoading: query.isLoading,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: query.fetchNextPage,
  };
}

/**
 * Settled and in the past. Still-open things (a pending invite, a debate under way) are already on
 * the timeline from the live reads, at their own time, so history would only repeat them.
 */
export function isSettledHistoryItem(item: DebateHistoryItem, now: number) {
  if (item.outcome === 'pending' || item.outcome === 'in_progress') return false;
  const at = Date.parse(item.occurred_at);
  return Number.isFinite(at) && at <= now;
}

/**
 * How an item ended, in the viewer's words. A recipient who passed and one who was beaten to it are
 * told apart (GEO-3464), and "unknown" — a request that ended before outcomes were recorded — says
 * nothing rather than guessing.
 */
export function historyOutcomeLabel(item: Pick<DebateHistoryItem, 'kind' | 'direction' | 'outcome'>): string | null {
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
      case 'declined':
        return direction === 'incoming' ? 'You declined' : 'They declined';
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
      return kind === 'challenge' ? 'They accepted' : 'Someone took it';
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
