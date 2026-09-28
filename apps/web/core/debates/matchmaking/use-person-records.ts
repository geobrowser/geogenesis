'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

import { type PersonRecord, derivePersonRecord } from './person-record';
import {
  DEBATE_RELATIONS_PER_SIDE,
  POSITIONS_PER_PERSON,
  type PersonRecordsQuery,
  buildPersonRecordsDocument,
  isPersonId,
  personAlias,
} from './person-records-document';

/** Raw per-person counts, before the winner grouping and the omit rules are applied. */
type RawRecord = {
  /** Distinct claims answered, not `userVotes` rows: the same claim can be answered on two axes. */
  positions: number;
  /** Distinct answered claims per space, under the same de-duplication rule. */
  claimsBySpace: Map<string, number>;
  positionsTruncated: boolean;
  debateIds: string[];
  /** Distinct published debates per space; the same debate on both sides still counts once. */
  debatesBySpace: Map<string, number>;
  truncated: boolean;
  createdAt: string | number | null;
};

type CountedConnection<TNode> = {
  totalCount?: number | null;
  nodes?: Array<TNode | null> | null;
};

/**
 * Whether a connection came back short of what the server says it holds.
 *
 * Counted against the ids actually *collected*, not `nodes.length`. The collection loop skips a null
 * node and a node whose id is missing — an id elided by a partial GraphQL error, say — and comparing
 * the raw page length would then find `loaded === totalCount`, leave this `false`, and report a
 * short count as somebody's whole record: exactly the under-report this flag exists to prevent.
 *
 * `totalCount` is the authority; the page cap is the fallback for when it is missing. A full page is
 * not by itself short, or anyone sitting on exactly the page size would be withheld forever.
 */
function isShort<TNode>(side: CountedConnection<TNode> | undefined, collected: number, cap: number): boolean {
  // A side that did not come back at all is not an empty side. Reading it as complete would count
  // whichever side did arrive and call that someone's whole record.
  if (!side || !side.nodes) return true;
  if (typeof side.totalCount === 'number') return collected < side.totalCount;
  return collected < side.nodes.length || side.nodes.length >= cap;
}

/**
 * The record behind every row of the People tab.
 *
 * One aliased graph request for the whole visible list, not one per row. The row no longer shows a
 * win rate, so this deliberately stops at activity counts instead of fetching winner shares in a
 * second dependent request whose result nobody renders.
 */
export function usePersonRecords(personIds: string[]): Map<string, PersonRecord> {
  // Deduplicated and sorted so a re-ordered or repeated list — the presence feed re-sorts as people
  // come and go — reuses the cached batch instead of refetching an identical set under a different
  // key. Unqueryable ids are dropped here rather than inside the builder, so `enabled` below counts
  // what will actually be asked for: a list of nothing but bad ids would otherwise send a query
  // declaring variables it never uses, which the server rejects outright.
  const key = React.useMemo(() => [...new Set(personIds.filter(isPersonId))].sort(), [personIds]);

  const { data: raw } = useQuery({
    queryKey: ['debates', 'person-records', key],
    enabled: key.length > 0,
    // The key is the whole list, so one person coming online makes it a different query. Without
    // this the answer is undefined until the new batch lands and every row's stats blank out and
    // return — for people whose records were already in hand and had not changed.
    placeholderData: keepPreviousData,
    // Presence flaps, and every flap is a new key. Without this a list settling after a few people
    // arrive at once re-runs a request carrying four aliased connections per person, for records
    // that barely move — someone's lifetime positions and join date do not change second to second.
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => {
      const { document, variables, ids } = buildPersonRecordsDocument(key);
      return Effect.runPromise(
        graphql({
          query: document,
          variables,
          signal,
          // Decoded against the ids the document was built from, not `key`: aliases are positional,
          // so an id the builder could not use shifts every alias after it.
          decoder: (response: PersonRecordsQuery) => readPersonRecords(response, ids),
        })
      );
    },
  });

  return React.useMemo(() => {
    const records = new Map<string, PersonRecord>();
    if (!raw) return records;

    for (const [personId, record] of raw) records.set(personId, derivePersonRecord(record));

    return records;
  }, [raw]);
}

/** Pulls the aliased response back apart by position, which is how the aliases were assigned. */
export function readPersonRecords(response: PersonRecordsQuery, personIds: string[]): Map<string, RawRecord> {
  const records = new Map<string, RawRecord>();

  personIds.forEach((personId, index) => {
    const positions = response[personAlias(index, 'positions')] as
      CountedConnection<{ objectId?: string | null; spaceId?: string | null }> | undefined;
    const supported = response[personAlias(index, 'supported')] as
      CountedConnection<{ fromEntityId?: string | null; spaceId?: string | null }> | undefined;
    const opposed = response[personAlias(index, 'opposed')] as typeof supported;
    const joined = response[personAlias(index, 'joined')] as { createdAt?: string | null } | undefined;

    // Distinct claims, not rows. A claim answered on both the stance and the veracity axis is two
    // `userVotes` rows, and one answered in two spaces is two more — so a row count says a bigger
    // number than the positions the rest of the app shows for the same person.
    const positionClaimIds = new Set<string>();
    const positionClaimIdsBySpace = new Map<string, Set<string>>();
    let positionRows = 0;
    for (const node of positions?.nodes ?? []) {
      if (!node?.objectId) continue;
      positionRows += 1;
      const claimId = uuidToHex(node.objectId);
      positionClaimIds.add(claimId);
      if (node.spaceId) {
        const spaceId = normId(node.spaceId);
        const claims = positionClaimIdsBySpace.get(spaceId) ?? new Set<string>();
        claims.add(claimId);
        positionClaimIdsBySpace.set(spaceId, claims);
      }
    }

    const debateIds = new Set<string>();
    const debateIdsBySpace = new Map<string, Set<string>>();
    let truncated = false;
    for (const side of [supported, opposed]) {
      let collected = 0;
      for (const node of side?.nodes ?? []) {
        if (!node?.fromEntityId) continue;
        collected += 1;
        debateIds.add(node.fromEntityId);
        if (node.spaceId) {
          const spaceId = normId(node.spaceId);
          const debates = debateIdsBySpace.get(spaceId) ?? new Set<string>();
          debates.add(uuidToHex(node.fromEntityId));
          debateIdsBySpace.set(spaceId, debates);
        }
      }
      // Per side, not over the union: the two sides are paged independently, and a short page on
      // either one makes the record short.
      truncated = truncated || isShort(side, collected, DEBATE_RELATIONS_PER_SIDE);
    }

    records.set(personId, {
      positions: positionClaimIds.size,
      claimsBySpace: new Map([...positionClaimIdsBySpace].map(([spaceId, ids]) => [spaceId, ids.size])),
      positionsTruncated: isShort(positions, positionRows, POSITIONS_PER_PERSON),
      debateIds: [...debateIds],
      debatesBySpace: new Map([...debateIdsBySpace].map(([spaceId, ids]) => [spaceId, ids.size])),
      truncated,
      createdAt: joined?.createdAt ?? null,
    });
  });

  return records;
}
