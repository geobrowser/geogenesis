import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Record } from 'effect';

import { mergeEntityAsync } from '~/core/database/entities';
import { getRelations } from '~/core/database/relations';
import { getTriples } from '~/core/database/triples';
import { Relation } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { fetchEntity } from '~/core/io/subgraph';
import { queryClient } from '~/core/query-client';
import type {
  BaseRelationRenderableProperty,
  EntityRenderableProperty,
  ImageRelationRenderableProperty,
  NativeRenderableProperty,
  Triple,
} from '~/core/types';

export type ActionId = string;
export type BlockId = string;

export type BlockValueType = 'textBlock' | 'tableFilter' | 'imageBlock' | 'tableBlock' | 'markdownContent';

export type Changeset = {
  name: string;
  blocks?: Record<BlockId, BlockChange>;
  attributes?: Record<EntityId, RenderableChange>;
};

export type BlockChange = {
  type: BlockValueType;
  before: string | null;
  after: string | null;
};

type ChangeType = {
  type: 'ADD' | 'REMOVE' | 'UPDATE';
};

type RelationChangeValue = {
  value: string;
  valueName: string | null;
} & ChangeType;

type TripleChangeValue = {
  value: string;
  valueName: string | null;
} & ChangeType;

type Attribute = {
  id: string;
  name: string | null;
};

/**
 * The data model for how we represent changes maps to the data model we use
 * to render data, either as a native triple, entity triple, or relations and
 * their renderable types.
 *
 * This makes it so the diff UI can work the same way as our standard rendering UI.
 */
export type RenderableChange = TripleChange | RelationChange;

type RelationChange = BaseRelationChange | ImageRelationChange;

type BaseRelationChange = {
  type: BaseRelationRenderableProperty['type'];
  id: EntityId;
  attribute: Attribute;
  before: RelationChangeValue | null;
  after: RelationChangeValue;
};

type ImageRelationChange = {
  type: ImageRelationRenderableProperty['type'];
  id: EntityId;
  attribute: Attribute;
  before: RelationChangeValue | null;
  after: RelationChangeValue;
};

type NativeTripleChange = {
  type: NativeRenderableProperty['type'];
  id: EntityId;
  attribute: Attribute;
  before: TripleChangeValue | null;
  after: TripleChangeValue;
};

type EntityTripleChange = {
  type: EntityRenderableProperty['type'];
  id: EntityId;
  attribute: Attribute;
  before: RelationChangeValue | null;
  after: RelationChangeValue;
};

type TripleChange = NativeTripleChange | EntityTripleChange;

export type EntityChange = {
  id: EntityId;
  name: string | null;
  blockChanges: RenderableChange[];
  changes: RenderableChange[];
};

function getEntityAsync(id: EntityId) {
  return queryClient.fetchQuery({
    queryKey: ['entity-for-review', id],
    queryFn: () => fetchEntity({ id }),
  });
}

