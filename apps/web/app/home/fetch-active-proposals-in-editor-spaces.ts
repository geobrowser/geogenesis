import { Effect, Either } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { Proposal } from '~/core/io/dto/proposals';
import { mapActionTypeToProposalType } from '~/core/io/rest';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { graphql } from '~/core/io/subgraph/graphql';
import { Address } from '~/core/io/substream-schema';
import { deriveProposalStatus } from '~/core/utils/utils';

export type ActiveProposalsForSpacesWhereEditor = Awaited<ReturnType<typeof getActiveProposalsForSpacesWhereEditor>>;

type NetworkProposalVote = {
  vote: 'YES' | 'NO' | 'ABSTAIN';
  voterId: string;
};

type NetworkProposalAction = {
  actionType: string;
  targetId: string | null;
};

type NetworkProposal = {
  id: string;
  name: string | null;
  proposedBy: string;
  spaceId: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  createdAtBlock: string;
  executedAt: string | null;
  proposalActions: NetworkProposalAction[];
  space: {
    type: string;
  };
  proposalVotesConnection: {
    totalCount: number;
    nodes: NetworkProposalVote[];
  };
};

type NetworkResult = {
  proposalsConnection: {
    totalCount: number;
    pageInfo: { hasNextPage: boolean };
    nodes: NetworkProposal[];
  };
};

function mapVote(vote: string): 'ACCEPT' | 'REJECT' | 'ABSTAIN' {
  switch (vote) {
    case 'YES':
      return 'ACCEPT';
    case 'NO':
      return 'REJECT';
    default:
      return 'ABSTAIN';
  }
}

const PAGE_SIZE = 100;

export async function getActiveProposalsForSpacesWhereEditor(
  memberSpaceId?: string,
  proposalType?: 'membership' | 'content',
  page: number = 0
) {
  if (!memberSpaceId) {
    return {
      totalCount: 0,
      proposals: [],
      hasNextPage: false,
    };
  }

  let proposalTypeFilter = '';

  if (proposalType === 'content') {
    proposalTypeFilter = `
      proposalActionsConnection: {
        some: { actionType: { in: [PUBLISH] } }
      }
    `;
  }

  if (proposalType === 'membership') {
    proposalTypeFilter = `
      proposalActionsConnection: {
        some: { actionType: { in: [ADD_EDITOR, ADD_MEMBER, REMOVE_EDITOR, REMOVE_MEMBER] } }
      }
    `;
  }

  const offset = page * PAGE_SIZE;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const query = `query {
    proposalsConnection(
      first: ${PAGE_SIZE}
      offset: ${offset}
      orderBy: END_TIME_DESC
      filter: {
        executedAt: { isNull: true }
        endTime: { greaterThan: "${nowSeconds}" }
        spaceId: { isNot: "${memberSpaceId}" }
        space: {
          editors: {
            some: {
              memberSpaceId: { is: "${memberSpaceId}" }
            }
          }
        }
        ${proposalTypeFilter}
      }
    ) {
      totalCount
      pageInfo {
        hasNextPage
      }
      nodes {
        id
        name
        proposedBy
        spaceId
        startTime
        endTime
        createdAt
        createdAtBlock
        executedAt
        proposalActions {
          actionType
          targetId
        }
        space {
          type
        }
        proposalVotesConnection {
          totalCount
          nodes {
            vote
            voterId
          }
        }
      }
    }
  }`;

  const fetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query,
  });

  const result = await Effect.runPromise(Effect.either(fetchEffect));

  if (Either.isLeft(result)) {
    const error = result.left;

    switch (error._tag) {
      case 'GraphqlRuntimeError':
        console.error(`Encountered runtime graphql error in getActiveProposalsForSpacesWhereEditor.`, error.message);
        break;

      default:
        console.error(`${error._tag}: Unable to fetch proposals where editor`);
        break;
    }

    return {
      totalCount: 0,
      proposals: [],
      hasNextPage: false,
    };
  }

  const data = await Effect.runPromise(result);

  const MEMBERSHIP_ACTIONS = new Set(['ADD_MEMBER', 'REMOVE_MEMBER']);

  const isMembershipProposal = (p: NetworkProposal) =>
    p.proposalActions.some(a => MEMBERSHIP_ACTIONS.has(a.actionType));

  const userHasVoted = (p: NetworkProposal) => p.proposalVotesConnection.nodes.some(v => v.voterId === memberSpaceId);

  const seenMembershipProposals = new Set<string>();
  const isDuplicateMembershipProposal = (p: NetworkProposal) => {
    if (!isMembershipProposal(p)) return false;
    const action = p.proposalActions[0];
    if (!action?.targetId) return false;
    const key = `${p.spaceId}:${action.actionType}:${action.targetId}`;
    if (seenMembershipProposals.has(key)) return true;
    seenMembershipProposals.add(key);
    return false;
  };

  const gqlProposals = data.proposalsConnection.nodes.filter(
    p =>
      p.space.type !== 'PERSONAL' && !(isMembershipProposal(p) && userHasVoted(p)) && !isDuplicateMembershipProposal(p)
  );

  const creatorIds = gqlProposals.map(p => p.proposedBy);
  const uniqueCreatorIds = [...new Set(creatorIds)];
  const profilesForProposals = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueCreatorIds));
  const profilesBySpaceId = new Map(uniqueCreatorIds.map((id, i) => [id, profilesForProposals[i]]));

  const proposals: Proposal[] = gqlProposals.map(p => {
    const maybeProfile = profilesBySpaceId.get(p.proposedBy);
    const profile = maybeProfile ?? {
      id: p.proposedBy,
      spaceId: p.proposedBy,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      address: p.proposedBy as `0x${string}`,
      profileLink: null,
    };

    const actionType = p.proposalActions[0]?.actionType ?? 'UNKNOWN';
    const type = mapActionTypeToProposalType(actionType);
    const endTime = Number(p.endTime);
    const status = deriveProposalStatus(p.executedAt, endTime);

    return {
      id: p.id,
      editId: '',
      name: p.name,
      createdAt: 0,
      createdAtBlock: p.createdAtBlock ?? '0',
      type,
      startTime: Number(p.startTime),
      endTime,
      status,
      space: {
        id: p.spaceId,
        name: null,
        image: PLACEHOLDER_SPACE_IMAGE,
      },
      createdBy: profile,
      proposalVotes: {
        totalCount: p.proposalVotesConnection.totalCount,
        nodes: p.proposalVotesConnection.nodes.map(v => ({
          vote: mapVote(v.vote),
          accountId: Address(v.voterId),
          voter: profilesBySpaceId.get(v.voterId) ?? {
            id: v.voterId,
            spaceId: v.voterId,
            name: null,
            avatarUrl: null,
            coverUrl: null,
            address: v.voterId as `0x${string}`,
            profileLink: null,
          },
        })),
      },
    };
  });

  // Unvoted proposals first, then voted
  proposals.sort((a, b) => {
    const aVoted = a.proposalVotes.nodes.some(v => v.accountId === memberSpaceId);
    const bVoted = b.proposalVotes.nodes.some(v => v.accountId === memberSpaceId);

    if (aVoted !== bVoted) {
      return aVoted ? 1 : -1;
    }

    return b.endTime - a.endTime;
  });

  return {
    totalCount: data.proposalsConnection.totalCount,
    proposals,
    hasNextPage: data.proposalsConnection.pageInfo.hasNextPage,
  };
}
