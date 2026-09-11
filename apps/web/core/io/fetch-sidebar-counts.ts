import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '../environment';
import { isValidUUID, spaceIdToGraphqlUuid } from './rest/validation';
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

/**
 * Proposals you created — GraphQL `proposedBy` filter is supported on this API.
 *
 * proposalsCurrents joins each proposal with its *current* version, so endTime
 * is the live voting window and multi-version proposals can't land in two
 * buckets. v2 encodes "not-yet-voted" as `endTime = 0` (voting window opens on
 * the first vote), so a fresh proposal counts as In Progress, not Rejected.
 */
function buildMyProposalStatsQuery(spaceId: string, nowSeconds: string): string {
  return `query {
    myInProgress: proposalsCurrentsConnection(
      filter: {
        proposedBy: { is: "${spaceId}" }
        executedAt: { isNull: true }
        or: [{ endTime: { is: "0" } }, { endTime: { greaterThan: "${nowSeconds}" } }]
      }
    ) {
      totalCount
    }

    myAccepted: proposalsCurrentsConnection(
      filter: {
        proposedBy: { is: "${spaceId}" }
        executedAt: { isNull: false }
      }
    ) {
      totalCount
    }

    myRejected: proposalsCurrentsConnection(
      filter: {
        proposedBy: { is: "${spaceId}" }
        executedAt: { isNull: true }
        endTime: { lessThan: "${nowSeconds}", greaterThan: "0" }
      }
    ) {
      totalCount
    }
  }`;
}

const VOTE_PAGE_SIZE = 1000;
const MAX_VOTE_PAGES = 50;

type ProposalVoteNode = {
  vote: 'YES' | 'NO' | 'ABSTAIN' | null;
  proposalId: string;
  proposalVersionByProposalIdAndProposalVersion: {
    endTime: string | null;
    proposal: { executedAt: string | null } | null;
    proposalActionsByProposalIdAndProposalVersionConnection: {
      nodes: { actionType: string }[];
    } | null;
  } | null;
};

type ProposalVotesPage = {
  proposalVotesConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ProposalVoteNode[];
  };
};

function buildMyVotesQuery(voterId: string, after: string | null): string {
  return `query {
    proposalVotesConnection(
      first: ${VOTE_PAGE_SIZE}
      orderBy: PROPOSAL_ID_ASC
      ${after ? `after: "${after}"` : ''}
      filter: { voterId: { is: "${voterId}" } }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        vote
        proposalId
        proposalVersionByProposalIdAndProposalVersion {
          endTime
          proposal { executedAt }
          proposalActionsByProposalIdAndProposalVersionConnection { nodes { actionType } }
        }
      }
    }
  }`;
}

async function fetchMyVotesPage(
  endpoint: string,
  voterId: string,
  after: string | null
): Promise<ProposalVotesPage['proposalVotesConnection'] | null> {
  const effect = graphql<ProposalVotesPage>({ endpoint, query: buildMyVotesQuery(voterId, after) });
  const result = await Effect.runPromise(Effect.either(effect));

  if (Either.isLeft(result)) {
    logBatchError('votes cast', result.left);
    return null;
  }

  return result.right.proposalVotesConnection;
}

/**
 * Vote-related sidebar metrics, computed from the viewer's OWN proposal votes.
 */
async function fetchVoteBasedSidebarCounts(memberSpaceId: string): Promise<{
  votedOnAccepted: number;
  votedOnRejected: number;
  acceptedMembers: number;
  acceptedEditors: number;
}> {
  const empty = { votedOnAccepted: 0, votedOnRejected: 0, acceptedMembers: 0, acceptedEditors: 0 };
  if (!isValidUUID(memberSpaceId)) return empty;

  const voterId = spaceIdToGraphqlUuid(memberSpaceId);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const endpoint = Environment.getConfig().api;

  const byProposal = new Map<string, { executed: boolean; endTime: number; votedYes: boolean; actionType?: string }>();

  let after: string | null = null;
  for (let page = 0; page < MAX_VOTE_PAGES; page++) {
    const connection = await fetchMyVotesPage(endpoint, voterId, after);
    if (!connection) break;

    for (const node of connection.nodes) {
      const version = node.proposalVersionByProposalIdAndProposalVersion;
      const executed = version?.proposal?.executedAt != null;
      const endTime = version?.endTime ? Number(version.endTime) : 0;
      const actionType = version?.proposalActionsByProposalIdAndProposalVersionConnection?.nodes[0]?.actionType;

      const existing = byProposal.get(node.proposalId);
      byProposal.set(node.proposalId, {
        executed: executed || (existing?.executed ?? false),
        endTime: Math.max(endTime, existing?.endTime ?? 0),
        votedYes: node.vote === 'YES' || (existing?.votedYes ?? false),
        actionType: existing?.actionType ?? actionType,
      });
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  let votedOnAccepted = 0;
  let votedOnRejected = 0;
  let acceptedMembers = 0;
  let acceptedEditors = 0;

  for (const p of byProposal.values()) {
    if (p.executed) {
      votedOnAccepted += 1;
      if (p.votedYes && p.actionType === 'ADD_MEMBER') acceptedMembers += 1;
      if (p.votedYes && p.actionType === 'ADD_EDITOR') acceptedEditors += 1;
    } else if (p.endTime > 0 && p.endTime < nowSeconds) {
      votedOnRejected += 1;
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

  const [myResult, votes] = await Promise.all([
    Effect.runPromise(Effect.either(myProposalsEffect)),
    fetchVoteBasedSidebarCounts(spaceId),
  ]);

  let myProposals = EMPTY_COUNTS.myProposals;
  if (Either.isLeft(myResult)) {
    logBatchError('my proposals', myResult.left);
  } else {
    const my = myResult.right;
    myProposals = {
      inProgress: my.myInProgress.totalCount,
      accepted: my.myAccepted.totalCount,
      rejected: my.myRejected.totalCount,
    };
  }

  return {
    myProposals,
    votedOn: {
      accepted: votes.votedOnAccepted,
      rejected: votes.votedOnRejected,
    },
    iHaveAccepted: {
      members: votes.acceptedMembers,
      editors: votes.acceptedEditors,
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
