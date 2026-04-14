import { Effect } from 'effect';

import { fetchProfile } from '~/core/io/subgraph/fetch-profile';
import { ProposalType } from '~/core/io/substream-schema';
import type { Profile } from '~/core/types';

import { fetchProposedEditorForProposal } from './fetch-proposed-editor';
import { fetchProposedMemberForProposal } from './fetch-proposed-member';

export async function buildGovernanceHomeProposalTitle(
  type: ProposalType,
  proposalId: string,
  apiName: string | null,
  createdBy: Profile
): Promise<string> {
  switch (type) {
    case 'ADD_EDIT':
      return apiName?.trim() || 'Proposal';
    case 'ADD_SUBSPACE':
    case 'REMOVE_SUBSPACE':
    case 'SET_TOPIC':
      return apiName?.trim() || 'Proposal';
    case 'ADD_EDITOR':
    case 'ADD_MEMBER': {
      const profile = createdBy.address
        ? await Effect.runPromise(fetchProfile(createdBy.address))
        : createdBy;
      const displayName = profile?.name ?? profile?.address ?? profile?.id ?? 'Unknown';
      return type === 'ADD_EDITOR' ? `Add ${displayName} as editor` : `Add ${displayName} as member`;
    }
    case 'REMOVE_EDITOR': {
      const profile = await fetchProposedEditorForProposal(proposalId);
      const displayName = profile?.name ?? profile?.address ?? profile?.id ?? 'Unknown';
      return `Remove ${displayName} as editor`;
    }
    case 'REMOVE_MEMBER': {
      const profile = await fetchProposedMemberForProposal(proposalId);
      if (!profile) return apiName?.trim() || 'Remove member';
      const displayName = profile.name ?? profile.address ?? profile.id ?? 'Unknown';
      return `Remove ${displayName} as member`;
    }
    default:
      return apiName?.trim() || 'Proposal';
  }
}
