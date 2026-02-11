import { Effect, Either, Schema } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import {
  restFetch,
  ApiProposalListResponseSchema,
  mapActionTypeToProposalType,
  mapProposalStatus,
  convertVoteOption,
  encodePathSegment,
  validateActionTypes,
  isValidUUID,
  type ApiProposalListItem,
} from '~/core/io/rest';
import { defaultProfile, fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { graphql } from '~/core/io/subgraph/graphql';
import { ProposalStatus, ProposalType } from '~/core/io/substream-schema';
import { Profile } from '~/core/types';

export type ActiveProposalsForSpacesWhereEditor = Awaited<ReturnType<typeof getActiveProposalsForSpacesWhereEditor>>;

const PAGE_SIZE = 100;

const MEMBERSHIP_ACTIONS = new Set(['ADD_MEMBER', 'REMOVE_MEMBER']);

type EditorSpacesResult = {
  spacesConnection: {
    nodes: { id: string }[];
  };
};

async function fetchEditorSpaceIds(memberSpaceId: string): Promise<string[]> {
  const query = `query {
    spacesConnection(
      filter: {
        editors: {
          some: {
            memberSpaceId: { is: "${memberSpaceId}" }
          }
        }
      }
    ) {
      nodes {
        id
      }
    }
  }`;

  const fetchEffect = graphql<EditorSpacesResult>({
    endpoint: Environment.getConfig().api,
    query,
  });

  const result = await Effect.runPromise(Effect.either(fetchEffect));

  if (Either.isLeft(result)) {
    console.error('Failed to fetch editor spaces:', result.left);
    return [];
  }

  return result.right.spacesConnection.nodes
    .map(n => n.id)
    .filter(id => id !== memberSpaceId);
}

async function fetchProposalsForSpace({
  spaceId,
  memberSpaceId,
  proposalType,
}: {
  spaceId: string;
  memberSpaceId: string;
  proposalType?: 'membership' | 'content';
}): Promise<readonly ApiProposalListItem[]> {
  const config = Environment.getConfig();

  const params = new URLSearchParams();
  params.set('limit', String(PAGE_SIZE));
  params.set('status', 'PROPOSED,EXECUTABLE');
  params.set('orderBy', 'end_time');
  params.set('orderDirection', 'desc');

  if (proposalType === 'content') {
    const types = validateActionTypes(['Publish']);
    params.set('actionTypes', types.join(','));
  } else if (proposalType === 'membership') {
    const types = validateActionTypes(['AddMember', 'RemoveMember', 'AddEditor', 'RemoveEditor']);
    params.set('actionTypes', types.join(','));
  }

  if (isValidUUID(memberSpaceId)) {
    params.set('voterId', memberSpaceId);
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
    console.error(`Failed to fetch proposals for space ${spaceId}:`, result.left);
    return [];
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode proposals for space ${spaceId}:`, decoded.left);
    return [];
  }

  return decoded.right.proposals;
}

function isMembershipProposal(p: ApiProposalListItem) {
  return p.actions.some(a => MEMBERSHIP_ACTIONS.has(a.actionType));
}

export async function getActiveProposalsForSpacesWhereEditor(
  memberSpaceId?: string,
  proposalType?: 'membership' | 'content',
  page: number = 0
) {
  if (!memberSpaceId) {
    return {
      totalCount: 0,
      proposals: [] as Array<{
        id: string;
        name: string | null;
        type: ProposalType;
        createdBy: Profile;
        startTime: number;
        endTime: number;
        status: ProposalStatus;
        space: { id: string; name: string | null; image: string };
        proposalVotes: { totalCount: number; yesCount: number; noCount: number };
        userVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
      }>,
      hasNextPage: false,
    };
  }

  const editorSpaceIds = await fetchEditorSpaceIds(memberSpaceId);

  if (editorSpaceIds.length === 0) {
    return {
      totalCount: 0,
      proposals: [],
      hasNextPage: false,
    };
  }

  const allResults = await Promise.all(
    editorSpaceIds.map(spaceId =>
      fetchProposalsForSpace({ spaceId, memberSpaceId, proposalType })
    )
  );

  const allProposals = allResults.flat();

  const seenMembershipProposals = new Set<string>();

  const filteredProposals = allProposals.filter(p => {
    if (isMembershipProposal(p) && p.userVote !== null) {
      return false;
    }

    if (isMembershipProposal(p)) {
      const action = p.actions[0];
      if (action?.targetId) {
        const key = `${p.spaceId}:${action.actionType}:${action.targetId}`;
        if (seenMembershipProposals.has(key)) return false;
        seenMembershipProposals.add(key);
      }
    }

    return true;
  });

  filteredProposals.sort((a, b) => {
    const aVoted = a.userVote !== null;
    const bVoted = b.userVote !== null;

    if (aVoted !== bVoted) {
      return aVoted ? 1 : -1;
    }

    return b.timing.endTime - a.timing.endTime;
  });

  const startIndex = page * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedProposals = filteredProposals.slice(startIndex, endIndex);
  const hasNextPage = filteredProposals.length > endIndex;

  const creatorIds = paginatedProposals.map(p => p.proposedBy);
  const uniqueCreatorIds = [...new Set(creatorIds)];
  const profilesForProposals = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueCreatorIds));
  const profilesBySpaceId = new Map(uniqueCreatorIds.map((id, i) => [id, profilesForProposals[i]]));

  const proposals = paginatedProposals.map(p => {
    const profile = profilesBySpaceId.get(p.proposedBy) ?? defaultProfile(p.proposedBy, p.proposedBy);
    const actionType = p.actions[0]?.actionType ?? 'UNKNOWN';
    const type = mapActionTypeToProposalType(actionType);
    const status = mapProposalStatus(p.status);

    return {
      id: p.proposalId,
      name: p.name,
      type,
      createdBy: profile,
      startTime: p.timing.startTime,
      endTime: p.timing.endTime,
      status,
      space: {
        id: p.spaceId,
        name: null as string | null,
        image: PLACEHOLDER_SPACE_IMAGE,
      },
      proposalVotes: {
        totalCount: p.votes.total,
        yesCount: p.votes.yes,
        noCount: p.votes.no,
      },
      userVote: p.userVote ? convertVoteOption(p.userVote) : undefined,
    };
  });

  return {
    totalCount: filteredProposals.length,
    proposals,
    hasNextPage,
  };
}
