import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import {
  type ApiProposalListItem,
  convertVoteOption,
  getApiProposalCanExecute,
  mapActionTypeToProposalType,
  mapProposalStatus,
} from '~/core/io/rest';
import { fetchEditorSpaceIds } from '~/core/io/subgraph/fetch-editor-space-ids';
import { defaultProfile, fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { compareOpenProposals } from '~/core/governance/sort-open-proposals';
import { fetchProposalSubmittedTimes, getSubmittedTime } from '~/core/io/subgraph/fetch-proposal-submitted-times';
import { filterGrantedMembershipRequests } from '~/core/io/subgraph/filter-granted-membership-requests';
import { ProposalStatus, ProposalType } from '~/core/io/substream-schema';
import { Profile } from '~/core/types';

import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
  fetchProposalsForSpaceByGovernanceFilters,
} from '~/partials/governance/governance-proposal-query';

export type {
  GovernanceHomeReviewCategory,
  GovernanceHomeStatusFilter,
  GovernanceProposalCategory,
  GovernanceProposalStatusFilter,
} from '~/partials/governance/governance-proposal-query';
export {
  actionTypesForGovernanceCategory,
  fetchProposalsForSpaceByGovernanceFilters,
  matchesGovernanceCategory,
} from '~/partials/governance/governance-proposal-query';

export type ActiveProposalsForSpacesWhereEditor = Awaited<ReturnType<typeof getActiveProposalsForSpacesWhereEditor>>;

const PAGE_SIZE = 100;

const MEMBERSHIP_ACTIONS = new Set(['ADD_MEMBER', 'REMOVE_MEMBER']);

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
        version?: number;
        name: string | null;
        type: ProposalType;
        createdBy: Profile;
        /** Indexed submission time; 0 when unavailable. */
        submittedAt: number;
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
      fetchProposalsForSpaceByGovernanceFilters({ spaceId, memberSpaceId, proposalType, category, status })
    )
  );

  const merged = allResults.flat();
  // Pending tab must only show proposals still in active voting. EXECUTABLE means the vote
  // already passed (often already reflected as membership in the space); showing Approve/Reject
  // for those is incorrect.
  const activeVotingOnly = status === 'pending' ? merged.filter(p => p.status === 'PROPOSED') : merged;
  // Targets that already belong to the space (a duplicate request was accepted,
  // or they were added another way) have nothing left to review.
  const notYetGranted =
    status === 'pending' ? await filterGrantedMembershipRequests(activeVotingOnly) : activeVotingOnly;
  const filteredProposals = status === 'pending' ? deduplicateMembershipProposals(notYetGranted) : notYetGranted;

  // Submission time is the sort's last key, so it has to be resolved across every
  // candidate rather than the page that survives pagination below.
  const submittedTimes = await fetchProposalSubmittedTimes(filteredProposals.map(p => p.proposalId));

  const order = (p: (typeof filteredProposals)[number]) => ({
    hasViewerVote: p.userVote !== null,
    endTime: p.timing.endTime,
    submittedAt: getSubmittedTime(submittedTimes, p.proposalId),
  });
  filteredProposals.sort((a, b) => compareOpenProposals(order(a), order(b), { unvotedFirst: true, endTime: 'desc' }));

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
      version: p.proposalVersion,
      name: p.name,
      type,
      createdBy: profile,
      submittedAt: getSubmittedTime(submittedTimes, p.proposalId),
      startTime: p.timing.startTime,
      endTime: p.timing.endTime,
      status,
      canExecute: getApiProposalCanExecute(p),
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
