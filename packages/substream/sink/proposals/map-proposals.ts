import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { SpaceWithPluginAddressNotFoundError } from '../errors';
import { slog } from '../utils';
import { getChecksumAddress } from '../utils/get-checksum-address';
import { generateActionId, generateVersionId } from '../utils/id';
import { pool } from '../utils/pool';
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
  never,
  SpaceWithPluginAddressNotFoundError,
  {
    proposals: S.proposals.Insertable[];
    proposedVersions: S.proposed_versions.Insertable[];
    actions: S.actions.Insertable[];
  }
> {
  return Effect.gen(function* (unwrap) {
    const proposalsToWrite: S.proposals.Insertable[] = [];
    const proposedVersionsToWrite: S.proposed_versions.Insertable[] = [];
    const actionsToWrite: S.actions.Insertable[] = [];

    const pluginAddresses = proposals.map(e => e.pluginAddress);

    const maybeSpacesForPlugins = yield* unwrap(
      Effect.all(
        pluginAddresses.map(p =>
          Effect.tryPromise({
            try: () =>
              db
                .selectOne(
                  'spaces',
                  { main_voting_plugin_address: getChecksumAddress(p) },
                  { columns: ['id', 'main_voting_plugin_address'] }
                )
                .run(pool),
            catch: error => new SpaceWithPluginAddressNotFoundError(String(error)),
          })
        ),
        {
          concurrency: 20,
        }
      )
    );

    const spacesForPlugins = maybeSpacesForPlugins
      .flatMap(s => (s ? [s] : []))
      // Removing any duplicates and transforming to a map for faster access speed later
      .reduce(
        (acc, s) => {
          // Can safely assert that s.main_voting_plugin_address is not null here
          // since we query using that column previously
          //
          // @TODO: There should be a way to return only not-null values using zapatos
          // maybe using `having`
          const checksumPluginAddress = getChecksumAddress(s.main_voting_plugin_address!);

          if (!acc.has(checksumPluginAddress)) {
            acc.set(checksumPluginAddress, getChecksumAddress(s.id));
          }

          return acc;
        },
        // Mapping of the plugin address to the space id (address)
        new Map<string, string>()
      );
    for (const p of proposals) {
      const spaceId = spacesForPlugins.get(getChecksumAddress(p.pluginAddress));

      if (!spaceId) {
        if (spaceId === undefined) {
          slog({
            level: 'error',
            message: `Could not find space for plugin address when mapping proposals, ${p.pluginAddress}. Proposal ${p}`,
            requestId: '0',
          });
        }

        continue;
      }

      const proposalToWrite: S.proposals.Insertable = {
        id: p.proposalId,
        name: p.name,
        type: 'content',
        created_at: Number(p.startTime),
        created_at_block: blockNumber,
        created_by_id: p.creator,
        start_time: Number(p.startTime),
        end_time: Number(p.endTime),
        // @TODO: Skip proposed versions where the space doesn't exist and log error
        space_id: spacesForPlugins.get(getChecksumAddress(p.pluginAddress))!,
        status: 'approved',
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
          entity_value,
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
