'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

import { zonedDay } from '../debate-hours';

/**
 * `AGENDA_TIME_ZONE`, restated rather than imported: `debate-agendas` pulls in the claim picker, and
 * the claim card this tag sits on is part of that picker.
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

/** Ids asked for in one request. A feed page or a hub tab is well under this. */
const BATCH_SIZE = 100;

type Waiter = { resolve: (day: string | null) => void; reject: (error: unknown) => void };

let pending = new Map<string, Waiter[]>();
let flushScheduled = false;

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

function flush() {
  flushScheduled = false;
  const batch = pending;
  pending = new Map();
  const ids = [...batch.keys()];

  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const chunk = ids.slice(start, start + BATCH_SIZE);
    fetchLastListedOn(chunk).then(
      days => {
        for (const id of chunk) for (const waiter of batch.get(id) ?? []) waiter.resolve(days.get(id) ?? null);
      },
      error => {
        for (const id of chunk) for (const waiter of batch.get(id) ?? []) waiter.reject(error);
      }
    );
  }
}

/**
 * One entity's `lastListedOn`, asked for together with every other card that mounts in the same
 * task. Each card asks for its own id, so the tag needs no plumbing through the lists that render
 * it, and a page of cards is still one request.
 */
export function loadLastListedOn(entityId: string): Promise<string | null> {
  const id = normId(entityId);
  return new Promise((resolve, reject) => {
    const waiters = pending.get(id);
    if (waiters) waiters.push({ resolve, reject });
    else pending.set(id, [{ resolve, reject }]);
    if (!flushScheduled) {
      flushScheduled = true;
      setTimeout(flush, 0);
    }
  });
}

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

export function lastListedOnQueryKey(entityId: string) {
  return ['entity-last-listed-on', normId(entityId)] as const;
}

/**
 * Whether a claim, or a debate through its claim, carries the Trending tag. False while loading and
 * on failure: the tag is a hint, and a missing one costs nothing a wrong one would.
 */
export function useIsTrending(entityId: string | null | undefined, enabled = true): boolean {
  const { data } = useQuery({
    queryKey: lastListedOnQueryKey(entityId ?? ''),
    queryFn: () => loadLastListedOn(entityId as string),
    enabled: enabled && Boolean(entityId),
    // Agendas are swept into the ranking hourly, so a listing is never fresher than that.
    staleTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  return isTrendingListing(data);
}
