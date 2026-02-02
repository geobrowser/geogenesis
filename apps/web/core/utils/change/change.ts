import { GraphUrl, Id, SystemIds } from '@geoprotocol/geo-sdk';
import { Effect, Record } from 'effect';
import equal from 'fast-deep-equal';

import { Proposal } from '~/core/io/dto/proposals';
import { fetchParentEntityId } from '~/core/io/fetch-parent-entity-id';
import { getBatchEntities } from '~/core/io/v2/queries';
import { queryClient } from '~/core/query-client';
import { E } from '~/core/sync/orm';
import { store } from '~/core/sync/use-sync-engine';
import { Entities } from '~/core/utils/entity';
import { Entity, Relation, Value } from '~/core/v2.types';

import { fetchPreviousVersionByCreatedAt } from './fetch-previous-version-by-created-at';
import { fetchVersionsByEditId } from './fetch-versions-by-edit-id';
import { AfterRelationDiff, BeforeRelationDiff } from './get-relation-change';
import { AfterTripleDiff, BeforeTripleDiff } from './get-triple-change';
import {
  BlockChange,
  EntityChange,
  RelationChange,
  RelationChangeValue,
  TripleChange,
  TripleChangeValue,
} from './types';

async function fetchEntitiesBatchCached(options: { spaceId: string; entityIds: string[] }) {
  const { spaceId, entityIds } = options;

  return queryClient.fetchQuery({
    queryKey: ['entities-batch', spaceId, entityIds],
    queryFn: () => Effect.runPromise(getBatchEntities(options.entityIds, options.spaceId)),
  });
}

