'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

import { type ClaimPickerEntity, useClaimEntitiesByIds } from '../claim-picker-page';
import { debateQueryKeys, debateQueryNetworkOptions } from '../hooks';
import { currentDebateAgendasDocument } from './current-debate-agendas-document';

/** "Earlier this week": agendas from the six days before today. */
export const EARLIER_AGENDA_DAYS = 6;

/**
 * Rows asked for in one request: the API's maximum. Without it the API stops at 100, which a week
 * of earlier listings across a few spaces passes (54 rows on 29 Oct 2026, across four spaces).
 */
const AGENDA_ROW_LIMIT = 1000;

/** One data block of one space's newest agenda: a heading and its claims, in the agenda's order. */
export type DebateAgendaSection = {
  /** The block id, which a new day's agenda replaces, so a section's remembered state is the day's. */
  id: string;
  agendaId: string;
  spaceId: string;
  name: string;
  claimIds: string[];
  /** Midnight New York on the agenda's day. When a debate starts counting as "since the listing". */
  listedAt: string;
};

/** A claim from an agenda before the space's newest, for "Earlier this week". */
export type DebateAgendaListing = {
  claimId: string;
  spaceId: string;
  agendaId: string;
  /** The agenda's day, `YYYY-MM-DD`. */
  listedOn: string;
  listedAt: string;
};

export type DebateAgendaSpace = {
  spaceId: string;
  /** The day of this space's newest agenda, `YYYY-MM-DD`. */
  listedOn: string;
  sections: DebateAgendaSection[];
};

export type DebateAgendas = {
  /** Every space with an agenda in the window, each with its newest day's sections, unordered. */
  spaces: DebateAgendaSpace[];
  /** Claims from older agendas this week that their space's newest one does not list, newest listing first. */
  earlier: DebateAgendaListing[];
  /** The newest agenda day across every space, or null when there are none. */
  newestDay: string | null;
  /**
   * Each listed claim's newest listing, as midnight New York on that agenda's day: where its
   * debates start counting.
   */
  listedAtByClaim: Map<string, string>;
};

/**
 * One row of gaia's `currentDebateAgendas` (GEO-3503): one item of one agenda, already in Geo's
 * order. Only the fields the picker reads.
 */
export type DebateAgendaRow = {
  spaceId: string;
  agendaId: string;
  listedOn: string;
  listedAt: string;
  isCurrent: boolean;
  /** `block_item` is the agenda's contents; `agenda_claims` / `agenda_topics` only steer ranking. */
  source: string;
  sectionId: string | null;
  sectionName: string | null;
  entityId: string;
};

/**
 * The calendar day of an agenda listing: `2026-10-27T00:00:00-04:00` and `2026-10-27T04:00:00+00:00`
 * (midnight New York, as the API writes `listedAt`) are both the 27th.
 */
