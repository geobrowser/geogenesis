'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { hashKey, keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { decodeActiveResponseDirection, responseKindToVoteKind } from '~/core/responses/entity-response';

import type { DebateRematchParticipant, DebateResponseKind } from './api';
import { claimResponseIndexedEvent, pendingClaimResponse } from './claim-response-indexed-notifier';
import { useDebateAttention } from './debate-attention';

/**
 * Both participants' positions on every claim, read straight from the knowledge graph.
 *
 * A position is an on-chain claim response; geo-chat only mirrors them (and learns about half of
 * them from this very client, via `notifyClaimResponseIndexed`). Asking the graph directly skips
 * that round trip, and the `userVotes` table answers "everything these two people have responded
 * to" in one query — a couple of hundred rows at most — where the rematch endpoint had to be asked
 * about claims a hundred ids at a time.
 */
export const PARTICIPANT_POSITIONS_QUERY_ROOT = 'participant-positions';

/** How often the list re-asks while the picker is in the foreground. */
const PARTICIPANT_POSITIONS_POLL_MS = 20_000;

const PAGE_SIZE = 500;

export type ParticipantPosition = {
  /** The responder's personal space id — what the graph keys responses on. */
  profileSpaceId: string;
  claimId: string;
  /** The space the response was published against. */
  spaceId: string;
  responseKind: DebateResponseKind;
  position: boolean;
};

export type ParticipantPositionsByClaim = Map<string, ParticipantPosition[]>;

export function participantPositionsQueryKey(profileSpaceIds: string[]) {
  return [PARTICIPANT_POSITIONS_QUERY_ROOT, [...profileSpaceIds].sort()] as const;
}

export function isParticipantPositionsQueryKey(queryKey: readonly unknown[]) {
  return queryKey[0] === PARTICIPANT_POSITIONS_QUERY_ROOT;
}

const VOTE_KIND_TO_RESPONSE_KIND = new Map<number, DebateResponseKind>([
  [responseKindToVoteKind('stance'), 'stance'],
  [responseKindToVoteKind('veracity'), 'veracity'],
]);

/**
 * Hand-written rather than generated so it doesn't require regenerating `gql.ts`. The generated
 * `ClaimResponseSummaries` document is the same table without `spaceId`, and the space matters
 * here: a response counts only in the space the claim lives in.
 */
const PARTICIPANT_POSITIONS_SOURCE = /* GraphQL */ `
  query ParticipantPositions($filter: UserVoteFilter!, $first: Int!, $offset: Int!) {
    userVotes(filter: $filter, first: $first, offset: $offset, orderBy: [VOTED_AT_DESC, OBJECT_ID_ASC]) {
      userId
      objectId
      spaceId
      voteType
      voteKind
    }
  }
`;

type ParticipantPositionRow = { userId: string; objectId: string; spaceId: string; voteType: number; voteKind: number };
type ParticipantPositionsFilter = {
  userId: { in: string[] };
  objectType: { is: number };
  voteType: { in: number[] };
  voteKind: { in: number[] };
};
const participantPositionsDocument = parse(PARTICIPANT_POSITIONS_SOURCE) as TypedDocumentNode<
  { userVotes: Array<ParticipantPositionRow | null> | null },
  { filter: ParticipantPositionsFilter; first: number; offset: number }
>;

type FetchPage = (
  filter: ParticipantPositionsFilter,
  first: number,
  offset: number,
  signal?: AbortSignal
) => Promise<ParticipantPositionRow[]>;

function defaultFetchPage(filter: ParticipantPositionsFilter, first: number, offset: number, signal?: AbortSignal) {
  return Effect.runPromise(
    graphql({
      query: participantPositionsDocument,
      decoder: data =>
        (data.userVotes ?? []).flatMap(row =>
          row
            ? [{ ...row, userId: String(row.userId), objectId: String(row.objectId), spaceId: String(row.spaceId) }]
            : []
        ),
      variables: { filter, first, offset },
      signal,
    })
  );
}

/**
 * The `userVotes` rows that count as a position someone currently holds.
 *
 * Exported because the People tab counts the same rows and must not drift from what this reads:
 * kind 0 is curation rather than a position, a withdrawn response is a different *vote type* and
 * means "no side", and `objectType` 0 keeps this to responses on claims.
 */
export const POSITION_VOTE_FILTER = {
  objectType: { is: 0 },
  voteType: { in: [0, 1] },
  voteKind: { in: [...VOTE_KIND_TO_RESPONSE_KIND.keys()] },
};

