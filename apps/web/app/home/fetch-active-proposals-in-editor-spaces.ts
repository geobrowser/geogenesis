import { Effect, Either, Schema } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import {
  type ApiProposalListItem,
  ApiProposalListResponseSchema,
  convertVoteOption,
  encodePathSegment,
  isValidUUID,
  mapActionTypeToProposalType,
  mapProposalStatus,
  restFetch,
  validateActionTypes,
} from '~/core/io/rest';
import { fetchEditorSpaceIds } from '~/core/io/subgraph/fetch-editor-space-ids';
import { defaultProfile, fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { ProposalStatus, ProposalType } from '~/core/io/substream-schema';
import { Profile } from '~/core/types';

export type ActiveProposalsForSpacesWhereEditor = Awaited<ReturnType<typeof getActiveProposalsForSpacesWhereEditor>>;

const PAGE_SIZE = 100;

const MEMBERSHIP_ACTIONS = new Set(['ADD_MEMBER', 'REMOVE_MEMBER']);

export type GovernanceHomeReviewCategory = 'all' | 'knowledge' | 'membership' | 'settings';
export type GovernanceHomeStatusFilter = 'pending' | 'accepted' | 'rejected';

const SETTINGS_ACTION_TYPES = [
  'UpdateVotingSettings',
  'SetTopic',
  'UnsetTopic',
  'TopicDeclared',
  'TopicRemoved',
  'SubspaceVerified',
  'SubspaceUnverified',
  'SubspaceRelated',
  'SubspaceUnrelated',
  'SubspaceTopicDeclared',
  'SubspaceTopicRemoved',
] as const;

export function actionTypesForGovernanceCategory(
  category: GovernanceHomeReviewCategory
): string[] | undefined {
  switch (category) {
    case 'knowledge':
      return validateActionTypes(['Publish']);
    case 'membership':
      return validateActionTypes(['AddMember', 'RemoveMember', 'AddEditor', 'RemoveEditor']);
    case 'settings':
      return validateActionTypes([...SETTINGS_ACTION_TYPES]);
    default:
      return undefined;
  }
}

export function matchesGovernanceCategory(
  actionType: string | undefined,
  category: GovernanceHomeReviewCategory
): boolean {
  if (category === 'all') return true;
  const allowed = actionTypesForGovernanceCategory(category);
  if (!allowed?.length) return false;
  const norm = (s: string) => s.replace(/_/g, '').toUpperCase();
  const u = norm(actionType ?? 'UNKNOWN');
  return allowed.some(a => norm(a) === u);
}

function statusQueryParam(status: GovernanceHomeStatusFilter): string {
  if (status === 'pending') return 'PROPOSED,EXECUTABLE';
  if (status === 'accepted') return 'ACCEPTED';
  return 'REJECTED';
}

async function fetchProposalsForSpace({
  spaceId,
  memberSpaceId,
  proposalType,
  category = 'all',
  status = 'pending',
}: {
  spaceId: string;
  memberSpaceId: string;
  proposalType?: 'membership' | 'content';
  category?: GovernanceHomeReviewCategory;
  status?: GovernanceHomeStatusFilter;
}): Promise<readonly ApiProposalListItem[]> {
  const config = Environment.getConfig();

  const params = new URLSearchParams();
  params.set('limit', String(PAGE_SIZE));
  params.set('status', statusQueryParam(status));
  params.set('orderBy', 'end_time');
  params.set('orderDirection', 'desc');

  const resolvedCategory: GovernanceHomeReviewCategory =
    category !== 'all'
      ? category
      : proposalType === 'content'
        ? 'knowledge'
        : proposalType === 'membership'
          ? 'membership'
          : 'all';

  const types = actionTypesForGovernanceCategory(resolvedCategory);
  if (types?.length) {
    params.set('actionTypes', types.join(','));
  }

  if (isValidUUID(memberSpaceId) && status === 'pending') {
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

export async function getActiveProposalsForSpacesWhereEditor(
  memberSpaceId?: string,
  proposalType?: 'membership' | 'content',
  page: number = 0,
  filters?: {
    spaceId?: string;
    category?: GovernanceHomeReviewCategory;
    status?: GovernanceHomeStatusFilter;
  }
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
        canExecute: boolean;
        space: { id: string; name: string | null; image: string };
        proposalVotes: { totalCount: number; yesCount: number; noCount: number };
        userVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
      }>,
      hasNextPage: false,
    };
  }

  const editorSpaceIds = await fetchEditorSpaceIds(memberSpaceId);

  let spaceIds = editorSpaceIds;
  if (filters?.spaceId && filters.spaceId !== 'all') {
    spaceIds = editorSpaceIds.includes(filters.spaceId) ? [filters.spaceId] : [];
  }

  if (spaceIds.length === 0) {
    return {
      totalCount: 0,
      proposals: [],
      hasNextPage: false,
    };
  }

  const category: GovernanceHomeReviewCategory =
    filters?.category ??
    (proposalType === 'content' ? 'knowledge' : proposalType === 'membership' ? 'membership' : 'all');
  const status: GovernanceHomeStatusFilter = filters?.status ?? 'pending';

  const allResults = await Promise.all(
    spaceIds.map(spaceId =>
      fetchProposalsForSpace({ spaceId, memberSpaceId, proposalType, category, status })
    )
  );

  const merged = allResults.flat();
  const filteredProposals = status === 'pending' ? deduplicateMembershipProposals(merged) : merged;

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
      canExecute: p.canExecute,
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

function deduplicateMembershipProposals(proposals: ApiProposalListItem[]): ApiProposalListItem[] {
  const votedKeys = new Set<string>();
  for (const p of proposals) {
    if (!isMembershipProposal(p) || p.userVote === null) continue;
    const key = membershipKey(p);
    if (key) votedKeys.add(key);
  }

  const seen = new Set<string>();

  return proposals.filter(p => {
    if (!isMembershipProposal(p)) return true;
    if (p.userVote !== null) return false;

    const key = membershipKey(p);
    if (!key) return true;
    if (votedKeys.has(key)) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isMembershipProposal(p: ApiProposalListItem) {
  return p.actions.some(a => MEMBERSHIP_ACTIONS.has(a.actionType));
}

function membershipKey(p: ApiProposalListItem): string | null {
  const action = p.actions[0];
  if (!action?.targetId) return null;
  return `${p.spaceId}:${action.actionType}:${action.targetId}`;
}
