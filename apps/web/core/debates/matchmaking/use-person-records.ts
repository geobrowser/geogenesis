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
      const { document, variables } = buildPersonRecordsDocument(key);
      return Effect.runPromise(
        graphql({
          query: document,
          variables,
          signal,
          decoder: (response: PersonRecordsQuery) => readPersonRecords(response, key),
        })
      );
    },
  });

  const debateIds = React.useMemo(() => {
    if (!raw) return [];
    return [...new Set([...raw.values()].flatMap(record => record.debateIds))];
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

    // Either side coming back full means the other pages were never read, so what is here is a
    // subset. Reported rather than counted — see `derivePersonRecord`.
    const truncated = [supported, opposed].some(side => (side?.nodes?.length ?? 0) >= DEBATE_RELATIONS_PER_SIDE);

    records.set(personId, {
      positions: positions?.totalCount ?? 0,
      debateIds: [...debateIds],
      truncated,
      createdAt: joined?.createdAt ?? null,
    });
  });

  return records;
}