export async function fromLocal(spaceId?: string): Promise<EntityChange[]> {
  return [];
  // const values = getValues({
  //   selector: t => (t.hasBeenPublished === false && spaceId ? t.spaceId === spaceId : true),
  //   includeDeleted: true,
  // });

  // const localRelations = getRelations({
  //   selector: r => (r.hasBeenPublished === false && spaceId ? r.spaceId === spaceId : true),
  //   includeDeleted: true,
  // });

  // // @TODO Space id filtering isn't working  for local relations for some reason
  // const actualLocal = localRelations.filter(r => (spaceId ? r.spaceId === spaceId : true));

  // const entityIds = new Set([
  //   ...values.map(t => t.entity.id),
  //   // Relations don't alter the `from` entity directly, so in cases where a relation
  //   // is modified we also need to query the `from` entity so we can render diffs
  //   // from the perspective of the `from` entity.
  //   ...actualLocal.map(r => r.fromEntity.id),
  // ]);

  // const entityIdsToFetch = [...entityIds.values()];

  // const collectEntities = Effect.gen(function* () {

  //   const maybeRemoteEntitiesEffect = Effect.promise(() =>
  //     fetchEntitiesBatchCached({ spaceId, entityIds: entityIdsToFetch })
  //   );

  //   const maybeLocalEntitiesEffect = Effect.promise(async () => {
  //     const localEntitiesWithRemoteData = await fetchEntitiesBatchCached({ spaceId, entityIds: entityIdsToFetch });

  //     const allEntities: Entity[] = [];

  //     entityIdsToFetch.forEach(entityId => {
  //       const localEntityWithRemoteData = localEntitiesWithRemoteData.find(entity => entity.id === entityId);

  //       if (localEntityWithRemoteData) {
  //         allEntities.push(localEntityWithRemoteData);
  //       } else {
  //         allEntities.push({
  //           id: entityId,
  //           name: null,
  //           description: null,
  //           spaces: [],
  //           types: [],
  //           relations: [],
  //           values: [],
  //         });
  //       }
  //     });

  //     const mergedEntities = allEntities.map(e =>
  //       E.merge({
  //         id: e.id,
  //         store: store,
  //         mergeWith: e,
  //       })
  //     );

  //     return mergedEntities;
  //   });

  //   const [maybeRemoteEntities, maybeLocalEntities] = yield* Effect.all(
  //     [maybeRemoteEntitiesEffect, maybeLocalEntitiesEffect],
  //     { concurrency: 2 }
  //   );

  //   const remoteEntities = maybeRemoteEntities.filter(e => e !== null);
  //   const localEntities = maybeLocalEntities.filter(e => e !== null);

  // return {
  // remoteEntities,
  // localEntities,
  // };
  // });

  // const { remoteEntities, localEntities } = await Effect.runPromise(collectEntities);

  // const beforeEntities = remoteEntities.filter(entity => getIsRenderedAsEntity(entity));
  // const beforeEntityIdsSet = new Set(beforeEntities.map(entity => entity.id));

  // const afterEntities = localEntities.filter(entity => getIsRenderedAsEntity(entity));

  // const possibleBeforeBlocks = remoteEntities.filter(entity => !getIsRenderedAsEntity(entity));
  // const possibleAfterBlocks = localEntities.filter(entity => !getIsRenderedAsEntity(entity));
  // const possibleBlockIds = possibleAfterBlocks.map(entity => entity.id);

  // const possibleBlockParentEntityIds = await getBlockParentEntityIds(possibleBlockIds, afterEntities);

  // const parentEntityIdsSet: Set<string> = new Set();
  // [...Object.values(possibleBlockParentEntityIds).filter(Boolean)].forEach(entityId => {
  //   if (entityId && !entityIds.has(entityId)) {
  //     parentEntityIdsSet.add(entityId);
  //   }
  // });

  // const { createdBlockParentEntityIds, deletedBlockParentEntityIds } = getNewAndDeletedBlockParentEntityIds(
  //   beforeEntities,
  //   afterEntities
  // );

  // const parentEntityIdsToFetch = [...parentEntityIdsSet.values()].filter(entityId => !beforeEntityIdsSet.has(entityId));

  // const collectParentEntities = Effect.gen(function* () {
  //   const maybeRemoteParentEntitiesEffect = Effect.promise(() =>
  //     fetchEntitiesBatchCached({ spaceId, entityIds: parentEntityIdsToFetch })
  //   );

  //   const maybeLocalParentEntitiesEffect = Effect.promise(async () => {
  //     const localParentEntitiesWithRemoteData = await fetchEntitiesBatchCached({
  //       spaceId,
  //       entityIds: entityIdsToFetch,
  //     });

  //     const allParentEntities: Entity[] = [];

  //     entityIdsToFetch.forEach(entityId => {
  //       const localParentEntityWithRemoteData = localParentEntitiesWithRemoteData.find(
  //         entity => entity.id === entityId
  //       );

  //       if (localParentEntityWithRemoteData) {
  //         allParentEntities.push(localParentEntityWithRemoteData);
  //       } else {
  //         allParentEntities.push({
  //           id: entityId,
  //           name: null,
  //           description: null,
  //           spaces: [],
  //           types: [],
  //           relations: [],
  //           values: [],
  //         });
  //       }
  //     });

  //     const mergedParentEntities = allParentEntities.map(e =>
  //       E.merge({
  //         id: e.id,
  //         store: store,
  //         mergeWith: e,
  //       })
  //     );

  //     return mergedParentEntities;
  //   });

  //   const [maybeRemoteParentEntities, maybeLocalParentEntities] = yield* Effect.all(
  //     [maybeRemoteParentEntitiesEffect, maybeLocalParentEntitiesEffect],
  //     { concurrency: 2 }
  //   );

  //   const remoteParentEntities = maybeRemoteParentEntities.filter(e => e !== null);
  //   const localParentEntities = maybeLocalParentEntities.filter(e => e !== null);

  //   return {
  //     remoteParentEntities,
  //     localParentEntities,
  //   };
  // });

  // const { remoteParentEntities, localParentEntities } = await Effect.runPromise(collectParentEntities);

  // const beforeParentEntities = remoteParentEntities.filter(entity => getIsRenderedAsEntity(entity));
  // const afterParentEntities = localParentEntities.filter(entity => getIsRenderedAsEntity(entity));

  // const parentEntityIds: Record<string, string | null> = {
  //   ...possibleBlockParentEntityIds,
  //   ...createdBlockParentEntityIds,
  //   ...deletedBlockParentEntityIds,
  // };

  // const aggregateChangesArgs = {
  //   spaceId,
  //   beforeEntities: [...beforeEntities, ...beforeParentEntities],
  //   afterEntities: [...afterEntities, ...afterParentEntities],
  //   beforeBlocks: possibleBeforeBlocks,
  //   afterBlocks: possibleAfterBlocks,
  //   parentEntityIds,
  // };

  // const changes = aggregateChanges(aggregateChangesArgs);

  // return changes;
}

