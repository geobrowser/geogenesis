'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { mapActionTypeToProposalType } from '~/core/io/rest/schemas/proposal';
import { graphql } from '~/core/io/subgraph/graphql';
import type { ProposalStatus, ProposalType } from '~/core/io/substream-schema';

/** One proposal this person made, wherever they made it. */
export type PersonProposal = {
  id: string;
  spaceId: string;
  /** Null for everything but an edit — the type names those instead. */
  name: string | null;
  type: ProposalType;
  status: ProposalStatus;
  /** Unix seconds. Zero means the indexer has not stamped one. */
  createdAt: number;
  /** Unix seconds. Zero until the first vote opens the window — see `proposalTimestampSeconds`. */
  startTime: number;
  endTime: number;
  yes: number;
  no: number;
  abstain: number;
};

export type PersonProposalsPage = {
  proposals: PersonProposal[];
  endCursor: string | null;
  hasNextPage: boolean;
  totalCount: number;
};

type ProposalNode = {
  id: string;
  spaceId: string;
  name: string | null;
  createdAt: string | null;
  executedAt: string | null;
  /** Set once a proposal can no longer be executed. The signal that separates
   *  "rejected" from "passed and waiting". */
  unexecutableAt: string | null;
  startTime: string | null;
  endTime: string | null;
  yesCount: string | null;
  noCount: string | null;
  abstainCount: string | null;
};

interface NetworkResult {
  proposalsCurrentsConnection: {
    totalCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null } | null;
    nodes: ProposalNode[];
  } | null;
}

/**
 * New or old.
 *
 * No Top here, and this one really is for want of a score: a proposal carries
 * none, unlike a claim or a debate. Ranking a governance record by its vote
 * tally instead would put a contested change above an uncontested one for no
 * reason a reader could name.
 */
export type ProposalSort = 'new' | 'old';

interface ActionsResult {
  proposalActionsConnection: { nodes: { proposalId: string; actionType: string }[] } | null;
}

/**
 * A proposal's outcome, from `proposals_current`.
 *
 * Not `deriveProposalStatus`, which this used at first. That helper takes
 * `(executedAt, endTime)` and cannot do better than it does with them: with no
 * execution and the window closed it must guess, and it guesses REJECTED. So a
 * proposal that **passed and is waiting to be executed** reads as one that
 * failed — the state the REST API models explicitly as `EXECUTABLE` and maps to
 * `PROPOSED` (`mapProposalStatus`).
 *
 * This view carries the signal that settles it: `unexecutableAt`, set when a
 * proposal can no longer be executed. With that plus the tally there is nothing
 * left to guess.
 *
 * Rare, and real: 2 of 20,000 proposals scanned across the graph are ended,
 * passed and unexecuted, and 23 carry `unexecutableAt`. Rare is the reason it
 * survived review, not a reason to leave it — the rows it gets wrong are a
 * governance record stating that somebody's accepted proposal was rejected.
 *
 * `fetch-proposals-by-user.ts` has the same limitation and is untouched here: it
 * is pre-existing, and its query does not select `unexecutableAt` either.
 */
export function proposalStatusFromCurrent(
  node: Pick<ProposalNode, 'executedAt' | 'unexecutableAt' | 'endTime' | 'yesCount' | 'noCount' | 'abstainCount'>,
  now = Math.floor(Date.now() / 1000)
): ProposalStatus {
  if (node.executedAt) return 'ACCEPTED';
  if (node.unexecutableAt) return 'REJECTED';

  const endTime = Number(node.endTime ?? 0);
  // v2 contracts open the window on the first vote, so a zero `endTime` is "not
  // started" rather than "long over" — reading it the other way reported every
  // fresh proposal as rejected.
  if (endTime === 0 || endTime >= now) return 'PROPOSED';

  const yes = Number(node.yesCount ?? 0);
  const total = yes + Number(node.noCount ?? 0) + Number(node.abstainCount ?? 0);

  // Ended with a majority and nothing saying it cannot be executed: awaiting
  // execution, which is `PROPOSED` here exactly as `EXECUTABLE` is upstream.
  return total > 0 && yes * 2 > total ? 'PROPOSED' : 'REJECTED';
}

/**
 * Every proposal a person made, across every space (GEO-2859).
 *
 * `proposedBy` is the personal space id, the same id the rail counts and the
 * route carries — not the person entity.
 *
 * Unscoped to a space on purpose. The governance list is space-scoped by
 * construction, and a person's proposals are not: 765 across 21 spaces on the
 * reference account, so narrowing to the space you happen to be standing in
 * would contradict the count in the rail beside it.
 *
 * `proposalsCurrents` is a view joining each proposal to its current version,
 * which is where the name, window and tally live — so the whole card comes back
 * in one cursor-paged request rather than a join per row.
 */
function personProposalsQuery(
  spaceId: string,
  first: number,
  after: string | null,
  sort: ProposalSort,
  spaceIds: readonly string[]
) {
  const sp = JSON.stringify(ID.hexToUuid(spaceId));
  const cursor = after ? `, after: ${JSON.stringify(after)}` : '';

  // Narrowed by the server, so the filter applies to all 770 rather than to the
  // pages already scrolled past. Spaces are OR, matching every other
  // multi-select on these tabs.
  const spaceClause =
    spaceIds.length > 0 ? `, spaceId: { in: ${JSON.stringify(spaceIds.map(id => ID.hexToUuid(id)))} }` : '';

  return `query {
    proposalsCurrentsConnection(
      filter: { proposedBy: { is: ${sp} }${spaceClause} }
      orderBy: ${sort === 'old' ? 'CREATED_AT_ASC' : 'CREATED_AT_DESC'}
      first: ${first}${cursor}
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        spaceId
        name
        createdAt
        executedAt
        unexecutableAt
        startTime
        endTime
        yesCount
        noCount
        abstainCount
      }
    }
  }`;
}