export async function fromLocal(spaceId?: string) {
  const triples = getTriples({
    selector: t => (t.hasBeenPublished === false && spaceId ? t.space === spaceId : true),
    includeDeleted: true,
  });

  const localRelations = getRelations({ includeDeleted: true });

  // This includes any relations that have been changed locally
  const entityIds = new Set([...triples.map(t => t.entityId), ...localRelations.map(r => r.fromEntity.id)]);
  const entityIdsToFetch = [...entityIds.values()];

  // @TODO: effect
  const remoteEntities = (await Promise.all(entityIdsToFetch.map(id => getEntityAsync(EntityId(id))))).filter(
    e => e !== null
  );

  // @TODO: performance by merging with above
  const localEntities = (await Promise.all(entityIdsToFetch.map(id => mergeEntityAsync(EntityId(id))))).filter(
    e => e !== null
  );

  // Aggregate remote triples into a map of entities -> attributes and attributes -> triples
  // Each map is 1:1 with each entity only having one attribute per attribute id and one triple per attribute id
  //
  // Additionally, make sure that we're filtering out triples that don't match the current space id.
  const localTriplesByEntityId = groupTriplesByEntityIdAndAttributeId(triples);
  const remoteTriplesByEntityId = groupTriplesByEntityIdAndAttributeId(
    remoteEntities.flatMap(e => e.triples).filter(t => (spaceId ? t.space === spaceId : true))
  );

  const localRelationsByEntityId = groupRelationsByEntityIdAndAttributeId(localRelations);
  const remoteRelationsByEntityId = groupRelationsByEntityIdAndAttributeId(remoteEntities.flatMap(e => e.relationsOut));

  const changes = localEntities.map((entity): EntityChange => {
    const tripleChanges: TripleChange[] = [];
    const relationChanges: RelationChange[] = [];

    const localTriplesForEntity = localTriplesByEntityId[entity.id] ?? {};
    const remoteTriplesForEntity = remoteTriplesByEntityId[entity.id] ?? {};
    const localRelationsForEntity = localRelationsByEntityId[entity.id] ?? {};
    const remoteRelationsForEntity = remoteRelationsByEntityId[entity.id] ?? {};

    for (const triple of Object.values(localTriplesForEntity)) {
      const remoteTriple = remoteTriplesForEntity[triple.attributeId] ?? null;
      const before = getBeforeTripleChange(triple, remoteTriple);
      const after = getAfterTripleChange(triple, remoteTriple);

      tripleChanges.push({
        id: entity.id,
        attribute: {
          id: triple.attributeId,
          name: triple.attributeName,
        },
        type: triple.value.type,
        before,
        after,
      });
    }

    for (const relations of Object.values(localRelationsForEntity)) {
      const remoteRelationsForAttributeId = remoteRelationsForEntity[entity.id] ?? null;

      for (const relation of relations) {
        const before = getBeforeRelationChange(relation, remoteRelationsForAttributeId);
        const after = getAfterRelationChange(relation, remoteRelationsForAttributeId);

        // @TODO: Handle block relations
        if (relation.toEntity.renderableType === 'DATA' || relation.toEntity.renderableType === 'TEXT') {
          continue;
        }

        relationChanges.push({
          id: entity.id,
          attribute: {
            id: relation.typeOf.id,
            name: relation.typeOf.name,
          },
          type: 'RELATION',
          before,
          after,
        });
      }
    }

    // Filter out any "dead" changes where the values are the exact same
    // in the before and after.
    const realChanges = [...tripleChanges, ...relationChanges].filter(c => isRealChange(c.before, c.after));

    // @TODO: Need to do more work for block diffs?
    const blockChanges = relationChanges.filter(c => c.attribute.id === SYSTEM_IDS.BLOCKS);

    return {
      id: entity.id,
      name: entity.name,
      blockChanges,
      changes: realChanges,
    };
  });

  console.log('changes', changes);

  // For each change grouping, we want to diff between the relations and triples
  return changes;
}

function isRealChange(before: TripleChangeValue | null, after: TripleChangeValue) {
  // The before and after values are the same
  if (before?.value === after.value) {
    return false;
  }

  // We add then remove a triple locally that doesn't exist remotely
  if (before === null && after.type === 'REMOVE') {
    return false;
  }

  return true;
}

type TripleByAttributeMap = Record<string, Triple>;
type EntityByAttributeMapMap = Record<string, TripleByAttributeMap>;

function groupTriplesByEntityIdAndAttributeId(triples: Triple[]) {
  return triples.reduce<EntityByAttributeMapMap>((acc, triple) => {
    const entityId = triple.entityId;
    const attributeId = triple.attributeId;

    if (!acc[entityId]) {
      acc[entityId] = {};
    }

    acc[entityId][attributeId] = triple;

    return acc;
  }, {});
}

