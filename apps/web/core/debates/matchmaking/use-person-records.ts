'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { type WinnerShare, useWinnerSharesWithStatus } from '~/core/claims/browse/claim-debates';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

import { type PersonRecord, canonicalizeWinnerShares, derivePersonRecord } from './person-record';
import {
  DEBATE_RELATIONS_PER_SIDE,
  POSITIONS_PER_PERSON,
  type PersonRecordsQuery,
  buildPersonRecordsDocument,
  isPersonId,
  personAlias,
} from './person-records-document';

const EMPTY_SHARES = new Map<string, WinnerShare>();

/** Canonical identity of the debates a rate was computed over, order- and spelling-independent. */
function debateSetKey(debateIds: string[]): string {
  return debateIds.map(uuidToHex).sort().join(',');
}

/** Raw per-person counts, before the winner grouping and the omit rules are applied. */
type RawRecord = {
  /** Distinct claims answered, not `userVotes` rows: the same claim can be answered on two axes. */
  positions: number;
  positionsTruncated: boolean;
  debateIds: string[];
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

  // Truncated records are excluded: their rate is withheld anyway, so their debates would only
  // spend room under the vote cap below without ever producing a number.
  //
  // Sorted for the same reason `key` is. `relationsConnection` is asked without an `orderBy`, so
  // node order is not guaranteed stable across refetches, and an unsorted union would hand
  // `useWinnerSharesWithStatus` a fresh react-query key — refetching up to 500 vote entities and
  // reopening the stale window below — on a reordering alone, with no data change behind it.
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
    return [
      ...new Set([...raw.values()].filter(record => !record.truncated).flatMap(record => record.debateIds)),
    ].sort();
  }, [raw]);

  // Retained across the key change so a rate does not blink out every time someone comes online.
  // `isStale` is the guard that makes retaining safe: see below.
  const { shares: winnerByDebateId, isStale: sharesAreStale } = useWinnerSharesWithStatus(debateIds, {
    keepPreviousWhileLoading: true,
  });

  // Re-keyed once for the whole tab rather than once per row: the same map is read for everybody
  // listed, and rebuilding it inside the loop is O(people × debates) Map writes on every presence
  // flap.
  const sharesByDebateId = React.useMemo(
    () => canonicalizeWinnerShares(sharesAreStale ? EMPTY_SHARES : winnerByDebateId),
    [winnerByDebateId, sharesAreStale]
  );

  // Rates already derived from a settled share set, each remembered against the exact debates it
  // was computed over, so one can be carried across the window where the shares belong to the
  // previous set — and only while it still describes what the row is counting.
  const settledRates = React.useRef<Map<string, SettledRate>>(new Map());

  const { records, settling } = React.useMemo(() => {
    const records = new Map<string, PersonRecord>();
    const settling = new Map<string, SettledRate>();
    if (!raw) return { records, settling };

    for (const [personId, record] of raw) {
      // While the shares describe the previous set of debates, they cover some of this person's
      // debates and not others. Deriving a rate from that overlap produces a real number computed
      // from part of the evidence — someone's first debate rendering as 0% because the one debate
      // the stale set happened to cover was not theirs. So the rate is not derived at all here (the
      // memo above hands over an empty map while stale); a rate already derived from a settled set
      // is carried over instead, and a person who has none yet simply waits for one. The counts and
      // join date stay current either way.
      const fresh = derivePersonRecord({ personId, ...record, sharesByDebateId });

      // A rate is only carried across if this person's own record is still whole. Once their
      // relations come back truncated the debate count is withheld, and a rate is a statement about
      // that count — showing one over a total the row will not print says more than is known.
      // Carried only while it still describes the debates the row is now counting. A refetch that
      // turns up a debate the settled rate never saw would otherwise pair "2 debates" with "won 1
      // of 1" — a row disagreeing with itself.
      const debateKey = debateSetKey(record.debateIds);
      const previous = settledRates.current.get(personId);
      const carried = record.truncated || !previous || previous.debateKey !== debateKey ? null : previous.winRate;

      records.set(personId, sharesAreStale ? { ...fresh, winRate: carried } : fresh);
      settling.set(personId, { winRate: fresh.winRate, debateKey });
    }

    return { records, settling };
  }, [raw, sharesByDebateId, sharesAreStale]);

  // Committed after the render rather than inside the memo. The memo reads `settledRates.current`
  // for every person before it would have written, so the timing is unchanged — but a write during
  // render commits state for a render React is free to discard under concurrent scheduling.
  React.useEffect(() => {
    if (!sharesAreStale) settledRates.current = settling;
  }, [settling, sharesAreStale]);

  return records;
}

type SettledRate = { winRate: PersonRecord['winRate']; debateKey: string };

/** Pulls the aliased response back apart by position, which is how the aliases were assigned. */
export function readPersonRecords(response: PersonRecordsQuery, personIds: string[]): Map<string, RawRecord> {
  const records = new Map<string, RawRecord>();

  personIds.forEach((personId, index) => {
    const positions = response[personAlias(index, 'positions')] as
      | CountedConnection<{ objectId?: string | null }>
      | undefined;
    const supported = response[personAlias(index, 'supported')] as
      | CountedConnection<{ fromEntityId?: string | null }>
      | undefined;
    const opposed = response[personAlias(index, 'opposed')] as typeof supported;
    const joined = response[personAlias(index, 'joined')] as { createdAt?: string | null } | undefined;

    // Distinct claims, not rows. A claim answered on both the stance and the veracity axis is two
    // `userVotes` rows, and one answered in two spaces is two more — so a row count says a bigger
    // number than the positions the rest of the app shows for the same person.
    const positionClaimIds = new Set<string>();
    let positionRows = 0;
    for (const node of positions?.nodes ?? []) {
      if (!node?.objectId) continue;
      positionRows += 1;
      positionClaimIds.add(uuidToHex(node.objectId));
    }

    const debateIds = new Set<string>();
    let truncated = false;
    for (const side of [supported, opposed]) {
      let collected = 0;
      for (const node of side?.nodes ?? []) {
        if (!node?.fromEntityId) continue;
        collected += 1;
        debateIds.add(node.fromEntityId);
      }
      // Per side, not over the union: the two sides are paged independently, and a short page on
      // either one makes the record short.
      truncated = truncated || isShort(side, collected, DEBATE_RELATIONS_PER_SIDE);
    }

    records.set(personId, {
      positions: positionClaimIds.size,
      positionsTruncated: isShort(positions, positionRows, POSITIONS_PER_PERSON),
      debateIds: [...debateIds],
      truncated,
      createdAt: joined?.createdAt ?? null,
    });
  });

  return records;
}