export function agendaDayFromValue(value: string): string | null {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * The picker's agendas from the API's rows: each space's current agenda as sections, and what the
 * rest of the week listed that the current one does not.
 *
 * The rows arrive in Geo's order, with gaia's rules applied (GEO-3503): debate spaces only, an
 * agenda's Date read as a New York day, block items typed Claim, a space's current agenda the
 * freshest dated this week (the later-created when two share a Date), earlier rows once per claim
 * per space and none on that space's current agenda. What is left here is the picker's own: the
 * caller's spaces, claims it could resolve, and Earlier this week once per claim across spaces.
 */
export function buildDebateAgendas(
  rows: readonly DebateAgendaRow[],
  claimIds: ReadonlySet<string>,
  /**
   * Whether a space's agendas count at all. Applied before anything else, so an agenda in a space
   * that does not count cannot move a claim's listing, take its place in Earlier this week, or
   * become the newest day.
   */
  keepSpace: (spaceId: string) => boolean = () => true
): DebateAgendas {
  const items = rows.filter(
    row => row.source === 'block_item' && keepSpace(row.spaceId) && claimIds.has(normId(row.entityId))
  );

  const spacesById = new Map<string, DebateAgendaSpace>();
  const sectionsById = new Map<string, DebateAgendaSection>();
  const earlier: DebateAgendaListing[] = [];
  for (const row of items) {
    const claimId = normId(row.entityId);
    if (!row.isCurrent) {
      earlier.push({
        claimId,
        spaceId: row.spaceId,
        agendaId: row.agendaId,
        listedOn: row.listedOn,
        listedAt: row.listedAt,
      });
      continue;
    }
    const spaceKey = normId(row.spaceId);
    let space = spacesById.get(spaceKey);
    if (!space) {
      space = { spaceId: row.spaceId, listedOn: row.listedOn, sections: [] };
      spacesById.set(spaceKey, space);
    }
    // A current item always sits in a block; the key falls back so a malformed row can't merge blocks.
    const sectionKey = `${spaceKey}:${row.sectionId ?? row.agendaId}`;
    let section = sectionsById.get(sectionKey);
    if (!section) {
      section = {
        id: row.sectionId ?? row.agendaId,
        agendaId: row.agendaId,
        spaceId: row.spaceId,
        name: row.sectionName ?? 'Today’s claims',
        claimIds: [],
        listedAt: row.listedAt,
      };
      sectionsById.set(sectionKey, section);
      space.sections.push(section);
    }
    if (!section.claimIds.includes(claimId)) section.claimIds.push(claimId);
  }
  const spaces = [...spacesById.values()];

  // Newest listing first, keeping each day's agenda order; then once per claim, at its newest.
  const seen = new Set<string>();
  const earlierOnce = earlier
    .map((listing, index) => ({ listing, index }))
    .sort((a, b) =>
      a.listing.listedOn === b.listing.listedOn ? a.index - b.index : a.listing.listedOn < b.listing.listedOn ? 1 : -1
    )
    .map(({ listing }) => listing)
    .filter(listing => {
      if (seen.has(listing.claimId)) return false;
      seen.add(listing.claimId);
      return true;
    });

  // A claim's newest listing among the spaces kept: each current agenda and every earlier listing
  // this week, the latest day winning. Not the listing it is shown under, which the page picks by
  // space. (The API's own lastListedOn counts every space, so it can't honour `keepSpace`.)
  const listedAtByClaim = new Map<string, string>();
  const newestListing = new Map<string, string>();
  for (const row of items) {
    const claimId = normId(row.entityId);
    const known = newestListing.get(claimId);
    if (known && known >= row.listedOn) continue;
    newestListing.set(claimId, row.listedOn);
    listedAtByClaim.set(claimId, row.listedAt);
  }

  const newestDay = spaces.reduce<string | null>(
    (day, space) => (day === null || space.listedOn > day ? space.listedOn : day),
    null
  );

  return { spaces, earlier: earlierOnce, newestDay, listedAtByClaim };
}

export const NO_AGENDAS: DebateAgendas = { spaces: [], earlier: [], newestDay: null, listedAtByClaim: new Map() };

/** Every space's current agenda and the week's earlier listings, from gaia's one agendas query. */
export async function fetchCurrentDebateAgendas(signal?: AbortSignal): Promise<DebateAgendaRow[]> {
  const rows = await Effect.runPromise(
    graphql({
      query: currentDebateAgendasDocument,
      decoder: (data: { currentDebateAgendas?: (Partial<DebateAgendaRow> | null)[] | null }) =>
        (data.currentDebateAgendas ?? []).filter(isAgendaRow),
      variables: { earlierDays: EARLIER_AGENDA_DAYS, first: AGENDA_ROW_LIMIT },
      signal,
    })
  );
  if (rows.length >= AGENDA_ROW_LIMIT) {
    // Far past today's volume. Say so rather than show a cut list as if it were whole.
    console.error('[useDebateAgendas] Agendas reached the row limit; older listings may be missing', {
      rows: rows.length,
    });
  }
  return rows;
}

/**
 * GEO-3489. Every space's current Debate agenda, with the week's earlier listings, read from gaia's
 * `currentDebateAgendas` (GEO-3538) so the picker shows agendas by the rules the Best ranking uses.
 *
 * The one place the Today's claims surfaces read agendas from: the picker today, the side panel,
 * hub and lobby next (GEO-3490, GEO-3491). One request for the agendas, then the claims they list,
 * for their cards.
 */
export function useDebateAgendas(enabled = true): {
  /**
   * The agendas, counting only the spaces `keepSpace` keeps. A function rather than a value because
   * which spaces count is the caller's to decide — the picker needs each space's type, which it
   * looks up from `spaceIds`.
   */
  agendasIn: (keepSpace: (spaceId: string) => boolean) => DebateAgendas;
  /** Every space with an agenda this week, before `keepSpace`. */
  spaceIds: string[];
  /** Every claim any of those agendas lists, before `keepSpace`. */
  claimIds: string[];
  /** The listed claims, so callers don't fetch what this already resolved. */
  claimEntities: ClaimPickerEntity[];
  /** True until the agendas and their claims have settled; empty agendas mean "none" only after. */
  isLoading: boolean;
  error: unknown;
} {
  const {
    data: rows = NO_ROWS,
    isLoading: agendasLoading,
    error: agendasError,
  } = useQuery({
    queryKey: debateQueryKeys.todaysAgendas(),
    queryFn: ({ signal }) => fetchCurrentDebateAgendas(signal),
    enabled,
    ...debateQueryNetworkOptions,
    // Read once per visit. A picker left open past midnight keeps the agendas it opened on, and
    // nothing outlives the visit, so the next one asks again: the page's flag only turns on after
    // hydration, and a cached answer would otherwise be reused without a request.
    staleTime: Infinity,
    gcTime: 0,
  });

  const items = React.useMemo(() => rows.filter(row => row.source === 'block_item'), [rows]);
  const spaceIds = React.useMemo(
    () => (enabled ? [...new Map(items.map(row => [normId(row.spaceId), row.spaceId])).values()] : NO_IDS),
    [enabled, items]
  );
  const itemIds = React.useMemo(() => [...new Set(items.map(row => normId(row.entityId)))], [items]);

  const {
    entities: claimEntities,
    isLoading: claimsLoading,
    error: claimsError,
  } = useClaimEntitiesByIds(enabled ? itemIds : NO_IDS);

  const claimIds = React.useMemo(() => claimEntities.map(claim => normId(claim.id)), [claimEntities]);
  const agendasIn = React.useCallback(
    (keepSpace: (spaceId: string) => boolean) =>
      enabled ? buildDebateAgendas(rows, new Set(claimIds), keepSpace) : NO_AGENDAS,
    [claimIds, enabled, rows]
  );

  const isLoading = enabled && (agendasLoading || (itemIds.length > 0 && claimsLoading));

  return React.useMemo(
    () => ({
      agendasIn,
      spaceIds,
      claimIds: enabled ? claimIds : NO_IDS,
      claimEntities,
      isLoading,
      error: agendasError ?? claimsError ?? null,
    }),
    [agendasError, agendasIn, claimEntities, claimIds, claimsError, enabled, isLoading, spaceIds]
  );
}

/** A row with every field the picker reads. gaia's columns are non-null; one that isn't is dropped, not fatal. */
function isAgendaRow(row: Partial<DebateAgendaRow> | null): row is DebateAgendaRow {
  return (
    row != null &&
    typeof row.spaceId === 'string' &&
    typeof row.agendaId === 'string' &&
    typeof row.listedOn === 'string' &&
    typeof row.listedAt === 'string' &&
    typeof row.isCurrent === 'boolean' &&
    typeof row.source === 'string' &&
    typeof row.entityId === 'string'
  );
}

const NO_IDS: string[] = [];
const NO_ROWS: DebateAgendaRow[] = [];