function groupRelationsByEntityIdAndAttributeId(relations: Relation[]) {
  return relations.reduce<Record<string, Record<string, Relation[]>>>((acc, relation) => {
    const entityId = relation.fromEntity.id;
    const attributeId = relation.typeOf.id;

    if (!acc[entityId]) {
      acc[entityId] = {};
    }

    if (!acc[entityId][attributeId]) {
      acc[entityId][attributeId] = [];
    }

    acc[entityId][attributeId].push(relation);

    return acc;
  }, {});
}

/**
 * Compare the local triple with the remote triple and return the TripleChange.
 * The TripleChange is used to represent what either the before or after renderable
 * should be to include the type of diff to show in the UI.
 *
 * @params triple - the local triple as it exists in the local database as a {@link Triple}
 * @params remoteTriple - the remote triple as it exists in the remote database as a {@link Triple}
 * @returns - {@link TripleChange} or null if the triple is not present in the remote database
 */
function getBeforeTripleChange(
  triple: Triple,
  remoteTriple: Triple | null
): (TripleChangeValue | RelationChangeValue) | null {
  if (remoteTriple === null) {
    return null;
  }

  if (triple.value.value !== remoteTriple.value.value) {
    return {
      value: remoteTriple.value.value,
      valueName: remoteTriple.value.type === 'ENTITY' ? remoteTriple.value.name : null,
      type: 'UPDATE',
    };
  }

  return {
    value: remoteTriple.value.value,
    valueName: remoteTriple.value.type === 'ENTITY' ? remoteTriple.value.name : null,
    type: 'REMOVE',
  };
}

/**
 * Compare the local triple with the remote triple and return the TripleChange for the
 * "after" triple. The TripleChange is used to represent what either the before or after
 * renderable should be to include the type of diff to show in the UI.
 *
 * @params triple - the local triple as it exists in the local database as a {@link Triple}
 * @params remoteTriple - the remote triple as it exists in the remote database as a {@link Triple}
 * @returns - {@link TripleChange}. There is always an after triple change, so this version
 * of the function always returns a value.
 */
function getAfterTripleChange(triple: Triple, remoteTriple: Triple | null): TripleChangeValue | RelationChangeValue {
  if (remoteTriple === null) {
    return {
      value: triple.value.value,
      valueName: triple.value.type === 'ENTITY' ? triple.value.name : null,
      type: 'ADD',
    };
  }

  if (triple.value.value !== remoteTriple.value.value) {
    return {
      value: triple.value.value,
      valueName: triple.value.type === 'ENTITY' ? triple.value.name : null,
      type: 'UPDATE',
    };
  }

  return {
    value: triple.value.value,
    valueName: triple.value.type === 'ENTITY' ? triple.value.name : null,
    type: 'ADD',
  };
}

function getBeforeRelationChange(relation: Relation, remoteRelations: Relation[] | null): RelationChangeValue | null {
  if (remoteRelations === null) {
    return null;
  }

  const maybeRemoteRelationWithSameId = remoteRelations.find(r => r.id === relation.id);

  if (!maybeRemoteRelationWithSameId) {
    return null;
  }

  if (relation.toEntity.value !== maybeRemoteRelationWithSameId.toEntity.value) {
    return {
      value: maybeRemoteRelationWithSameId.toEntity.value,
      valueName: maybeRemoteRelationWithSameId.toEntity.name,
      type: 'UPDATE',
    };
  }

  return {
    value: maybeRemoteRelationWithSameId.toEntity.value,
    valueName: maybeRemoteRelationWithSameId.toEntity.name,
    type: 'REMOVE',
  };
}

function getAfterRelationChange(relation: Relation, remoteRelations: Relation[] | null): RelationChangeValue {
  if (remoteRelations === null) {
    return {
      value: relation.toEntity.value,
      valueName: relation.toEntity.name,
      type: 'ADD',
    };
  }

  const maybeRemoteRelationWithSameId = remoteRelations.find(r => r.id === relation.id);

  if (!maybeRemoteRelationWithSameId) {
    return {
      value: relation.toEntity.value,
      valueName: relation.toEntity.name,
      type: 'ADD',
    };
  }

  if (relation.toEntity.value !== maybeRemoteRelationWithSameId.toEntity.value) {
    return {
      value: relation.toEntity.value,
      valueName: relation.toEntity.name,
      type: 'UPDATE',
    };
  }

  return {
    value: relation.toEntity.value,
    valueName: relation.toEntity.name,
    type: 'ADD',
  };
}