/**
 * What the unnamed ones did.
 *
 * Only an edit carries a name. Adding an editor, verifying a space or changing
 * the voting settings all arrive nameless, and the action is the only record of
 * which it was — so rows that have a name skip this second request entirely.
 */
function proposalActionsQuery(proposalIds: string[]) {
  const ids = proposalIds.map(id => JSON.stringify(ID.hexToUuid(id))).join(', ');

  return `query {
    proposalActionsConnection(filter: { proposalId: { in: [${ids}] } }) {
      nodes { proposalId actionType }
    }
  }`;
}

export function personProposalsQueryKey(spaceId: string, sort: ProposalSort, spaceIds: readonly string[]) {
  // The space selection is sorted into the key rather than taken as given, so
  // picking two spaces in either order is one cache entry rather than two.
  return ['person-proposals', ID.uuidToHex(spaceId), sort, [...spaceIds].sort().join(',')] as const;
}

async function fetchActionTypes(proposalIds: string[], signal?: AbortSignal): Promise<Map<string, ProposalType>> {
  const byId = new Map<string, ProposalType>();
  if (proposalIds.length === 0) return byId;

  const result = await Effect.runPromise(
    Effect.either(
      graphql<ActionsResult>({
        query: proposalActionsQuery(proposalIds),
        endpoint: Environment.getConfig().api,
        signal,
      })
    )
  );

  if (Either.isLeft(result)) {
    // Thrown rather than answered empty. For an unnamed proposal the action
    // *is* the title — `getProposalName` has nothing else to work from — so an
    // empty map does not degrade the row, it relabels it: every membership
    // change becomes "ADD_EDIT" and renders as a raw uuid. A tab that says it
    // could not load is the honest version of that.
    console.error('[person-proposals] failed to fetch proposal action types:', result.left);
    throw result.left;
  }

  // A proposal can carry several actions; the first stands for the proposal, the
  // same way the governance list reads it.
  for (const node of result.right.proposalActionsConnection?.nodes ?? []) {
    const key = ID.uuidToHex(node.proposalId);
    if (!byId.has(key)) byId.set(key, mapActionTypeToProposalType(node.actionType));
  }

  return byId;
}

export function usePersonProposals({
  spaceId,
  first = 20,
  sort = 'new',
  spaceIds = [],
}: {
  /** The personal space. `proposedBy` is this, not the person entity. */
  spaceId: string;
  first?: number;
  sort?: ProposalSort;
  /** Spaces the proposals landed in. Empty means every one of them. */
  spaceIds?: readonly string[];
}) {
  const { data, isLoading, isError, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: personProposalsQueryKey(spaceId, sort, spaceIds),
    enabled: spaceId !== '',
    initialPageParam: null as string | null,
    getNextPageParam: (page: PersonProposalsPage) => (page.hasNextPage ? page.endCursor : null),
    queryFn: async ({ pageParam, signal }): Promise<PersonProposalsPage> => {
      const result = await Effect.runPromise(
        Effect.either(
          graphql<NetworkResult>({
            query: personProposalsQuery(spaceId, first, pageParam, sort, spaceIds),
            endpoint: Environment.getConfig().api,
            signal,
          })
        )
      );

      if (Either.isLeft(result)) {
        // Thrown, not swallowed. Answering `EMPTY_PAGE` here made a failed
        // request indistinguishable from a person who has never proposed
        // anything — the tab printed "No proposals yet" over it, and the error
        // state that exists to say otherwise could never fire.
        console.error(`[person-proposals] failed to fetch proposals for ${spaceId}:`, result.left);
        throw result.left;
      }

      const connection = result.right.proposalsCurrentsConnection;
      const nodes = connection?.nodes ?? [];

      const actionTypes = await fetchActionTypes(
        nodes.filter(node => node.name === null).map(node => node.id),
        signal
      );

      return {
        proposals: nodes.map(node => {
          const endTime = Number(node.endTime ?? 0);

          return {
            id: ID.uuidToHex(node.id),
            spaceId: ID.uuidToHex(node.spaceId),
            name: node.name,
            type: node.name !== null ? 'ADD_EDIT' : (actionTypes.get(ID.uuidToHex(node.id)) ?? 'ADD_EDIT'),
            status: proposalStatusFromCurrent(node),
            createdAt: Number(node.createdAt ?? 0),
            startTime: Number(node.startTime ?? 0),
            endTime,
            yes: Number(node.yesCount ?? 0),
            no: Number(node.noCount ?? 0),
            abstain: Number(node.abstainCount ?? 0),
          } satisfies PersonProposal;
        }),
        endCursor: connection?.pageInfo?.endCursor ?? null,
        hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
        totalCount: connection?.totalCount ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const proposals = React.useMemo(() => (data?.pages ?? []).flatMap(page => page.proposals), [data]);

  return { proposals, isLoading, isError, isFetchingNextPage, hasNextPage: Boolean(hasNextPage), fetchNextPage };
}
