'use client';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import { buildDebateAgendas, useDebateAgendaRows } from './debate-agendas';
import { type TodaysCardScope, agendaScopeIndex } from './todays-claims-attribution';

/**
 * GEO-3775. Whether a claim is on a debate agenda (a space's current one, or one from the six days
 * before), for the lists that offer agenda claims only: the debate room's picker (GEO-3733) and the
 * Debates panel and full-screen hub.
 *
 * Read from gaia's agenda rows alone, not from the claim entities `useDebateAgendas` resolves for
 * Today's cards: a filter needs ids, and waiting on two entity batches would put a serial hop in
 * front of every list, with a failed batch silently halving the agenda.
 */
export type AgendaClaimFilter = {
  /** Whether lists narrow at all. Off, every field below lets everything through. */
  active: boolean;
  /**
   * Every listed claim, `normId`'d and sorted, for `TaggedClaimFilters.onlyClaimIds`. `null` when
   * inactive. Empty while pending or failed, which is why callers hold their queries on those.
   */
  ids: string[] | null;
  /** Every space with an agenda, `normId`'d and sorted; `null` when inactive. */
  spaceIds: string[] | null;
  /** Changes whenever `ids` does, for reset keys. */
  key: string;
  /** Inactive: always true. Active: false until the agendas are in hand, then whether one lists it. */
  has: (claimId: string) => boolean;
  /** Active and the agendas not yet answered. */
  pending: boolean;
  /**
   * Active and the agendas failed with no claims in hand, which is an error rather than "nothing on
   * the agendas". A failed refetch that leaves claims in hand keeps them (GEO-3733's rule).
   */
  error: unknown;
  refetch: () => void;
  /** The agenda a card's claim is credited to (`agenda_id` and its day), or nothing off-agenda. */
  scopeFor: (claimId: string) => TodaysCardScope | undefined;
};

const NO_IDS: string[] = [];
const allow = () => true;
const noScope = () => undefined;
const noop = () => {};

/** The filter that narrows nothing: what every list gets without a provider. */
export const INACTIVE_AGENDA_FILTER: AgendaClaimFilter = {
  active: false,
  ids: null,
  spaceIds: null,
  key: '',
  has: allow,
  pending: false,
  error: null,
  refetch: noop,
  scopeFor: noScope,
};

export function useAgendaClaimFilter(enabled: boolean): AgendaClaimFilter {
  const { rows, isLoading, error, refetch } = useDebateAgendaRows(enabled);

  const items = React.useMemo(() => rows.filter(row => row.source === 'block_item'), [rows]);
  const ids = React.useMemo(() => [...new Set(items.map(row => normId(row.entityId)))].sort(), [items]);
  const spaceIds = React.useMemo(() => [...new Set(items.map(row => normId(row.spaceId)))].sort(), [items]);
  const scopes = React.useMemo(() => agendaScopeIndex(buildDebateAgendas(rows, new Set(ids))), [ids, rows]);

  const pending = enabled && isLoading;
  const failed = enabled && ids.length === 0 && error !== null;

  return React.useMemo(() => {
    if (!enabled) return INACTIVE_AGENDA_FILTER;
    const listed = new Set(pending || failed ? NO_IDS : ids);
    return {
      active: true,
      ids: pending || failed ? NO_IDS : ids,
      spaceIds: pending || failed ? NO_IDS : spaceIds,
      key: pending ? 'pending' : failed ? 'failed' : ids.join(','),
      has: (claimId: string) => listed.has(normId(claimId)),
      pending,
      error: failed ? error : null,
      refetch: () => void refetch(),
      scopeFor: (claimId: string) => scopes.get(normId(claimId)),
    };
  }, [enabled, error, failed, ids, pending, refetch, scopes, spaceIds]);
}

/** The matches on a claim the filter admits: every one when inactive, none while pending or failed. */
export function agendaMatches<T extends { claim: { claim_entity_id: string } }>(
  filter: AgendaClaimFilter,
  matches: readonly T[]
): T[] {
  return filter.active ? matches.filter(match => filter.has(match.claim.claim_entity_id)) : [...matches];
}

/**
 * A hub list card's attribution (GEO-3495): whether the list was searched, and agenda-only the
 * agenda that lists its claim, so the warehouse's `on_agenda` reads true of it.
 */
export function hubCardScope(filter: AgendaClaimFilter, claimId: string, searched: boolean) {
  const agendaScope = filter.scopeFor(claimId);
  if (!searched && !agendaScope) return undefined;
  return { ...(searched ? { list_searched: true } : {}), ...agendaScope };
}

/**
 * One agenda filter for a whole surface, so every list on it narrows by the same answer and the
 * agendas stay observed while tabs swap (their query is `gcTime: 0`, and the panel's tab change
 * unmounts one list before the next mounts). The surface calls `useAgendaClaimFilter` above its
 * tabs and provides the result; full screen, with one list at a time, passes it as a prop instead.
 */
export const AgendaClaimFilterContext = React.createContext<AgendaClaimFilter>(INACTIVE_AGENDA_FILTER);

/** The surface's agenda filter, or the inactive one outside a provider. */
export function useAgendaClaimFilterContext(): AgendaClaimFilter {
  return React.useContext(AgendaClaimFilterContext);
}