// export async function fromVersion(versionId: string, previousVersionId: string, subgraph: Subgraph.ISubgraph) {
// const changes: Record<EntityId, Changeset> = {};

//   const [selectedVersion, previousVersion] = await Promise.all([
//     fetchVersion({ versionId: versionId }),
//     fetchVersion({ versionId: previousVersionId }),
//   ]);

//   const versions = {
//     selected: selectedVersion,
//     previous: previousVersion,
//   };

//   let entityId = '';
//   let selectedBlock = 0;
//   let previousBlock = 0;

//   if (selectedVersion) {
//     entityId = selectedVersion.entity.id;

//     selectedBlock = parseInt(selectedVersion.createdAtBlock, 10);
//     previousBlock = selectedBlock - 1;
//   }

//   const selectedEntityBlockIdsTriple = selectedVersion?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
//   const selectedEntityBlockIds: string[] = selectedEntityBlockIdsTriple
//     ? JSON.parse(Values.stringValue(selectedEntityBlockIdsTriple) || '[]')
//     : [];

//   const previousEntityBlockIdsTriple = previousVersion?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
//   const previousEntityBlockIds: string[] = previousEntityBlockIdsTriple
//     ? JSON.parse(Values.stringValue(previousEntityBlockIdsTriple) || '[]')
//     : [];

//   const [maybeRemoteSelectedEntityBlocks, maybeRemotePreviousEntityBlocks, maybeAdditionalRemotePreviousEntityBlocks] =
//     await Promise.all([
//       Promise.all(selectedEntityBlockIds.map(entityId => subgraph.fetchEntity({ id: entityId }))),
//       Promise.all(selectedEntityBlockIds.map(entityId => subgraph.fetchEntity({ id: entityId }))),
//       Promise.all(previousEntityBlockIds.map(entityId => subgraph.fetchEntity({ id: entityId }))),
//     ]);

//   if (selectedVersion) {
//     changes[entityId] = {
//       name: previousVersion?.name ?? '',
//     };

//     selectedVersion.triples.map(triple => {
//       switch (triple.value.type) {
//         case 'ENTITY': {
//           changes[entityId] = {
//             ...changes[entityId],
//             attributes: {
//               ...(changes[entityId]?.attributes ?? {}),
//               [triple.attributeId]: {
//                 ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
//                 type: triple.value.type ?? '',
//                 name: triple.attributeName ?? '',
//                 before: [],
//                 after: [...(changes[entityId]?.attributes?.[triple.attributeId]?.after ?? []), triple.value.name],
//                 actions: [],
//               },
//             },
//           };
//           break;
//         }

//         default: {
//           changes[entityId] = {
//             ...changes[entityId],
//             attributes: {
//               ...(changes[entityId]?.attributes ?? {}),
//               [triple.attributeId]: {
//                 ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
//                 type: triple.value.type ?? '',
//                 name: triple.attributeName ?? '',
//                 before: null,
//                 after: Triples.getValue(triple) ?? '',
//                 actions: [],
//               },
//             },
//           };
//           break;
//         }
//       }
//     });
//   }

