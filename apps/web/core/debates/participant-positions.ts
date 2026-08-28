'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { decodeActiveResponseDirection, responseKindToVoteKind } from '~/core/responses/entity-response';

import type { DebateRematchParticipant, DebateResponseKind } from './api';
import { claimResponseIndexedEvent } from './claim-response-indexed-notifier';
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

export async function fetchParticipantPositions(
  profileSpaceIds: string[],
  signal?: AbortSignal,
  fetchPage: FetchPage = defaultFetchPage
): Promise<ParticipantPosition[]> {
  if (profileSpaceIds.length === 0) return [];
  const filter = {
    userId: { in: profileSpaceIds },
    objectType: { is: 0 },
    // Active responses only: a withdrawn one is a different vote type and means "no side".
    voteType: { in: [0, 1] },
    voteKind: { in: [...VOTE_KIND_TO_RESPONSE_KIND.keys()] },
  };

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

export function useParticipantPositions(participants: DebateRematchParticipant[]) {
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

  const byClaim = React.useMemo(() => groupParticipantPositions(query.data ?? []), [query.data]);

  return { byClaim, isLoading: query.isLoading, error: query.error };
}