export async function fromActiveProposal(proposal: Proposal, spaceId: string): Promise<EntityChange[]> {
  const versionsByEditId = await fetchVersionsByEditId({ editId: proposal.editId, spaceId });

  // Version entity ids are mapped to the version.id
  const currentVersionsForEntityIds = await Effect.runPromise(
    getBatchEntities(
      versionsByEditId.map(v => v.id),
      spaceId
    )
  );

  const beforeEntities = currentVersionsForEntityIds
    .filter(v => v !== null)
    .filter(entity => getIsRenderedAsEntity(entity));
  const beforeEntityIdsSet = new Set(beforeEntities.map(entity => entity.id));
  const afterEntities = versionsByEditId.filter(entity => getIsRenderedAsEntity(entity));

  const possibleBeforeBlocks = currentVersionsForEntityIds
    .filter(v => v !== null)
    .filter(entity => !getIsRenderedAsEntity(entity));
  const possibleAfterBlocks = versionsByEditId.filter(entity => !getIsRenderedAsEntity(entity));
  const possibleBlockIds = possibleBeforeBlocks.map(entity => entity.id);

  const possibleBlockParentEntityIds = await getBlockParentEntityIds(possibleBlockIds, beforeEntities);

  const parentEntityIdsSet: Set<string> = new Set();
  [...Object.values(possibleBlockParentEntityIds).filter(Boolean)].forEach(entityId => {
    if (entityId) {
      parentEntityIdsSet.add(entityId);
    }
  });

  const { createdBlockParentEntityIds, deletedBlockParentEntityIds } = getNewAndDeletedBlockParentEntityIds(
    beforeEntities,
    afterEntities
  );

  const parentEntityIdsToFetch = [...parentEntityIdsSet.values()].filter(entityId => !beforeEntityIdsSet.has(entityId));

  const beforeParentEntities = await Effect.runPromise(getBatchEntities(parentEntityIdsToFetch, spaceId));

  const parentEntityIds: Record<string, string | null> = {
    ...possibleBlockParentEntityIds,
    ...createdBlockParentEntityIds,
    ...deletedBlockParentEntityIds,
  };

  return aggregateChanges({
    spaceId: proposal.space.id,
    beforeEntities: [...beforeEntities, ...beforeParentEntities],
    afterEntities,
    beforeBlocks: possibleBeforeBlocks,
    afterBlocks: possibleAfterBlocks,
    parentEntityIds,
  });
}