//   if (previousVersion) {
//     previousVersion.triples.map(triple => {
//       switch (triple.value.type) {
//         case 'ENTITY': {
//           changes[entityId] = {
//             ...changes[entityId],
//             attributes: {
//               ...(changes[entityId]?.attributes ?? {}),
//               [triple.attributeId]: {
//                 ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
//                 type: triple.value.type ?? '',
//                 name: triple.attributeName ?? '',
//                 before: [...(changes[entityId]?.attributes?.[triple.attributeId]?.before ?? []), triple.value.name],
//                 after: changes[entityId]?.attributes?.[triple.attributeId]?.after ?? null,
//                 actions: [],
//               },
//             },
//           };
//           break;
//         }
//         default: {
//           changes[entityId] = {
//             ...changes[entityId],
//             attributes: {
//               ...(changes[entityId]?.attributes ?? {}),
//               [triple.attributeId]: {
//                 ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
//                 type: triple.value.type ?? '',
//                 name: triple.attributeName ?? '',
//                 before: Triples.getValue(triple) ?? '',
//                 after: changes[entityId]?.attributes?.[triple.attributeId]?.after ?? null,
//                 actions: [],
//               },
//             },
//           };
//           break;
//         }
//       }
//     });
//   }

//   if (maybeRemoteSelectedEntityBlocks) {
//     maybeRemoteSelectedEntityBlocks.forEach(selectedEntityBlock => {
//       if (selectedEntityBlock === null) return;

//       changes[entityId] = {
//         ...changes[entityId],
//         blocks: {
//           ...(changes[entityId]?.blocks ?? {}),
//           [selectedEntityBlock.id]: {
//             type: getBlockTypeFromTriples(selectedEntityBlock.triples),
//             before: null,
//             after: getBlockValueFromTriples(selectedEntityBlock.triples),
//           },
//         },
//       };
//     });
//   }

//   if (maybeRemotePreviousEntityBlocks) {
//     maybeRemotePreviousEntityBlocks.forEach(previousEntityBlock => {
//       if (previousEntityBlock === null) return;

//       changes[entityId] = {
//         ...changes[entityId],
//         blocks: {
//           ...(changes[entityId]?.blocks ?? {}),
//           [previousEntityBlock.id]: {
//             ...(changes[entityId]?.blocks?.[previousEntityBlock.id] ?? {}),
//             before: getBlockValueFromTriples(previousEntityBlock.triples),
//           } as BlockChange,
//         },
//       };
//     });
//   }

//   if (maybeAdditionalRemotePreviousEntityBlocks) {
//     maybeAdditionalRemotePreviousEntityBlocks.forEach(previousEntityBlock => {
//       if (previousEntityBlock === null) return;

//       changes[entityId] = {
//         ...changes[entityId],
//         blocks: {
//           ...(changes[entityId]?.blocks ?? {}),
//           [previousEntityBlock.id]: {
//             ...(changes[entityId]?.blocks?.[previousEntityBlock.id] ?? {}),
//             type: getBlockTypeFromTriples(previousEntityBlock.triples),
//             before: getBlockValueFromTriples(previousEntityBlock.triples),
//             after: changes[entityId]?.blocks?.[previousEntityBlock.id]?.after ?? null,
//           },
//         },
//       };
//     });
//   }

//   return { changes, versions };
// }

// export async function fromProposal(proposalId: string, previousProposalId: string, subgraph: Subgraph.ISubgraph) {
//   const changes: Record<EntityId, Changeset> = {};

//   const [selectedProposal, previousProposal] = await Promise.all([
//     subgraph.fetchProposal({ id: proposalId }),
//     subgraph.fetchProposal({ id: previousProposalId }),
//   ]);

//   const proposals = {
//     selected: selectedProposal,
//     previous: previousProposal,
//   };

//   const entitySet = new Set<EntityId>();

//   if (selectedProposal) {
//     selectedProposal.proposedVersions.forEach(proposedVersion => entitySet.add(proposedVersion.entity.id));
//   }

//   const entityIds = [...entitySet.values()];

//   for (const entityId of entityIds) {
//     // Fetch the entity versions that correlate with the selected and previous proposals
//     // There's no way to fetch a specific version by proposal id so we need to fetch all
//     // versions by proposal id and select the first one. There should only ever be one
//     // version for an entity for a proposal.
//     const [maybeSelectedVersions, maybePreviousVersions] = await Promise.all([
//       selectedProposal ? fetchVersions({ entityId: entityId, proposalId: selectedProposal.id }) : [],
//       previousProposal ? fetchVersions({ entityId: entityId, proposalId: previousProposal.id }) : [],
//     ]);