export async function fetchParticipantPositions(
  profileSpaceIds: string[],
  signal?: AbortSignal,
  fetchPage: FetchPage = defaultFetchPage
): Promise<ParticipantPosition[]> {
  if (profileSpaceIds.length === 0) return [];
  const filter = { userId: { in: profileSpaceIds }, ...POSITION_VOTE_FILTER };

  const rows: ParticipantPositionRow[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchPage(filter, PAGE_SIZE, offset, signal);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows.flatMap(row => {
    const direction = decodeActiveResponseDirection(row.voteType);
    const responseKind = VOTE_KIND_TO_RESPONSE_KIND.get(row.voteKind);
    if (!direction || !responseKind) return [];
    return [
      {
        profileSpaceId: row.userId,
        claimId: row.objectId,
        spaceId: row.spaceId,
        responseKind,
        position: direction === 'positive',
      },
    ];
  });
}

export function groupParticipantPositions(positions: ParticipantPosition[]): ParticipantPositionsByClaim {
  const byClaim: ParticipantPositionsByClaim = new Map();
  for (const position of positions) {
    const existing = byClaim.get(position.claimId);
    if (existing) existing.push(position);
    else byClaim.set(position.claimId, [position]);
  }
  return byClaim;
}

/**
 * The side each session participant holds on a claim, in the space the claim lives in. A response
 * in some other space that merely cites the claim doesn't count — geo-chat validates a request
 * against the home space, and the card publishes there.
 */
export function participantSidesOn(
  positionsByClaim: ParticipantPositionsByClaim,
  claimId: string,
  spaceId: string,
  participants: DebateRematchParticipant[]
) {
  const rows = positionsByClaim.get(claimId) ?? [];
  return participants.map(participant => {
    const row = rows.find(
      position => sameId(position.profileSpaceId, participant.profile_space_id) && sameId(position.spaceId, spaceId)
    );
    return { participant, position: row?.position ?? null, responseKind: row?.responseKind ?? null };
  });
}

function sameId(left: string, right: string) {
  return left.replace(/-/g, '').toLowerCase() === right.replace(/-/g, '').toLowerCase();
}

/**
 * A position the viewer's own client knows about before the graph does.
 *
 * `position: null` is a removal, which the merge resolves by deleting the fetched row rather than
 * adding one — so this cannot be a `ParticipantPosition`, whose `position` is the side someone
 * holds.
 */
export type PendingParticipantPosition = Omit<ParticipantPosition, 'position'> & { position: boolean | null };

/** A confirmed position retained until this query's own fetch accounts for it. */
type SettlingPosition = { row: PendingParticipantPosition; retiredAt: number };

/**
 * How long a confirmed row is held while the fetched list still disagrees.
 *
 * Longer than a poll interval, so the ordinary case is decided by agreement rather than by this;
 * short enough that a row whose write silently vanished stops being asserted. Only reachable when
 * the graph confirmed the write and then kept answering without it.
 */
const SETTLING_MAX_HOLD_MS = 30_000;

/** Whether the fetched list already says what a retained row says, so the row has nothing left to do. */
function fetchedAgrees(fetched: ParticipantPosition[], row: PendingParticipantPosition) {
  const match = fetched.find(candidate => positionKey(candidate) === positionKey(row));
  return row.position === null ? match === undefined : match?.position === row.position;
}

/**
 * The viewer's own in-flight responses, as positions (GEO-2784).
 *
 * Reads the `entity-response-indexing` entries this browser has in flight and turns each one into
 * the position it is about to become. Without this the viewer waits on their own write before the
 * UI reacts — p50 9.9s, p95 48.6s (`web.write.entity_response`) — which is what makes the
 * "request debate" button feel broken after clicking a position.
 *
 * Subscribed rather than read once: the pending set changes as writes start and settle, and none
 * of those transitions re-render this hook on their own.
 *
 * ## Why a row outlives the snapshot it came from (GEO-2807)
 *
 * A confirmed row stays overlaid after its snapshot is retired, because retirement happens when the
 * *write* is confirmed and this query is only invalidated at that moment — an invalidation is a
 * fetch starting, not a fetch landing. Dropping the overlay there leaves a gap where the position is
 * in neither place, which is the flicker; on a removal the stale row reappears instead.
 *
 * A retained row is released when this query's own data agrees with it — not merely when newer data
 * arrives. `dataUpdatedAt` is when a response *landed*, so a poll already in flight when the write
 * confirmed would otherwise release the overlay onto rows fetched before it, which is the flicker
 * again. Nor can a disagreeing fetch be read as "the write did not survive": the invalidation that
 * follows `indexed` often issues its fetch *after* the retirement, and `userVotes` can trail the
 * read that confirmed the write. So disagreement means "not yet", bounded by {@link SETTLING_MAX_HOLD_MS}
 * so a row cannot outlive its usefulness if the two never agree.
 *
 * A response that returns to idle without ever reaching `indexed` was rolled back by a failed
 * publish, and is dropped rather than retained.
 */
function useOwnPendingPositions(
  localProfileSpaceId: string | null | undefined,
  /** This hook's own query, watched for the fetches that release a retained row. */
  queryKey: readonly unknown[]
): PendingParticipantPosition[] {
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<PendingParticipantPosition[]>([]);
  const [settling, setSettling] = React.useState<SettlingPosition[]>([]);
  // Track the previous cache state to identify confirmed snapshots that were retired.
  const lastRead = React.useRef(new Map<string, { row: PendingParticipantPosition; indexed: boolean }>());
  const lastViewer = React.useRef(localProfileSpaceId);
  const queryHash = hashKey(queryKey);

  React.useEffect(() => {
    // A different viewer — or none — inherits nothing. Without this, signing out retires the
    // outgoing viewer's rows into the retained set and keeps overlaying them.
    if (lastViewer.current !== localProfileSpaceId) {
      lastViewer.current = localProfileSpaceId;
      lastRead.current = new Map();
      setSettling(current => (current.length === 0 ? current : []));
    }
    const cache = queryClient.getQueryCache();

    const read = () => {
      const rows: PendingParticipantPosition[] = [];
      const seen = new Map<string, { row: PendingParticipantPosition; indexed: boolean }>();
      for (const query of cache.getAll()) {
        const parsed = pendingClaimResponse(query.queryKey, query.state.data);
        // Attributed to whoever made the write, and kept only while that is this viewer. Stamping
        // the current viewer onto every row instead would hand one account's response to the next.
        if (!parsed || !localProfileSpaceId || !sameId(parsed.personalSpaceId, localProfileSpaceId)) continue;
        const row: PendingParticipantPosition = {
          profileSpaceId: parsed.personalSpaceId,
          claimId: parsed.entityId,
          spaceId: parsed.spaceId,
          responseKind: parsed.responseKind,
          // `null` means the viewer is *removing* the position. Carried through as a tombstone and
          // resolved in the merge below, because dropping it here would let the stale fetched row
          // keep the position visible until the next refetch.
          position: parsed.position,
        };
        rows.push(row);
        seen.set(positionKey(row), { row, indexed: parsed.status === 'indexed' });
      }

      const retiredAt = Date.now();
      const retired = [...lastRead.current]
        .filter(([key, previous]) => !seen.has(key) && previous.indexed)
        .map(([, previous]) => ({ row: previous.row, retiredAt }));
      lastRead.current = seen;

      if (retired.length > 0) {
        const held = new Set(retired.map(entry => positionKey(entry.row)));
        setSettling(current => [...current.filter(entry => !held.has(positionKey(entry.row))), ...retired]);
      }
      // Referential stability matters: this feeds a `useMemo` that regroups every position.
      setPending(current => (samePositions(current, rows) ? current : rows));
    };

    read();
    return cache.subscribe(event => {
      // Every event, not only `updated`. An `entity-response-indexing` query has no observers, so
      // it is garbage collected on its own schedule — and a `removed` this hook ignored left the
      // row overlaid for the rest of the session, outside the retention rule entirely.
      if (event.query.queryKey[0] === 'entity-response-indexing') {
        read();
        return;
      }

      if (event.query.queryHash !== queryHash) return;
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const fetched = (event.query.state.data ?? []) as ParticipantPosition[];
      const now = Date.now();
      setSettling(current => {
        const held = current.filter(
          entry => !fetchedAgrees(fetched, entry.row) && now - entry.retiredAt < SETTLING_MAX_HOLD_MS
        );
        return held.length === current.length ? current : held;
      });
    });
  }, [localProfileSpaceId, queryClient, queryHash]);

  // Apply active responses after retained responses so newer input takes precedence.
  return React.useMemo(
    () => (settling.length === 0 ? pending : [...settling.map(entry => entry.row), ...pending]),
    [pending, settling]
  );
}

function samePositions(a: PendingParticipantPosition[], b: PendingParticipantPosition[]) {
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    return (
      row.claimId === other.claimId &&
      row.spaceId === other.spaceId &&
      row.responseKind === other.responseKind &&
      row.position === other.position &&
      row.profileSpaceId === other.profileSpaceId
    );
  });
}

