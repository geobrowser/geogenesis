import * as Effect from 'effect/Effect';

import {
  convertVoteOption,
  mapApiActionsToProposalType,
  mapProposalStatus,
  type ApiProposalListItem,
} from '~/core/io/rest';
import { defaultProfile, fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { ProposalStatus, ProposalType } from '~/core/io/substream-schema';
import type { Profile } from '~/core/types';

import { buildGovernanceHomeProposalTitle } from './build-governance-home-proposal-title';
import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
  fetchProposalsForSpaceByGovernanceFilters,
  matchesGovernanceCategory,
} from './fetch-active-proposals-in-editor-spaces';

const PAGE_SIZE = 50;

const MEMBERSHIP_ACTION_TYPES = new Set(['ADD_MEMBER', 'REMOVE_MEMBER', 'ADD_EDITOR', 'REMOVE_EDITOR']);

function sameMemberSpaceId(a: string, b: string): boolean {
  return a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase();
}

export type MyGovernanceProposalRow = {
  id: string;
  spaceId: string;
  name: string | null;
  displayTitle: string;
  type: ProposalType;
  endTime: number;
  startTime: number;
  status: ProposalStatus;
  canExecute: boolean;
  proposalVotes: { totalCount: number; yesCount: number; noCount: number };
  userVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
  createdBy: Profile;
  targetProfile?: Profile;
};

function dedupeByProposalId(items: ApiProposalListItem[]): ApiProposalListItem[] {
  const seen = new Set<string>();
  const out: ApiProposalListItem[] = [];
  for (const p of items) {
    if (seen.has(p.proposalId)) continue;
    seen.add(p.proposalId);
    out.push(p);
  }
  return out;
}

export async function getMyGovernanceProposals(opts: {
  memberSpaceId: string;
  spaceIds: string[];
  spaceFilter?: string;
  category: GovernanceHomeReviewCategory;
  status: GovernanceHomeStatusFilter;
  page?: number;
}): Promise<{ proposals: MyGovernanceProposalRow[]; hasMore: boolean }> {
  const { memberSpaceId, spaceIds, spaceFilter, category, status, page = 0 } = opts;

  const effectiveSpaceIds =
    spaceFilter && spaceFilter !== 'all'
      ? spaceIds.includes(spaceFilter)
        ? [spaceFilter]
        : []
      : spaceIds;

  if (effectiveSpaceIds.length === 0) {
    return { proposals: [], hasMore: false };
  }

  const allRows: ApiProposalListItem[] = [];
  for (const spaceId of effectiveSpaceIds) {
    const rows = await fetchProposalsForSpaceByGovernanceFilters({
      spaceId,
      memberSpaceId,
      proposalType: undefined,
      category,
      status,
    });
    for (const p of rows) {
      if (!sameMemberSpaceId(p.proposedBy, memberSpaceId)) continue;
      if (!matchesGovernanceCategory(p.actions[0]?.actionType, category)) continue;
      allRows.push(p);
    }
  }

  const votingRows =
    status === 'pending' ? allRows.filter(p => p.status === 'PROPOSED') : allRows;
  votingRows.sort((a, b) => b.timing.endTime - a.timing.endTime);
  const unique = dedupeByProposalId(votingRows);
  const offset = page * PAGE_SIZE;
  const pageSlice = unique.slice(offset, offset + PAGE_SIZE);

  const proposedByIds = pageSlice.map(p => p.proposedBy);
  const uniqueProposedByIds = [...new Set(proposedByIds)];

  const targetIds = pageSlice
    .filter(p => MEMBERSHIP_ACTION_TYPES.has(p.actions[0]?.actionType ?? ''))
    .map(p => p.actions[0]?.targetId)
    .filter((id): id is string => !!id);
  const uniqueTargetIds = [...new Set(targetIds)];

  const [profilesForProposals, profilesForTargets] = await Promise.all([
    Effect.runPromise(fetchProfilesBySpaceIds(uniqueProposedByIds)),
    uniqueTargetIds.length > 0 ? Effect.runPromise(fetchProfilesBySpaceIds(uniqueTargetIds)) : [],
  ]);

  const profilesBySpaceId = new Map(uniqueProposedByIds.map((id, i) => [id, profilesForProposals[i]]));
  const targetProfilesBySpaceId = new Map(uniqueTargetIds.map((id, i) => [id, profilesForTargets[i]]));

  const proposals: MyGovernanceProposalRow[] = [];

  for (const p of pageSlice) {
    const type = mapApiActionsToProposalType(p.actions);
    const createdBy = profilesBySpaceId.get(p.proposedBy) ?? defaultProfile(p.proposedBy, p.proposedBy);
    const targetId = p.actions[0]?.targetId;
    const targetProfile = targetId ? targetProfilesBySpaceId.get(targetId) : undefined;
    const displayTitle = await buildGovernanceHomeProposalTitle(type, p.proposalId, p.name, createdBy);

    proposals.push({
      id: p.proposalId,
      spaceId: p.spaceId,
      name: p.name,
      displayTitle,
      type,
      startTime: p.timing.startTime,
      endTime: p.timing.endTime,
      status: mapProposalStatus(p.status),
      canExecute: p.canExecute,
      proposalVotes: {
        totalCount: p.votes.total,
        yesCount: p.votes.yes,
        noCount: p.votes.no,
      },
      userVote: p.userVote ? convertVoteOption(p.userVote) : undefined,
      createdBy,
      targetProfile,
    });
  }

  return {
    proposals,
    hasMore: unique.length > offset + PAGE_SIZE,
  };
}