//     const selectedVersion: Version | undefined = maybeSelectedVersions[0];
//     const previousVersion: Version | undefined = maybePreviousVersions[0];

//     const selectedEntityBlockIdsTriple =
//       selectedVersion?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
//     const selectedEntityBlockIds: string[] = selectedEntityBlockIdsTriple
//       ? JSON.parse(Values.stringValue(selectedEntityBlockIdsTriple) || '[]')
//       : [];

//     const previousEntityBlockIdsTriple =
//       previousVersion?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
//     const previousEntityBlockIds: string[] = previousEntityBlockIdsTriple
//       ? JSON.parse(Values.stringValue(previousEntityBlockIdsTriple) || '[]')
//       : [];

//     const [
//       maybeRemoteSelectedEntityBlocks,
//       maybeRemotePreviousEntityBlocks,
//       maybeAdditionalRemotePreviousEntityBlocks,
//     ] = await Promise.all([
//       Promise.all(selectedEntityBlockIds.map(entityId => subgraph.fetchEntity({ id: entityId }))),
//       Promise.all(selectedEntityBlockIds.map(entityId => subgraph.fetchEntity({ id: entityId }))),
//       Promise.all(previousEntityBlockIds.map(previousEntityId => subgraph.fetchEntity({ id: previousEntityId }))),
//     ]);

//     if (selectedVersion && !selectedVersion.triples.find(triple => triple.attributeId === SYSTEM_IDS.PARENT_ENTITY)) {
//       changes[entityId] = {
//         name: selectedVersion.entity.name ?? '',
//       };

//       selectedVersion.triples.map(triple => {
//         switch (triple.value.type) {
//           case 'ENTITY': {
//             changes[entityId] = {
//               ...changes[entityId],
//               attributes: {
//                 ...(changes[entityId]?.attributes ?? {}),
//                 [triple.attributeId]: {
//                   ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
//                   type: triple.value.type ?? '',
//                   name: triple.attributeName ?? '',
//                   before: [],
//                   after: [...(changes[entityId]?.attributes?.[triple.attributeId]?.after ?? []), triple.value.name],
//                   actions: [],
//                 },
//               },
//             };
//             break;
//           }

//           default: {
//             changes[entityId] = {
//               ...changes[entityId],
//               attributes: {
//                 ...(changes[entityId]?.attributes ?? {}),
//                 [triple.attributeId]: {
//                   ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
//                   type: triple.value.type ?? '',
//                   name: triple.attributeName ?? '',
//                   before: null,
//                   after: Triples.getValue(triple) ?? '',
//                   actions: [],
//                 },
//               },
//             };
//             break;
//           }
//         }
//       });
//     }

//     if (previousVersion && !previousVersion.triples.find(triple => triple.attributeId === SYSTEM_IDS.PARENT_ENTITY)) {
//       previousVersion.triples.map(triple => {
//         switch (triple.value.type) {
//           case 'ENTITY': {
//             changes[entityId] = {
//               ...changes[entityId],
//               attributes: {
//                 ...(changes[entityId]?.attributes ?? {}),
//                 [triple.attributeId]: {
//                   ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
//                   type: triple.value.type ?? '',
//                   name: triple.attributeName ?? '',
//                   before: [...(changes[entityId]?.attributes?.[triple.attributeId]?.before ?? []), triple.value.name],
//                   after: changes[entityId]?.attributes?.[triple.attributeId]?.after ?? null,
//                   actions: [],
//                 },
//               },
//             };
//             break;
//           }
//           default: {
//             changes[entityId] = {
//               ...changes[entityId],
//               attributes: {
//                 ...(changes[entityId]?.attributes ?? {}),
//                 [triple.attributeId]: {
//                   ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
//                   type: triple.value.type ?? '',
//                   name: triple.attributeName ?? '',
//                   before: Triples.getValue(triple) ?? '',
//                   after: changes[entityId]?.attributes?.[triple.attributeId]?.after ?? null,
//                   actions: [],
//                 },
//               },
//             };
//             break;
//           }
//         }
//       });
//     }