/**
 * Key a position by who took it, on what, where, in which kind — the identity the graph enforces.
 *
 * `spaceId` is part of it because a response is space-scoped and `participantSidesOn` reads it that
 * way: without it an overlay for a claim in one space evicts the fetched row for the same claim in
 * another, and that side then reads as no position at all.
 */
function positionKey(row: Pick<ParticipantPosition, 'profileSpaceId' | 'claimId' | 'spaceId' | 'responseKind'>) {
  const bare = (id: string) => id.replace(/-/g, '').toLowerCase();
  return `${bare(row.profileSpaceId)}|${bare(row.claimId)}|${bare(row.spaceId)}|${row.responseKind}`;
}

/**
 * Fetched rows, with the viewer's in-flight writes applied on top.
 *
 * A pending write is by definition newer than anything the query returned, so it wins — and a
 * pending *removal* (`position === null`) deletes the row rather than adding one. Once the write
 * lands and the refetch arrives the two agree, so the overlay stops being visible without needing
 * to be torn down.
 */
export function applyPendingPositions(
  fetched: ParticipantPosition[],
  pending: PendingParticipantPosition[]
): ParticipantPosition[] {
  if (pending.length === 0) return fetched;
  const merged = new Map(fetched.map(row => [positionKey(row), row]));
  for (const row of pending) {
    const { position } = row;
    if (position === null) merged.delete(positionKey(row));
    else merged.set(positionKey(row), { ...row, position });
  }
  return [...merged.values()];
}

