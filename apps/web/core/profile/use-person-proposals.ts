'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { mapActionTypeToProposalType } from '~/core/io/rest/schemas/proposal';
import { graphql } from '~/core/io/subgraph/graphql';
import type { ProposalStatus, ProposalType } from '~/core/io/substream-schema';
import { deriveProposalStatus } from '~/core/utils/utils';

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

const EMPTY_PAGE: PersonProposalsPage = { proposals: [], endCursor: null, hasNextPage: false, totalCount: 0 };

type ProposalNode = {
  id: string;
  spaceId: string;
  name: string | null;
  createdAt: string | null;
  executedAt: string | null;
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

interface ActionsResult {
  proposalActionsConnection: { nodes: { proposalId: string; actionType: string }[] } | null;
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
function personProposalsQuery(spaceId: string, first: number, after: string | null) {
  const sp = JSON.stringify(ID.hexToUuid(spaceId));
  const cursor = after ? `, after: ${JSON.stringify(after)}` : '';

  return `query {
    proposalsCurrentsConnection(
      filter: { proposedBy: { is: ${sp} } }
      orderBy: CREATED_AT_DESC
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

export function personProposalsQueryKey(spaceId: string) {
  return ['person-proposals', ID.uuidToHex(spaceId)] as const;
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
    console.error('[person-proposals] failed to fetch proposal action types:', result.left);
    return byId;
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
}: {
  /** The personal space. `proposedBy` is this, not the person entity. */
  spaceId: string;
  first?: number;
}) {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: personProposalsQueryKey(spaceId),
    enabled: spaceId !== '',
    initialPageParam: null as string | null,
    getNextPageParam: (page: PersonProposalsPage) => (page.hasNextPage ? page.endCursor : null),
    queryFn: async ({ pageParam, signal }): Promise<PersonProposalsPage> => {
      const result = await Effect.runPromise(
        Effect.either(
          graphql<NetworkResult>({
            query: personProposalsQuery(spaceId, first, pageParam),
            endpoint: Environment.getConfig().api,
            signal,
          })
        )
      );

      if (Either.isLeft(result)) {
        // Answered with nothing rather than thrown, like the rail's counts: this
        // is a record somebody is reading, and an empty tab beats an error page.
        console.error(`[person-proposals] failed to fetch proposals for ${spaceId}:`, result.left);
        return EMPTY_PAGE;
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
            status: deriveProposalStatus(node.executedAt, endTime),
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

  return { proposals, isLoading, isFetchingNextPage, hasNextPage: Boolean(hasNextPage), fetchNextPage };
}