export async function fromEndedProposal(proposal: Proposal, spaceId: string): Promise<EntityChange[]> {
  return [];
  // const versionsByEditId = await fetchVersionsByEditId({ editId: proposal.editId, spaceId });

  // // const previousVersions = await fetchVersionsBatch({
  // //   versionIds: versionsByEditId.map(v => v.versionId),
  // // });

  // // We should batch this but not sure the easiest way to do it in a single query
  // const previousVersions = await Promise.all(
  //   versionsByEditId.map(v => {
  //     return fetchPreviousVersionByCreatedAt({
  //       createdAt: proposal.createdAt,
  //       entityId: v.id,
  //       spaceId: proposal.space.id,
  //     });
  //   })
  // );

  // const beforeEntities = previousVersions.filter(e => e !== null).filter(entity => getIsRenderedAsEntity(entity));
  // const beforeEntityIdsSet = new Set(beforeEntities.map(entity => entity.id));
  // const afterEntities = versionsByEditId.filter(entity => getIsRenderedAsEntity(entity));

  // const possibleBeforeBlocks = previousVersions
  //   .filter(e => e !== null)
  //   .filter(entity => !getIsRenderedAsEntity(entity));
  // const possibleAfterBlocks = versionsByEditId.filter(entity => !getIsRenderedAsEntity(entity));
  // const possibleBlockIds = possibleBeforeBlocks.map(entity => entity.id);

  // const possibleBlockParentEntityIds = await getBlockParentEntityIds(possibleBlockIds, beforeEntities);

  // const parentEntityIdsSet: Set<string> = new Set();
  // [...Object.values(possibleBlockParentEntityIds).filter(Boolean)].forEach(entityId => {
  //   if (entityId) {
  //     parentEntityIdsSet.add(entityId);
  //   }
  // });

  // const { createdBlockParentEntityIds, deletedBlockParentEntityIds } = getNewAndDeletedBlockParentEntityIds(
  //   beforeEntities,
  //   afterEntities
  // );

  // const parentEntityIdsToFetch = [...parentEntityIdsSet.values()].filter(entityId => !beforeEntityIdsSet.has(entityId));

  // const beforeParentEntities = await Effect.runPromise(getBatchEntities(parentEntityIdsToFetch, spaceId));

  // const parentEntityIds: Record<string, string | null> = {
  //   ...possibleBlockParentEntityIds,
  //   ...createdBlockParentEntityIds,
  //   ...deletedBlockParentEntityIds,
  // };

  // return aggregateChanges({
  //   spaceId: proposal.space.id,
  //   beforeEntities: [...beforeEntities, ...beforeParentEntities],
  //   afterEntities,
  //   beforeBlocks: possibleBeforeBlocks,
  //   afterBlocks: possibleAfterBlocks,
  //   parentEntityIds,
  // });
}

interface AggregateChangesArgs {
  spaceId?: string;
  afterEntities: Entity[];
  beforeEntities: Entity[];
  afterBlocks: Entity[];
  beforeBlocks: Entity[];
  parentEntityIds: Record<string, string | null>;
}