export function useParticipantPositions(
  participants: DebateRematchParticipant[],
  /** The viewer's own personal space id, so their in-flight writes can be shown immediately. */
  localProfileSpaceId?: string | null
) {
  const queryClient = useQueryClient();
  const foreground = useDebateAttention();
  const profileSpaceIds = React.useMemo(
    () => [...new Set(participants.map(participant => participant.profile_space_id))].sort(),
    [participants]
  );
  const queryKey = React.useMemo(() => participantPositionsQueryKey(profileSpaceIds), [profileSpaceIds]);

  // The viewer's own response lands in the graph a beat before anyone tells geo-chat about it;
  // the indexing snapshot turning `indexed` is that beat, so re-ask then rather than wait on the
  // socket to echo it back.
  React.useEffect(() => {
    if (profileSpaceIds.length === 0) return;
    return queryClient.getQueryCache().subscribe(event => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      if (!claimResponseIndexedEvent(event.query.queryKey, event.query.state.data)) return;
      void queryClient.invalidateQueries({ queryKey });
    });
  }, [profileSpaceIds.length, queryClient, queryKey]);

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchParticipantPositions(profileSpaceIds, signal),
    enabled: profileSpaceIds.length > 0,
    // `debate.claims_changed` only reaches this tab for spaces it holds a scope on; the opponent
    // can respond somewhere it doesn't, and that claim should still turn up. A slow poll covers it.
    refetchInterval: foreground ? PARTICIPANT_POSITIONS_POLL_MS : false,
    staleTime: 5_000,
    /**
     * Hold the last list while a new one is fetched (GEO-2599). Preston: "randomly the positions
     * also dissapear. I just lost all of Dovile's positions without doing anything whilst I was
     * typing."
     *
     * Without this, `query.data` is `undefined` for any key the cache has not seen, and `byClaim`
     * below collapses to an empty map — so the whole list blanks rather than showing the previous
     * answer. The trigger does not have to be a real change: `enabled` is `profileSpaceIds.length >
     * 0`, so a session refetch that momentarily yields no participants swaps to the empty-ids key,
     * which has no data, and every position vanishes with nothing having actually happened.
     *
     * Stale rows cannot leak to the wrong people, which is what makes this safe rather than merely
     * nicer: every read goes through `participantSidesOn`, which matches on the *current*
     * participants' profile space ids, so a row belonging to someone no longer here is filtered out
     * rather than displayed.
     *
     * Note the key itself is already stable — `profileSpaceIds` is deduped and sorted, and React
     * Query hashes keys structurally, so a session refetch returning an equal-but-new array is the
     * same cache entry. This is for the cases where the key genuinely differs.
     */
    placeholderData: keepPreviousData,
  });

  // The key, not `query.dataUpdatedAt`: reading that timestamp makes it a tracked property, and it
  // changes on every poll — so the whole page re-rendered every 20s for a refetch that returned the
  // same rows.
  const ownPending = useOwnPendingPositions(localProfileSpaceId, queryKey);
  const byClaim = React.useMemo(
    () => groupParticipantPositions(applyPendingPositions(query.data ?? [], ownPending)),
    [query.data, ownPending]
  );

  return { byClaim, isLoading: query.isLoading, error: query.error };
}
