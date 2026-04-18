import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { Schema } from 'effect';

import { Environment } from '../environment';
import { getSpacesWhereMember } from './queries';
import {
  type ApiProposalListItem,
  ApiProposalListResponseSchema,
  encodePathSegment,
  restFetch,
} from './rest';
import { isValidUUID, spaceIdToGraphqlUuid } from './rest/validation';
import { fetchEditorSpaceIds } from './subgraph/fetch-editor-space-ids';
import { graphql } from './subgraph/graphql';

export type SidebarCounts = {
  myProposals: { inProgress: number; accepted: number; rejected: number };
  votedOn: { accepted: number; rejected: number };
  iHaveAccepted: { members: number; editors: number };
};

const EMPTY_COUNTS: SidebarCounts = {
  myProposals: { inProgress: 0, accepted: 0, rejected: 0 },
  votedOn: { accepted: 0, rejected: 0 },
  iHaveAccepted: { members: 0, editors: 0 },
};

type MyProposalStatsResult = {
  myInProgress: { totalCount: number };
  myAccepted: { totalCount: number };
  myRejected: { totalCount: number };
};

/** Proposals you created — GraphQL `proposedBy` filter is supported on this API. */
function buildMyProposalStatsQuery(spaceId: string, nowSeconds: string): string {
  return `query {
    myInProgress: proposalsConnection(
      filter: {
        proposedBy: { is: "${spaceId}" }
        executedAt: { isNull: true }
        endTime: { greaterThanOrEqualTo: "${nowSeconds}" }
      }
    ) {
      totalCount
    }

    myAccepted: proposalsConnection(
      filter: {
        proposedBy: { is: "${spaceId}" }
        executedAt: { isNull: false }
      }
    ) {
      totalCount
    }

    myRejected: proposalsConnection(
      filter: {
        proposedBy: { is: "${spaceId}" }
        executedAt: { isNull: true }
        endTime: { lessThan: "${nowSeconds}" }
      }
    ) {
      totalCount
    }
  }`;
}

const REST_PAGE_SIZE = 100;
const MAX_PAGES_PER_SPACE = 40;

async function fetchProposalPagesForSpace({
  spaceId,
  memberSpaceId,
  status,
}: {
  spaceId: string;
  memberSpaceId: string;
  status: 'ACCEPTED' | 'REJECTED';
}): Promise<readonly ApiProposalListItem[]> {
  const config = Environment.getConfig();
  const out: ApiProposalListItem[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES_PER_SPACE; page++) {
    const params = new URLSearchParams();
    params.set('limit', String(REST_PAGE_SIZE));
    params.set('status', status);
    params.set('orderBy', 'end_time');
    params.set('orderDirection', 'desc');
    if (isValidUUID(memberSpaceId)) {
      params.set('voterId', memberSpaceId);
    }
    if (cursor) {
      params.set('cursor', cursor);
    }

    const path = `/proposals/space/${encodePathSegment(spaceId)}/status?${params.toString()}`;

    const result = await Effect.runPromise(
      Effect.either(
        restFetch<unknown>({
          endpoint: config.api,
          path,
        })
      )
    );

    if (Either.isLeft(result)) {
      console.error(`fetchSidebarCounts REST proposals for space ${spaceId} (${status}):`, result.left);
      break;
    }

    const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

    if (Either.isLeft(decoded)) {
      console.error(`fetchSidebarCounts decode proposals for space ${spaceId}:`, decoded.left);
      break;
    }

    out.push(...decoded.right.proposals);
    cursor = decoded.right.nextCursor ?? undefined;
    if (!cursor) break;
  }

  return out;
}

/**
 * Vote-related sidebar metrics: the GraphQL API does not expose `proposal` on `ProposalVoteFilter`,
 * so we aggregate from REST (`voterId` + per-space lists) across spaces the user can act in.
 */
async function fetchVoteBasedSidebarCountsRest(memberSpaceId: string): Promise<{
  votedOnAccepted: number;
  votedOnRejected: number;
  acceptedMembers: number;
  acceptedEditors: number;
}> {
  if (!isValidUUID(memberSpaceId)) {
    return { votedOnAccepted: 0, votedOnRejected: 0, acceptedMembers: 0, acceptedEditors: 0 };
  }

  const [editorIds, memberSpaces] = await Promise.all([
    fetchEditorSpaceIds(memberSpaceId),
    Effect.runPromise(getSpacesWhereMember(memberSpaceId)),
  ]);

  const spaceIds = [...new Set([...editorIds, ...memberSpaces.map(s => s.id)])];

  let votedOnAccepted = 0;
  let votedOnRejected = 0;
  let acceptedMembers = 0;
  let acceptedEditors = 0;

  for (const spaceId of spaceIds) {
    const [accepted, rejected] = await Promise.all([
      fetchProposalPagesForSpace({ spaceId, memberSpaceId, status: 'ACCEPTED' }),
      fetchProposalPagesForSpace({ spaceId, memberSpaceId, status: 'REJECTED' }),
    ]);

    for (const p of accepted) {
      if (p.userVote == null) continue;
      votedOnAccepted += 1;
      if (p.userVote === 'YES') {
        const actionType = p.actions[0]?.actionType;
        if (actionType === 'ADD_MEMBER') acceptedMembers += 1;
        if (actionType === 'ADD_EDITOR') acceptedEditors += 1;
      }
    }

    for (const p of rejected) {
      if (p.userVote != null) {
        votedOnRejected += 1;
      }
    }
  }

  return { votedOnAccepted, votedOnRejected, acceptedMembers, acceptedEditors };
}

export async function fetchSidebarCounts(spaceId: string): Promise<SidebarCounts> {
  const gqlSpaceId = spaceIdToGraphqlUuid(spaceId);

  const myProposalsEffect = graphql<MyProposalStatsResult>({
    endpoint: Environment.getConfig().api,
    query: buildMyProposalStatsQuery(gqlSpaceId, Math.floor(Date.now() / 1000).toString()),
  });

  const [myResult, voteRest] = await Promise.all([
    Effect.runPromise(Effect.either(myProposalsEffect)),
    fetchVoteBasedSidebarCountsRest(spaceId),
  ]);

  if (Either.isLeft(myResult)) {
    logBatchError('my proposals', myResult.left);
    return EMPTY_COUNTS;
  }

  const my = myResult.right;

  return {
    myProposals: {
      inProgress: my.myInProgress.totalCount,
      accepted: my.myAccepted.totalCount,
      rejected: my.myRejected.totalCount,
    },
    votedOn: {
      accepted: voteRest.votedOnAccepted,
      rejected: voteRest.votedOnRejected,
    },
    iHaveAccepted: {
      members: voteRest.acceptedMembers,
      editors: voteRest.acceptedEditors,
    },
  };
}

function logBatchError(label: string, error: { _tag: string; message?: string }) {
  switch (error._tag) {
    case 'GraphqlRuntimeError':
      console.error(`fetchSidebarCounts ${label} GraphQL error:`, error.message);
      break;
    default:
      console.error(`${error._tag}: Unable to fetch sidebar counts (${label})`);
      break;
  }
}