export function aggregateChanges({
  spaceId,
  afterEntities,
  beforeEntities,
  afterBlocks,
  beforeBlocks,
  parentEntityIds,
}: AggregateChangesArgs): EntityChange[] {
  return [];
  // Aggregate remote data into a map of entities -> attributes and attributes -> triples
  // Each map is 1:1 with each entity only having one attribute per attribute id and one triple per attribute id
  //
  // Additionally, make sure that we're filtering out triples that don't match the current space id.
  // const afterTriplesByEntityId = groupTriplesByEntityIdAndAttributeId(
  //   afterEntities.flatMap(e => e.values).filter(t => (spaceId ? t.spaceId === spaceId : true))
  // );
  // const beforeTriplesByEntityId = groupTriplesByEntityIdAndAttributeId(
  //   beforeEntities.flatMap(e => e.values).filter(t => (spaceId ? t.spaceId === spaceId : true))
  // );

  // const afterRelationsByEntityId = groupRelationsByEntityIdAndAttributeId(
  //   afterEntities.flatMap(e => e.relations.filter(r => (spaceId ? r.spaceId === spaceId : true)))
  // );
  // const beforeRelationsByEntityId = groupRelationsByEntityIdAndAttributeId(
  //   beforeEntities.flatMap(e => e.relations.filter(r => (spaceId ? r.spaceId === spaceId : true)))
  // );

  // const afterEntityIds = afterEntities.map(entity => entity.id);
  // const changedEntitiesSet: Set<string> = new Set();
  // afterEntityIds.forEach(entityId => {
  //   changedEntitiesSet.add(entityId);
  // });
  // Object.values(parentEntityIds).forEach(entityId => {
  //   if (entityId) {
  //     changedEntitiesSet.add(entityId);
  //   }
  // });
  // const changedEntities: string[] = [...changedEntitiesSet.values()];

  // const afterBlockIds = afterBlocks.map(block => block.id);
  // const changedBlocksSet: Set<string> = new Set();
  // afterBlockIds.forEach(blockId => {
  //   changedBlocksSet.add(blockId);
  // });
  // Object.keys(parentEntityIds).forEach(blockId => {
  //   changedBlocksSet.add(blockId);
  // });
  // const changedBlocks: string[] = [...changedBlocksSet.values()];

  // // This might be a performance bottleneck for large sets of ops, so we'll need
  // // to monitor this over time.
  // const aggregatedChanges = changedEntities.map((entityId: string): EntityChange => {
  //   const tripleChanges: TripleChange[] = [];
  //   const relationChanges: RelationChange[] = [];

  //   const processedAttributes = new Set<string>();

  //   const afterTriplesForEntity = afterTriplesByEntityId[entityId] ?? {};
  //   const beforeTriplesForEntity = beforeTriplesByEntityId[entityId] ?? {};
  //   const afterRelationsForEntity = afterRelationsByEntityId[entityId] ?? {};
  //   const beforeRelationsForEntity = beforeRelationsByEntityId[entityId] ?? {};

  //   if (afterEntityIds.includes(entityId)) {
  //     for (const afterTriple of Object.values(afterTriplesForEntity)) {
  //       if (processedAttributes.has(afterTriple.property.id)) continue;

  //       const beforeTriple: Value | null = beforeTriplesForEntity[afterTriple.property.id] ?? null;
  //       const beforeValue = beforeTriple ? beforeTriple.value : null;
  //       const before = AfterTripleDiff.diffBefore(afterTriple.value, beforeValue);
  //       const after = AfterTripleDiff.diffAfter(afterTriple.value, beforeValue);

  //       tripleChanges.push({
  //         attribute: {
  //           id: afterTriple.property.id,
  //           name: afterTriple.attributeName,
  //         },
  //         type: afterTriple.value.type,
  //         before,
  //         after,
  //       });

  //       processedAttributes.add(afterTriple.property.id);
  //     }

  //     for (const beforeTriple of Object.values(beforeTriplesForEntity)) {
  //       if (processedAttributes.has(beforeTriple.property.id)) continue;

  //       const afterTriple: Value | null = afterTriplesForEntity[beforeTriple.property.id] ?? null;
  //       const afterValue = afterTriple ? afterTriple.value : null;
  //       const before = BeforeTripleDiff.diffBefore(beforeTriple.value, afterValue);
  //       const after = BeforeTripleDiff.diffAfter(beforeTriple.value, afterValue);

  //       tripleChanges.push({
  //         attribute: {
  //           id: beforeTriple.property.id,
  //           name: beforeTriple.property.name,
  //         },
  //         type: beforeTriple.property.dataType,
  //         before,
  //         after,
  //       });

  //       processedAttributes.add(beforeTriple.property.id);
  //     }

  //     for (const relations of Object.values(afterRelationsForEntity)) {
  //       const seenRelations: Set<string> = new Set();

  //       for (const relation of relations) {
  //         const beforeRelationsForAttributeId = beforeRelationsForEntity[relation.type.id] ?? null;
  //         const before = AfterRelationDiff.diffBefore(relation, beforeRelationsForAttributeId);
  //         const after = AfterRelationDiff.diffAfter(relation, beforeRelationsForAttributeId);

  //         if (!seenRelations.has(relation.id)) {
  //           relationChanges.push({
  //             attribute: {
  //               id: relation.type.id,
  //               name: relation.type.name,
  //             },
  //             // Filter out the block-related relation types until we render blocks in the diff editor
  //             type: relation.renderableType === 'IMAGE' ? 'IMAGE' : 'RELATION',
  //             before,
  //             after,
  //           });
  //         }

  //         seenRelations.add(relation.id);
  //       }
  //     }

  //     for (const relations of Object.values(beforeRelationsForEntity)) {
  //       for (const relation of relations) {
  //         const afterRelationsForPropertyId = afterRelationsForEntity[relation.type.id] ?? null;
  //         const before = BeforeRelationDiff.diffBefore(relation, afterRelationsForPropertyId);
  //         const after = BeforeRelationDiff.diffAfter(relation, afterRelationsForPropertyId);

  //         relationChanges.push({
  //           attribute: {
  //             id: relation.type.id,
  //             name: relation.type.name,
  //           },
  //           // Filter out the block-related relation types until we render blocks in the diff editor
  //           type: relation.renderableType === 'IMAGE' ? 'IMAGE' : 'RELATION',
  //           before: after,
  //           after: before,
  //         });
  //       }
  //     }
  //   }

  //   const nonBlockRelationChanges = relationChanges.filter(c => c.attribute.id !== SystemIds.BLOCKS);

  //   // Filter out any "dead" changes where the values are the exact same
  //   // in the before and after.
  //   const realChanges = [...tripleChanges, ...nonBlockRelationChanges].filter(c => isRealChange(c.before, c.after));

  //   const entity = (afterEntities.find(entity => entity.id === entityId) ??
  //     beforeEntities.find(entity => entity.id === entityId)) as Entity;

  //   const blockChanges: Array<BlockChange> = [];

  //   changedBlocks.forEach(blockId => {
  //     const isBlockForThisEntity = parentEntityIds?.[blockId] === entityId;

  //     if (isBlockForThisEntity) {
  //       const beforeBlock = beforeBlocks.find(beforeEntity => beforeEntity.id === blockId);
  //       const afterBlock = afterBlocks.find(afterEntity => afterEntity.id === blockId);

  //       const isTextBlock =
  //         (beforeBlock?.types.some(type => type.id === SystemIds.TEXT_BLOCK) ||
  //           afterBlock?.types.some(type => type.id === SystemIds.TEXT_BLOCK) ||
  //           afterBlock?.relations.some(relation => relation.type.id === SystemIds.TEXT_BLOCK)) ??
  //         false;

  //       const isImageBlock =
  //         (beforeBlock?.types?.some(type => type.id === SystemIds.IMAGE_TYPE) ||
  //           afterBlock?.types?.some(type => type.id === SystemIds.IMAGE_TYPE) ||
  //           afterBlock?.relations.some(relation => relation.type.id === SystemIds.IMAGE_TYPE)) ??
  //         false;

  //       const isDataBlock =
  //         (beforeBlock?.types?.some(type => type.id === SystemIds.DATA_BLOCK) ||
  //           afterBlock?.types?.some(type => type.id === SystemIds.DATA_BLOCK) ||
  //           afterBlock?.relations.some(relation => relation.type.id === SystemIds.DATA_BLOCK)) ??
  //         false;

  //       if (isTextBlock) {
  //         const beforeTriple = beforeBlock?.values.find(triple => triple.property.id === SystemIds.MARKDOWN_CONTENT);

  //         const afterTriple = afterBlock?.values.find(triple => triple.property.id === SystemIds.MARKDOWN_CONTENT);

  //         blockChanges.push({
  //           type: 'textBlock',
  //           before: `${beforeTriple?.value ?? ''}`,
  //           after: `${afterTriple?.value ?? ''}`,
  //         });
  //       } else if (isImageBlock) {
  //         const beforeTriple = beforeBlock?.values.find(triple => triple.property.id === SystemIds.IMAGE_URL_PROPERTY);

  //         const afterTriple = afterBlock?.values.find(triple => triple.property.id === SystemIds.IMAGE_URL_PROPERTY);

  //         blockChanges.push({
  //           type: 'imageBlock',
  //           before: `${beforeTriple?.value ?? ''}`,
  //           after: `${afterTriple?.value ?? ''}`,
  //         });
  //       } else if (isDataBlock) {
  //         const beforeName = beforeBlock?.name ?? '';
  //         const afterName = afterBlock?.name ?? '';

  //         blockChanges.push({
  //           type: 'dataBlock',
  //           before: beforeBlock ? beforeName : null,
  //           after: afterBlock ? afterName : null,
  //         });
  //       }
  //     }
  //   });

  //   return {
  //     id: entity.id,
  //     name: entity.name,
  //     avatar: Entities.avatar(entity.relations),
  //     blockChanges,
  //     changes: realChanges,
  //   };
  // });

  // return aggregatedChanges;
}

