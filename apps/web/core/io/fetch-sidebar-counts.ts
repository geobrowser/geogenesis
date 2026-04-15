import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '../environment';
import { spaceIdToGraphqlUuid } from './rest/validation';
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

type VoteBasedStatsResult = {
  votedOnAccepted: { totalCount: number };
  votedOnRejected: { totalCount: number };
  acceptedMembers: { totalCount: number };
  acceptedEditors: { totalCount: number };
};

/** Proposals you created — only uses ProposalFilter fields the API exposes. */
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

/**
 * Vote-based counts use root `proposalVotesConnection` + `proposal: { ... }` filters.
 * Nested `proposalVotesConnection` on `ProposalFilter` is not available on the API schema.
 */
function buildVoteBasedStatsQuery(spaceId: string, nowSeconds: string): string {
  return `query {
    votedOnAccepted: proposalVotesConnection(
      filter: {
        voterId: { is: "${spaceId}" }
        proposal: {
          executedAt: { isNull: false }
        }
      }
    ) {
      totalCount
    }

    votedOnRejected: proposalVotesConnection(
      filter: {
        voterId: { is: "${spaceId}" }
        proposal: {
          executedAt: { isNull: true }
          endTime: { lessThan: "${nowSeconds}" }
        }
      }
    ) {
      totalCount
    }

    acceptedMembers: proposalVotesConnection(
      filter: {
        voterId: { is: "${spaceId}" }
        vote: { is: YES }
        proposal: {
          executedAt: { isNull: false }
          proposalActionsConnection: {
            some: { actionType: { is: ADD_MEMBER } }
          }
        }
      }
    ) {
      totalCount
    }

    acceptedEditors: proposalVotesConnection(
      filter: {
        voterId: { is: "${spaceId}" }
        vote: { is: YES }
        proposal: {
          executedAt: { isNull: false }
          proposalActionsConnection: {
            some: { actionType: { is: ADD_EDITOR } }
          }
        }
      }
    ) {
      totalCount
    }
  }`;
}

export async function fetchSidebarCounts(spaceId: string): Promise<SidebarCounts> {
  const gqlSpaceId = spaceIdToGraphqlUuid(spaceId);
  const nowSeconds = Math.floor(Date.now() / 1000).toString();

  const myProposalsEffect = graphql<MyProposalStatsResult>({
    endpoint: Environment.getConfig().api,
    query: buildMyProposalStatsQuery(gqlSpaceId, nowSeconds),
  });

  const voteStatsEffect = graphql<VoteBasedStatsResult>({
    endpoint: Environment.getConfig().api,
    query: buildVoteBasedStatsQuery(gqlSpaceId, nowSeconds),
  });

  const [myResult, voteResult] = await Promise.all([
    Effect.runPromise(Effect.either(myProposalsEffect)),
    Effect.runPromise(Effect.either(voteStatsEffect)),
  ]);

  if (Either.isLeft(myResult)) {
    logBatchError('my proposals', myResult.left);
    if (Either.isLeft(voteResult)) logBatchError('vote-based', voteResult.left);
    return EMPTY_COUNTS;
  }

  const my = myResult.right;

  if (Either.isLeft(voteResult)) {
    logBatchError('vote-based', voteResult.left);
    return {
      myProposals: {
        inProgress: my.myInProgress.totalCount,
        accepted: my.myAccepted.totalCount,
        rejected: my.myRejected.totalCount,
      },
      votedOn: { accepted: 0, rejected: 0 },
      iHaveAccepted: { members: 0, editors: 0 },
    };
  }

  const v = voteResult.right;

  return {
    myProposals: {
      inProgress: my.myInProgress.totalCount,
      accepted: my.myAccepted.totalCount,
      rejected: my.myRejected.totalCount,
    },
    votedOn: {
      accepted: v.votedOnAccepted.totalCount,
      rejected: v.votedOnRejected.totalCount,
    },
    iHaveAccepted: {
      members: v.acceptedMembers.totalCount,
      editors: v.acceptedEditors.totalCount,
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