//     if (maybeRemoteSelectedEntityBlocks) {
//       maybeRemoteSelectedEntityBlocks.forEach(selectedEntityBlock => {
//         if (selectedEntityBlock === null) return;

//         changes[entityId] = {
//           ...changes[entityId],
//           blocks: {
//             ...(changes[entityId]?.blocks ?? {}),
//             [selectedEntityBlock.id]: {
//               type: getBlockTypeFromTriples(selectedEntityBlock.triples),
//               before: null,
//               after: getBlockValueFromTriples(selectedEntityBlock.triples),
//             },
//           },
//         };
//       });
//     }

//     if (maybeRemotePreviousEntityBlocks) {
//       maybeRemotePreviousEntityBlocks.forEach(previousEntityBlock => {
//         if (previousEntityBlock === null) return;

//         changes[entityId] = {
//           ...changes[entityId],
//           blocks: {
//             ...(changes[entityId]?.blocks ?? {}),
//             [previousEntityBlock.id]: {
//               ...(changes[entityId]?.blocks?.[previousEntityBlock.id] ?? {}),
//               before: getBlockValueFromTriples(previousEntityBlock.triples),
//             } as BlockChange,
//           },
//         };
//       });
//     }

//     if (maybeAdditionalRemotePreviousEntityBlocks) {
//       maybeAdditionalRemotePreviousEntityBlocks.forEach(previousEntityBlock => {
//         if (previousEntityBlock === null) return;

//         changes[entityId] = {
//           ...changes[entityId],
//           blocks: {
//             ...(changes[entityId]?.blocks ?? {}),
//             [previousEntityBlock.id]: {
//               ...(changes[entityId]?.blocks?.[previousEntityBlock.id] ?? {}),
//               type: getBlockTypeFromTriples(previousEntityBlock.triples),
//               before: getBlockValueFromTriples(previousEntityBlock.triples),
//               after: changes[entityId]?.blocks?.[previousEntityBlock.id]?.after ?? null,
//             },
//           },
//         };
//       });
//     }
//   }

//   return { changes, proposals };
// }

// const getBlockTypeFromTriples = (triples: TripleType[]): BlockValueType => {
//   const tripleWithContent = triples.find(triple => CONTENT_ATTRIBUTE_IDS.includes(triple.attributeId));

//   // @TODO replace with better fallback
//   if (!tripleWithContent) return 'markdownContent';

//   switch (tripleWithContent.attributeId) {
//     case SYSTEM_IDS.ROW_TYPE:
//     case SYSTEM_IDS.TABLE_BLOCK:
//       return 'tableBlock';
//     case SYSTEM_IDS.IMAGE_BLOCK:
//       return 'imageBlock';
//     case SYSTEM_IDS.MARKDOWN_CONTENT:
//       return 'markdownContent';
//     case SYSTEM_IDS.FILTER:
//       return 'tableFilter';
//     default:
//       // @TODO replace with better fallback
//       return 'markdownContent';
//   }
// };

// const getBlockValueFromTriples = (triples: TripleType[]) => {
//   const tripleWithContent = triples.find(triple => CONTENT_ATTRIBUTE_IDS.includes(triple.attributeId));

//   // @TODO replace with better fallback
//   if (!tripleWithContent) {
//     return '';
//   }

//   if (tripleWithContent.attributeId === SYSTEM_IDS.ROW_TYPE) {
//     return tripleWithContent.entityName;
//   }

//   return Triples.getValue(tripleWithContent);
// };

// const CONTENT_ATTRIBUTE_IDS = [
//   SYSTEM_IDS.ROW_TYPE,
//   SYSTEM_IDS.TABLE_BLOCK,
//   SYSTEM_IDS.IMAGE_BLOCK,
//   SYSTEM_IDS.MARKDOWN_CONTENT,
//   SYSTEM_IDS.FILTER,
// ];
