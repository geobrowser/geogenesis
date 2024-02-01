import type * as Schema from 'zapatos/schema';

import { type OmitStrict, TripleAction, type TripleWithActionTuple } from '../types';
import { generateActionId, generateProposalId, generateTripleId, generateVersionId } from '../utils/id';
import type { FullEntry } from '../zod';

// export function mapProfilesRegistered({
//   profileRegistered,
//   blockNumber,
//   timestamp,
// }: {
//   profileRegistered: ProfileRegistered[];
//   blockNumber: number;
//   timestamp: number;
// }): Schema.profiles.Insertable[] {
//   return profileRegistered.map(profile => ({
//     id: profile.id,
//     space_id: profile.space,
//     created_at_block: blockNumber,
//     created_at: timestamp,
//     updated_at: timestamp,
//     updated_at_block: blockNumber,
//     created_by_id: profile.requestor,
//   }));
// }

interface EntriesWithMetadata {
  fullEntries: FullEntry[];
  cursor: string;
  timestamp: number;
  blockNumber: number;
}

export function mapAccounts(author?: string): Schema.accounts.Insertable[] {
  if (!author) {
    return [];
  }

  return [{ id: author }];
}

export function mapActions({
  fullEntries,
  cursor,
  timestamp,
  blockNumber,
}: EntriesWithMetadata): Schema.actions.Insertable[] {
  return fullEntries.flatMap((fullEntry, entryIndex) => {
    return fullEntry.uriData.actions.map(action => {
      const string_value =
        action.value.type === 'string' ||
        action.value.type === 'image' ||
        action.value.type === 'url' ||
        action.value.type === 'date'
          ? action.value.value
          : null;
      const entity_value = action.value.type === 'entity' ? action.value.id : null;

      const proposed_version_id = generateVersionId({
        entryIndex,
        entityId: action.entityId,
        cursor,
      });

      const action_id = generateActionId({
        space_id: fullEntry.space,
        entity_id: action.entityId,
        attribute_id: action.attributeId,
        value_id: action.value.id,
        cursor,
      });

      return {
        id: action_id,
        action_type: action.type,
        entity_id: action.entityId,
        attribute_id: action.attributeId,
        value_type: action.value.type,
        value_id: action.value.id,
        string_value,
        entity_value,
        proposed_version_id,
        created_at: timestamp,
        created_at_block: blockNumber,
      };
    });
  });
}

export function mapEntities({
  fullEntries,
  timestamp,
  blockNumber,
}: OmitStrict<EntriesWithMetadata, 'cursor'>): Schema.geo_entities.Insertable[] {
  const entitiesMap = new Map<string, Schema.geo_entities.Insertable>();

  for (const fullEntry of fullEntries) {
    for (const action of fullEntry.uriData.actions) {
      entitiesMap.set(action.entityId, {
        id: action.entityId,
        // We don't set name or description until we process triples later.
        created_at: timestamp,
        created_at_block: blockNumber,
        updated_at: timestamp,
        updated_at_block: blockNumber,
        created_by_id: fullEntry.author,
      });
    }
  }

  return [...entitiesMap.values()];
}

export function mapProposals({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: EntriesWithMetadata): Schema.proposals.Insertable[] {
  return fullEntries.map((fullEntry, entryIndex) => {
    const proposalId = generateProposalId({ entryIndex, cursor });
    return {
      id: proposalId,
      name: fullEntry.uriData.name,
      // For legacy spaces we don't have onchain proposal id
      onchain_proposal_id: '-1',
      type: 'content',
      created_at_block: blockNumber,
      created_by_id: fullEntry.author,
      space_id: fullEntry.space,
      created_at: timestamp,
      status: 'approved',
      start_time: timestamp,
      end_time: timestamp,
    };
  });
}

export function mapProposedVersions({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: EntriesWithMetadata): Schema.proposed_versions.Insertable[] {
  return fullEntries.flatMap((fullEntry, entryIndex) => {
    const uniqueEntityIds = fullEntry.uriData.actions
      .map(action => action.entityId)
      .filter((value, index, self) => self.indexOf(value) === index);

    return uniqueEntityIds.map(entityId => {
      const proposedVersionName = fullEntry.uriData.name;
      return {
        id: generateVersionId({ entryIndex, entityId, cursor }),
        entity_id: entityId,
        created_at_block: blockNumber,
        created_at: timestamp,
        name: proposedVersionName ? proposedVersionName : null,
        created_by_id: fullEntry.author,
        proposal_id: generateProposalId({ entryIndex, cursor }),
        space_id: fullEntry.space,
      };
    });
  });
}

export function mapSpaces(fullEntries: FullEntry[], blockNumber: number): Schema.spaces.Insertable[] {
  return fullEntries.map(fullEntry => ({
    id: fullEntry.space,
    is_root_space: false,
    created_at_block: blockNumber,
  }));
}

export function mapTriplesWithActionType(
  fullEntries: FullEntry[],
  timestamp: number,
  blockNumber: number
): TripleWithActionTuple[] {
  const triples: TripleWithActionTuple[] = fullEntries.flatMap(fullEntry => {
    return fullEntry.uriData.actions.map(action => {
      const action_type = action.type;

      const entity_id = action.entityId;
      const attribute_id = action.attributeId;
      const value_type = action.value.type;
      const value_id = action.value.id;
      const space_id = fullEntry.space;
      const is_protected = false;
      const id = generateTripleId({
        space_id,
        entity_id,
        attribute_id,
        value_id,
      });

      const entity_value_id = value_type === 'entity' ? value_id : null;
      const string_value =
        value_type === 'string' || value_type === 'image' || value_type === 'date' || value_type === 'url'
          ? action.value.value
          : null;

      const tupleType = action_type === 'deleteTriple' ? TripleAction.Delete : TripleAction.Create;

      return [
        tupleType,
        {
          id,
          entity_id,
          attribute_id,
          value_id,
          value_type,
          entity_value_id,
          string_value,
          space_id,
          is_protected,
          created_at: timestamp,
          created_at_block: blockNumber,
          is_stale: false,
        },
      ] as TripleWithActionTuple;
    });
  });

  return triples;
}

export function mapVersions({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: EntriesWithMetadata): Schema.versions.Insertable[] {
  return fullEntries.flatMap((fullEntry, entryIndex) => {
    const uniqueEntityIds = fullEntry.uriData.actions
      .map(action => action.entityId)
      .filter((value, index, self) => self.indexOf(value) === index);

    return uniqueEntityIds.map(entityId => {
      const proposedVersionName = fullEntry.uriData.name;
      return {
        id: generateVersionId({ entryIndex, entityId, cursor }),
        entity_id: entityId,
        created_at_block: blockNumber,
        created_at: timestamp,
        name: proposedVersionName ? proposedVersionName : null,
        proposed_version_id: generateVersionId({
          entryIndex,
          entityId,
          cursor,
        }),
        created_by_id: fullEntry.author,
        space_id: fullEntry.space,
      };
    });
  });
}
