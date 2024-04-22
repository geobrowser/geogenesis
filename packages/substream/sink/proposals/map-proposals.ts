import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { SpaceWithPluginAddressNotFoundError } from '../errors';
import { generateActionId, generateVersionId } from '../utils/id';
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
  blockNumber: number,
  cursor: string
): Effect.Effect<
  {
    proposals: S.proposals.Insertable[];
    proposedVersions: S.proposed_versions.Insertable[];
    actions: S.actions.Insertable[];
  },
  SpaceWithPluginAddressNotFoundError,
  never
> {
  return Effect.gen(function* (unwrap) {
    const proposalsToWrite: S.proposals.Insertable[] = [];
    const proposedVersionsToWrite: S.proposed_versions.Insertable[] = [];
    const actionsToWrite: S.actions.Insertable[] = [];

    for (const p of proposals) {
      const spaceId = p.space;

      const proposalToWrite: S.proposals.Insertable = {
        id: p.proposalId,
        onchain_proposal_id: p.onchainProposalId,
        name: p.name,
        type: 'content',
        created_at: Number(p.startTime),
        created_at_block: blockNumber,
        created_by_id: p.creator,
        start_time: Number(p.startTime),
        end_time: Number(p.endTime),
        space_id: spaceId,
        status: 'proposed',
        uri: p.uri,
      };

      proposalsToWrite.push(proposalToWrite);

      p.actions.forEach((action, index) => {
        const string_value =
          action.value.type === 'string' ||
          action.value.type === 'image' ||
          action.value.type === 'url' ||
          action.value.type === 'date'
            ? action.value.value
            : null;
        const entity_value = action.value.type === 'entity' ? action.value.id : null;

        const proposed_version_id = generateVersionId({
          entryIndex: index,
          entityId: action.entityId,
          cursor,
        });

        const action_id = generateActionId({
          space_id: spaceId,
          entity_id: action.entityId,
          attribute_id: action.attributeId,
          value_id: action.value.id,
          cursor,
        });

        const mappedAction: S.actions.Insertable = {
          id: action_id,
          action_type: action.type,
          entity_id: action.entityId,
          attribute_id: action.attributeId,
          value_type: action.value.type,
          value_id: action.value.id,
          string_value,
          entity_value_id: entity_value,
          proposed_version_id,
          created_at: Number(p.startTime),
          created_at_block: blockNumber,
        };

        return actionsToWrite.push(mappedAction);
      });

      const uniqueEntityIds = new Set(p.actions.map(action => action.entityId));

      [...uniqueEntityIds.values()].forEach((entityId, entryIndex) => {
        const mappedProposedVersion: S.proposed_versions.Insertable = {
          id: generateVersionId({ entryIndex, entityId, cursor }),
          entity_id: entityId,
          created_at_block: blockNumber,
          created_at: Number(p.startTime),
          name: p.name,
          created_by_id: p.creator,
          proposal_id: p.proposalId,
          space_id: spaceId,
        };

        proposedVersionsToWrite.push(mappedProposedVersion);
      });
    }

    return {
      proposals: proposalsToWrite,
      proposedVersions: proposedVersionsToWrite,
      actions: actionsToWrite,
    };
  });
}
