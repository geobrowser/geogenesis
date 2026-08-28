'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { useWinnerShares } from '~/core/claims/browse/claim-debates';
import { graphql } from '~/core/io/graphql-client';

import { type PersonRecord, derivePersonRecord } from './person-record';
import {
  DEBATE_RELATIONS_PER_SIDE,
  type PersonRecordsQuery,
  buildPersonRecordsDocument,
  personAlias,
} from './person-records-document';

/** Raw per-person counts, before the winner grouping and the omit rules are applied. */
type RawRecord = { positions: number; debateIds: string[]; truncated: boolean; createdAt: string | null };

/**
 * The record behind every row of the People tab.
 *
 * Two requests, not two per row. The first is one aliased batch for the whole visible list. The
 * second is `useWinnerShares` over the debates that batch turned up, reused rather than
 * reimplemented because deriving a win from `Vote → Winner` relations without grouping them per
 * debate counts *votes cast for someone* instead — on the graph's most decorated debater that is
 * 8 votes across 5 debates of which they won 2, three different numbers from one relation.
 *
 * The second request depends on the first, so this is a waterfall by construction: the debates a
 * person argued are not known until the batch returns.
 */
export function usePersonRecords(personIds: string[]): Map<string, PersonRecord> {
  // Sorted so a re-ordered list — the presence feed re-sorts as people come and go — reuses the
  // cached batch instead of refetching an identical set under a different key.
  const key = React.useMemo(() => [...personIds].sort(), [personIds]);

  const { data: raw } = useQuery({
    queryKey: ['debates', 'person-records', key],
    enabled: key.length > 0,
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

  // Truncated records are excluded: their rate is withheld anyway, so their debates would only
  // spend room under the vote cap below without ever producing a number.
  //
  // That cap is a real ceiling on this. `useWinnerShares` was written for a five-debate browse page
  // and answers with an empty map once its combined result reaches 500 votes, which here would drop
  // the win rate from every row at once rather than from the rows responsible. It fails toward
  // omission rather than toward a wrong number, which is the right direction, but the union of
  // every listed person's lifetime debates does grow with the graph. The graph holds 47 debate
  // votes today against a cap of 500; when that stops being true this needs a bounded, paginated
  // fetch of its own — shared with the record page, which wants the same set.
  const debateIds = React.useMemo(() => {
    if (!raw) return [];
    return [...new Set([...raw.values()].filter(record => !record.truncated).flatMap(record => record.debateIds))];
  }, [raw]);

  const winnerByDebateId = useWinnerShares(debateIds);

  return React.useMemo(() => {
    const records = new Map<string, PersonRecord>();
    if (!raw) return records;

    for (const [personId, record] of raw) {
      records.set(personId, derivePersonRecord({ personId, winnerByDebateId, ...record }));
    }
    return records;
  }, [raw, winnerByDebateId]);
}

/** Pulls the aliased response back apart by position, which is how the aliases were assigned. */
export function readPersonRecords(response: PersonRecordsQuery, personIds: string[]): Map<string, RawRecord> {
  const records = new Map<string, RawRecord>();

  personIds.forEach((personId, index) => {
    const positions = response[personAlias(index, 'positions')] as { totalCount?: number | null } | undefined;
    const supported = response[personAlias(index, 'supported')] as
      { totalCount?: number | null; nodes?: Array<{ fromEntityId?: string | null } | null> | null } | undefined;
    const opposed = response[personAlias(index, 'opposed')] as typeof supported;
    const joined = response[personAlias(index, 'joined')] as { createdAt?: string | null } | undefined;

    const debateIds = new Set<string>();
    for (const side of [supported, opposed]) {
      for (const node of side?.nodes ?? []) {
        if (node?.fromEntityId) debateIds.add(node.fromEntityId);
      }
    }

    // A side is short only if the server says it holds more than came back. Treating a full page as
    // truncated would permanently withhold the record of anyone sitting on exactly the page size.
    // `totalCount` is the authority; the cap is the fallback for when it is missing.
    const truncated = [supported, opposed].some(side => {
      const loaded = side?.nodes?.length ?? 0;
      const total = side?.totalCount;
      return typeof total === 'number' ? loaded < total : loaded >= DEBATE_RELATIONS_PER_SIDE;
    });

    records.set(personId, {
      positions: positions?.totalCount ?? 0,
      debateIds: [...debateIds],
      truncated,
      createdAt: joined?.createdAt ?? null,
    });
  });

  return records;
}