export function isRealChange(
  before: TripleChangeValue | RelationChangeValue | null,
  after: TripleChangeValue | RelationChangeValue | null
) {
  // The before and after values are the same
  if (before?.value === after?.value && before?.valueName === after?.valueName) {
    const beforeOptions = before && 'options' in before ? before.options : undefined;
    const afterOptions = after && 'options' in after ? after.options : undefined;

    // The options are different
    if (!equal(beforeOptions, afterOptions)) {
      return true;
    }

    return false;
  }

  // We add then remove a triple locally that doesn't exist remotely
  if (before === null && after?.type === 'REMOVE') {
    return false;
  }

  return true;
}

type TripleByAttributeMap = Record<string, Value>;
type EntityByAttributeMapMap = Record<string, TripleByAttributeMap>;

function shouldFilterTriple(value: Value) {
  if (
    value.property.id === SystemIds.TYPES_PROPERTY &&
    value.property.renderableType === SystemIds.URL &&
    value.value === GraphUrl.fromEntityId(SystemIds.RELATION_TYPE)
  ) {
    return true;
  }

  return false;
}

function groupTriplesByEntityIdAndAttributeId(values: Value[]) {
  return values.reduce<EntityByAttributeMapMap>((acc, triple) => {
    const entityId = triple.entity.id;
    const attributeId = triple.property.id;

    // Filter out any triples for relation entities. This is to prevent
    // the diffs from being noisy with metadata about the relation.
    if (shouldFilterTriple(triple)) {
      return acc;
    }

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
    const attributeId = relation.type.id;

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

const getIsRenderedAsEntity = (entity: Entity) => {
  if (entity.types.some(type => blockTypes.includes(Id(type.id)))) {
    return false;
  } else {
    return true;
  }
};

const blockTypes = [
  SystemIds.DATA_BLOCK,
  SystemIds.IMAGE_BLOCK,
  SystemIds.IMAGE_TYPE,
  SystemIds.RELATION_TYPE,
  SystemIds.TEXT_BLOCK,
];

// @TODO use attributes as a hint as well
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
const blockAttributes = [
  SystemIds.DATA_SOURCE_PROPERTY,
  SystemIds.ENTITY_FILTER,
  SystemIds.FILTER,
  SystemIds.SHOWN_COLUMNS,
  SystemIds.SPACE_FILTER,
  SystemIds.VIEW_TYPE,
];

const getBlockParentEntityIds = async (blockIds: string[], entities: Entity[]) => {
  const blockParentEntityIds: Record<string, string | null> = {};

  const parentEntityIds: Array<string | null> = await Promise.all(
    blockIds.map(async blockId => {
      const possibleParentEntityId = await fetchParentEntityId(blockId);

      return possibleParentEntityId;
    })
  );

  blockIds.forEach((blockId: string, index: number) => {
    blockParentEntityIds[blockId] = parentEntityIds[index];
  });

  entities.forEach(entity => {
    entity.relations.forEach(relation => {
      blockParentEntityIds[relation.toEntity.id] = entity.id;
    });
  });

  return blockParentEntityIds;
};

const getNewAndDeletedBlockParentEntityIds = (beforeEntities: Entity[], afterEntities: Entity[]) => {
  const createdBlockParentEntityIds: Record<string, string> = {};
  const deletedBlockParentEntityIds: Record<string, string> = {};

  afterEntities.forEach(afterEntity => {
    const beforeEntity = beforeEntities.find(entity => entity.id === afterEntity.id);

    const beforeBlockIds =
      beforeEntity?.relations
        .filter(relation => relation.type.id === SystemIds.BLOCKS)
        .map(relation => relation.toEntity.id) ?? [];

    const afterBlockIds = afterEntity.relations
      .filter(relation => relation.type.id === SystemIds.BLOCKS)
      .map(relation => relation.toEntity.id);

    const newlyCreatedBlockIds = afterBlockIds.filter(blockId => !beforeBlockIds.includes(blockId));

    newlyCreatedBlockIds.forEach(entityId => {
      createdBlockParentEntityIds[entityId] = afterEntity.id;
    });

    const newlyDeletedBlockIds = beforeBlockIds.filter(blockId => !afterBlockIds.includes(blockId));

    newlyDeletedBlockIds.forEach(entityId => {
      deletedBlockParentEntityIds[entityId] = afterEntity.id;
    });
  });

  return { createdBlockParentEntityIds, deletedBlockParentEntityIds };
};
