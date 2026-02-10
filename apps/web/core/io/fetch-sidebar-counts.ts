import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '../environment';
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

type NetworkResult = {
  myInProgress: { totalCount: number };
  myAccepted: { totalCount: number };
  myRejected: { totalCount: number };
  votedOnAccepted: { totalCount: number };
  votedOnRejected: { totalCount: number };
  acceptedMembers: { totalCount: number };
  acceptedEditors: { totalCount: number };
};

function buildQuery(spaceId: string): string {
  const nowSeconds = Math.floor(Date.now() / 1000).toString();

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

    votedOnAccepted: proposalsConnection(
      filter: {
        executedAt: { isNull: false }
        proposalVotesConnection: {
          some: { voterId: { is: "${spaceId}" } }
        }
      }
    ) {
      totalCount
    }

    votedOnRejected: proposalsConnection(
      filter: {
        executedAt: { isNull: true }
        endTime: { lessThan: "${nowSeconds}" }
        proposalVotesConnection: {
          some: { voterId: { is: "${spaceId}" } }
        }
      }
    ) {
      totalCount
    }

    acceptedMembers: proposalsConnection(
      filter: {
        executedAt: { isNull: false }
        proposalActionsConnection: {
          some: { actionType: { in: [ADD_MEMBER] } }
        }
        proposalVotesConnection: {
          some: {
            voterId: { is: "${spaceId}" }
            vote: { is: YES }
          }
        }
      }
    ) {
      totalCount
    }

    acceptedEditors: proposalsConnection(
      filter: {
        executedAt: { isNull: false }
        proposalActionsConnection: {
          some: { actionType: { in: [ADD_EDITOR] } }
        }
        proposalVotesConnection: {
          some: {
            voterId: { is: "${spaceId}" }
            vote: { is: YES }
          }
        }
      }
    ) {
      totalCount
    }
  }`;
}

export async function fetchSidebarCounts(spaceId: string): Promise<SidebarCounts> {
  const query = buildQuery(spaceId);

  const fetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query,
  });

  const result = await Effect.runPromise(Effect.either(fetchEffect));

  if (Either.isLeft(result)) {
    const error = result.left;

    switch (error._tag) {
      case 'GraphqlRuntimeError':
        console.error('Encountered runtime graphql error in fetchSidebarCounts.', error.message);
        break;
      default:
        console.error(`${error._tag}: Unable to fetch sidebar counts`);
        break;
    }

    return EMPTY_COUNTS;
  }

  const data = result.right;

  return {
    myProposals: {
      inProgress: data.myInProgress.totalCount,
      accepted: data.myAccepted.totalCount,
      rejected: data.myRejected.totalCount,
    },
    votedOn: {
      accepted: data.votedOnAccepted.totalCount,
      rejected: data.votedOnRejected.totalCount,
    },
    iHaveAccepted: {
      members: data.acceptedMembers.totalCount,
      editors: data.acceptedEditors.totalCount,
    },
  };
}
