'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { createBatchLoader } from '~/core/io/batch-loader';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';
import { validateEntityId } from '~/core/utils/utils';

import { zonedDay } from '../debate-hours';

/**
 * The agenda calendar's zone. Restated rather than imported from `debate-agendas`, because GEO-3538
 * (#3036) removes that copy when agendas come from gaia, which leaves this the only reader. If both
 * are ever on master together, keep one.
 */
const AGENDA_TIME_ZONE = 'America/New_York';

/**
 * gaia's `lastListedOn` (GEO-3488): the newest agenda day that lists a claim, through a block item
 * or the agenda's own Claims relation, never through its Topics. On a debate it is its claim's. A
 * New York `YYYY-MM-DD`, live rather than stored, so it follows agendas as they are edited.
 */
const LAST_LISTED_ON_SOURCE = /* GraphQL */ `
  query EntitiesLastListedOn($ids: [UUID!]) {
    entities(filter: { id: { in: $ids } }) {
      id
      lastListedOn
    }
  }
`;

const lastListedOnDocument = parse(LAST_LISTED_ON_SOURCE) as TypedDocumentNode<any, any>;

async function fetchLastListedOn(ids: string[]): Promise<Map<string, string | null>> {
  const rows = await Effect.runPromise(
    graphql({
      query: lastListedOnDocument,
      decoder: (data: { entities?: ({ id: string; lastListedOn: string | null } | null)[] | null }) =>
        (data.entities ?? []).flatMap(row => (row ? [row] : [])),
      variables: { ids },
    })
  );
  return new Map(rows.map(row => [normId(row.id), row.lastListedOn]));
}

/**
 * One entity's `lastListedOn`, asked for together with every other card mounting in the same
 * commit. Each card asks for its own id, so the tag needs no plumbing through the lists that render
 * it, and a page of cards is still one request. Takes a normalized id; an entity the API does not
 * return has no listing.
 */
export const loadLastListedOn = createBatchLoader<string | null>({
  fetchBatch: fetchLastListedOn,
  missing: () => null,
  maxBatchSize: 100,
});

/**
 * GEO-3497. Trending while the claim was last listed on today's or yesterday's agenda (New York
 * days, as agendas are written). Keyed on the listing, not the ranking boost, so a heavily debated
 * claim keeps the tag while its boost shrinks. Nothing to clean up: the tag lapses with the day.
 */
export function isTrendingListing(lastListedOn: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastListedOn) return false;
  const today = zonedDay(now, AGENDA_TIME_ZONE);
  const yesterday = zonedDay(now, AGENDA_TIME_ZONE, -1);
  return lastListedOn >= yesterday && lastListedOn <= today;
}

/**
 * Whether a claim, or a debate through its claim, carries the Trending tag. False while loading and
 * on failure: the tag is a hint, and a missing one costs nothing a wrong one would.
 */
export function useIsTrending(entityId: string | null | undefined, enabled = true): boolean {
  const id = entityId ? normId(entityId) : '';
  const { data } = useQuery({
    queryKey: ['entity-last-listed-on', id],
    queryFn: () => loadLastListedOn(id),
    // One id the API rejects as a UUID fails the whole batch, and with it every other card's tag.
    enabled: enabled && validateEntityId(id),
    // Agendas are swept into the ranking hourly, so a listing is never fresher than that.
    staleTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  return isTrendingListing(data);
}
