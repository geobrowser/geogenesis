import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import type { ContentProposal, MembershipProposal, SubspaceProposal } from '../zod';

/**
 * We currently index two sets of contracts representing spaces:
 * 1. The original Space contract with simple permissions rules and no proposals.
 * 2. The new (as of January 23rd, 2024) DAO-based contracts with Plugins representing
 *    the Space and any governance and permissions rules.
 *
 * Having multiple sets of contracts means that we support multiple methods for
 * indexing data from these contracts, including the data representing the contracts
 * themselves like the address of the contract and any plugins (if they exist).
 *
 * This file represents mapping Proposals emitted by the DAO-based contracts. Currently
 * we map proposals from the old contracts in `map-entries.ts.` Since the the old
 * contracts don't have governance, we automatically set those to APPROVED.
 *
 * The new contracts have a more complex governance system, so we need to map the
 * proposals and track the status of the proposal for the duration of the voting period.
 */

export function groupProposalsByType(proposals: (ContentProposal | MembershipProposal | SubspaceProposal)[]): {
  contentProposals: ContentProposal[];
  memberProposals: MembershipProposal[];
  editorProposals: MembershipProposal[];
  subspaceProposals: SubspaceProposal[];
} {
  const contentProposals = proposals.flatMap(p => (p.type === 'content' ? p : []));
  const memberProposals = proposals.flatMap(p => (p.type === 'add_member' || p.type === 'remove_member' ? p : []));
  const editorProposals = proposals.flatMap(p => (p.type === 'add_editor' || p.type === 'remove_editor' ? p : []));
  const subspaceProposals = proposals.flatMap(p =>
    p.type === 'add_subspace' || p.type === 'remove_subspace' ? p : []
  );

  return {
    contentProposals,
    memberProposals,
    editorProposals,
    subspaceProposals,
  };
}

export function mapContentProposalsToSchema(
  proposals: ContentProposal[],
  blockNumber: number
): Effect.Effect<
  never,
  never,
  {
    proposals: S.proposals.Insertable[];
    proposedVersions: S.proposed_versions.Insertable[];
    actions: S.actions.Insertable[];
  }
> {
  return Effect.gen(function* (unwrap) {
    console.log('Writing content proposal to database');

    const proposalsToWrite: S.proposals.Insertable[] = [];
    const proposedVersionsToWrite: S.proposed_versions.Insertable[] = [];
    const actionsToWrite: S.actions.Insertable[] = [];

    for (const p of proposals) {
      const proposalToWrite: S.proposals.Insertable = {
        id: p.proposalId,
        name: p.name,
        type: 'content',
        created_at: Number(p.startDate),
        created_at_block: blockNumber,
        created_by_id: p.creator,
        start_date: Number(p.startDate),
        end_date: Number(p.endDate),
        space_id: p.space,
        status: 'approved',
      };

      proposalsToWrite.push(proposalToWrite);
    }

    return {
      proposals: proposalsToWrite,
      proposedVersions: [],
      actions: [],
    };
  });
}
