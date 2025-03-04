import { GraphUrl, SystemIds } from '@graphprotocol/grc-20';
import { Effect, Record } from 'effect';

import { EntityWithSchema, mergeEntity } from '~/core/database/entities';
import { getRelations } from '~/core/database/relations';
import { getTriples } from '~/core/database/triples';
import type { Entity } from '~/core/io/dto/entities';
import { Proposal } from '~/core/io/dto/proposals';
import { fetchParentEntityId } from '~/core/io/fetch-parent-entity-id';
import { EntityId } from '~/core/io/schema';
import { fetchEntitiesBatch, fetchEntitiesBatchCached } from '~/core/io/subgraph/fetch-entities-batch';
import type { Relation, Triple } from '~/core/types';
import { Entities } from '~/core/utils/entity';

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

export async function fromLocal(spaceId?: string) {
  const triples = getTriples({
    selector: t => (t.hasBeenPublished === false && spaceId ? t.space === spaceId : true),
    includeDeleted: true,
  });

  const localRelations = getRelations({
    selector: r => (r.hasBeenPublished === false && spaceId ? r.space === spaceId : true),
    includeDeleted: true,
  });

  // @TODO Space id filtering isn't working  for local relations for some reason
  const actualLocal = localRelations.filter(r => (spaceId ? r.space === spaceId : true));

  const entityIds = new Set([
    ...triples.map(t => t.entityId),
    // Relations don't alter the `from` entity directly, so in cases where a relation
    // is modified we also need to query the `from` entity so we can render diffs
    // from the perspective of the `from` entity.
    ...actualLocal.map(r => r.fromEntity.id),
  ]);

  const entityIdsToFetch = [...entityIds.values()];

  const collectEntities = Effect.gen(function* () {
    const maybeRemoteEntitiesEffect = Effect.promise(() =>
      fetchEntitiesBatchCached({ spaceId, entityIds: entityIdsToFetch })
    );

    const maybeLocalEntitiesEffect = Effect.promise(async () => {
      const localEntitiesWithRemoteData = await fetchEntitiesBatchCached({ spaceId, entityIds: entityIdsToFetch });

      const allEntities: Entity[] = [];

      entityIdsToFetch.forEach(entityId => {
        const localEntityWithRemoteData = localEntitiesWithRemoteData.find(entity => entity.id === entityId);

        if (localEntityWithRemoteData) {
          allEntities.push(localEntityWithRemoteData);
        } else {
          allEntities.push({
            id: EntityId(entityId),
            name: null,
            description: null,
            nameTripleSpaces: [],
            spaces: [],
            types: [],
            relationsOut: [],
            triples: [],
          });
        }
      });

      const mergedEntities = allEntities.map(e =>
        mergeEntity({
          id: e.id,
          mergeWith: e,
        })
      );

      return mergedEntities;
    });

    const [maybeRemoteEntities, maybeLocalEntities] = yield* Effect.all(
      [maybeRemoteEntitiesEffect, maybeLocalEntitiesEffect],
      { concurrency: 2 }
    );

    const remoteEntities = maybeRemoteEntities.filter(e => e !== null);
    const localEntities = maybeLocalEntities.filter(e => e !== null);

    return {
      remoteEntities,
      localEntities,
    };
  });

  const { remoteEntities, localEntities } = await Effect.runPromise(collectEntities);

  const beforeEntities = remoteEntities.filter(entity => getIsRenderedAsEntity(entity));
  const beforeEntityIdsSet = new Set(beforeEntities.map(entity => entity.id));

  const afterEntities = localEntities.filter(entity => getIsRenderedAsEntity(entity));

  const possibleBeforeBlocks = remoteEntities.filter(entity => !getIsRenderedAsEntity(entity));
  const possibleAfterBlocks = localEntities.filter(entity => !getIsRenderedAsEntity(entity));
  const possibleBlockIds = possibleAfterBlocks.map(entity => entity.id);

  const possibleBlockParentEntityIds = await getBlockParentEntityIds(possibleBlockIds, afterEntities);

  const parentEntityIdsSet: Set<EntityId> = new Set();
  [...Object.values(possibleBlockParentEntityIds).filter(Boolean)].forEach(entityId => {
    if (entityId && !entityIds.has(entityId)) {
      parentEntityIdsSet.add(entityId);
    }
  });

  const { createdBlockParentEntityIds, deletedBlockParentEntityIds } = getNewAndDeletedBlockParentEntityIds(
    beforeEntities,
    afterEntities
  );

  const parentEntityIdsToFetch = [...parentEntityIdsSet.values()].filter(entityId => !beforeEntityIdsSet.has(entityId));

  const collectParentEntities = Effect.gen(function* () {
    const maybeRemoteParentEntitiesEffect = Effect.promise(() =>
      fetchEntitiesBatchCached({ spaceId, entityIds: parentEntityIdsToFetch })
    );

    const maybeLocalParentEntitiesEffect = Effect.promise(async () => {
      const localParentEntitiesWithRemoteData = await fetchEntitiesBatchCached({
        spaceId,
        entityIds: entityIdsToFetch,
      });

      const allParentEntities: Entity[] = [];

      entityIdsToFetch.forEach(entityId => {
        const localParentEntityWithRemoteData = localParentEntitiesWithRemoteData.find(
          entity => entity.id === entityId
        );

        if (localParentEntityWithRemoteData) {
          allParentEntities.push(localParentEntityWithRemoteData);
        } else {
          allParentEntities.push({
            id: EntityId(entityId),
            name: null,
            description: null,
            nameTripleSpaces: [],
            spaces: [],
            types: [],
            relationsOut: [],
            triples: [],
          });
        }
      });

      const mergedParentEntities = allParentEntities.map(e =>
        mergeEntity({
          id: e.id,
          mergeWith: e,
        })
      );

      return mergedParentEntities;
    });

    const [maybeRemoteParentEntities, maybeLocalParentEntities] = yield* Effect.all(
      [maybeRemoteParentEntitiesEffect, maybeLocalParentEntitiesEffect],
      { concurrency: 2 }
    );

    const remoteParentEntities = maybeRemoteParentEntities.filter(e => e !== null);
    const localParentEntities = maybeLocalParentEntities.filter(e => e !== null);

    return {
      remoteParentEntities,
      localParentEntities,
    };
  });

  const { remoteParentEntities, localParentEntities } = await Effect.runPromise(collectParentEntities);

  const beforeParentEntities = remoteParentEntities.filter(entity => getIsRenderedAsEntity(entity));
  const afterParentEntities = localParentEntities.filter(entity => getIsRenderedAsEntity(entity));

  const parentEntityIds: Record<EntityId, EntityId | null> = {
    ...possibleBlockParentEntityIds,
    ...createdBlockParentEntityIds,
    ...deletedBlockParentEntityIds,
  };

  const aggregateChangesArgs = {
    spaceId,
    beforeEntities: [...beforeEntities, ...beforeParentEntities],
    afterEntities: [...afterEntities, ...afterParentEntities],
    beforeBlocks: possibleBeforeBlocks,
    afterBlocks: possibleAfterBlocks,
    parentEntityIds,
  };

  const changes = aggregateChanges(aggregateChangesArgs);

  return changes;
}

export async function fromActiveProposal(proposal: Proposal, spaceId: string): Promise<EntityChange[]> {
  const versionsByEditId = await fetchVersionsByEditId({ editId: proposal.editId, spaceId });

  // Version entity ids are mapped to the version.id
  const currentVersionsForEntityIds = await fetchEntitiesBatch({ spaceId, entityIds: versionsByEditId.map(v => v.id) });

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

  const parentEntityIdsSet: Set<EntityId> = new Set();
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

  const beforeParentEntities = await fetchEntitiesBatch({ spaceId, entityIds: parentEntityIdsToFetch });

  const parentEntityIds: Record<EntityId, EntityId | null> = {
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
  const versionsByEditId = await fetchVersionsByEditId({ editId: proposal.editId, spaceId });

  // const previousVersions = await fetchVersionsBatch({
  //   versionIds: versionsByEditId.map(v => v.versionId),
  // });

  // We should batch this but not sure the easiest way to do it in a single query
  const previousVersions = await Promise.all(
    versionsByEditId.map(v => {
      return fetchPreviousVersionByCreatedAt({
        createdAt: proposal.createdAt,
        entityId: v.id,
        spaceId: proposal.space.id,
      });
    })
  );

  const beforeEntities = previousVersions.filter(e => e !== null).filter(entity => getIsRenderedAsEntity(entity));
  const beforeEntityIdsSet = new Set(beforeEntities.map(entity => entity.id));
  const afterEntities = versionsByEditId.filter(entity => getIsRenderedAsEntity(entity));

  const possibleBeforeBlocks = previousVersions
    .filter(e => e !== null)
    .filter(entity => !getIsRenderedAsEntity(entity));
  const possibleAfterBlocks = versionsByEditId.filter(entity => !getIsRenderedAsEntity(entity));
  const possibleBlockIds = possibleBeforeBlocks.map(entity => entity.id);

  const possibleBlockParentEntityIds = await getBlockParentEntityIds(possibleBlockIds, beforeEntities);

  const parentEntityIdsSet: Set<EntityId> = new Set();
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

  const beforeParentEntities = await fetchEntitiesBatch({ spaceId, entityIds: parentEntityIdsToFetch });

  const parentEntityIds: Record<EntityId, EntityId | null> = {
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

interface AggregateChangesArgs {
  spaceId?: string;
  afterEntities: Entity[];
  beforeEntities: Entity[];
  afterBlocks: Entity[];
  beforeBlocks: Entity[];
  parentEntityIds: Record<EntityId, EntityId | null>;
}

export function aggregateChanges({
  spaceId,
  afterEntities,
  beforeEntities,
  afterBlocks,
  beforeBlocks,
  parentEntityIds,
}: AggregateChangesArgs): EntityChange[] {
  // Aggregate remote data into a map of entities -> attributes and attributes -> triples
  // Each map is 1:1 with each entity only having one attribute per attribute id and one triple per attribute id
  //
  // Additionally, make sure that we're filtering out triples that don't match the current space id.
  const afterTriplesByEntityId = groupTriplesByEntityIdAndAttributeId(
    afterEntities.flatMap(e => e.triples).filter(t => (spaceId ? t.space === spaceId : true))
  );
  const beforeTriplesByEntityId = groupTriplesByEntityIdAndAttributeId(
    beforeEntities.flatMap(e => e.triples).filter(t => (spaceId ? t.space === spaceId : true))
  );

  const afterRelationsByEntityId = groupRelationsByEntityIdAndAttributeId(
    afterEntities.flatMap(e => e.relationsOut.filter(r => (spaceId ? r.space === spaceId : true)))
  );
  const beforeRelationsByEntityId = groupRelationsByEntityIdAndAttributeId(
    beforeEntities.flatMap(e => e.relationsOut.filter(r => (spaceId ? r.space === spaceId : true)))
  );

  const afterEntityIds = afterEntities.map(entity => entity.id);
  const changedEntitiesSet: Set<EntityId> = new Set();
  afterEntityIds.forEach(entityId => {
    changedEntitiesSet.add(entityId);
  });
  Object.values(parentEntityIds).forEach(entityId => {
    if (entityId) {
      changedEntitiesSet.add(entityId);
    }
  });
  const changedEntities: EntityId[] = [...changedEntitiesSet.values()];

  const afterBlockIds = afterBlocks.map(block => block.id);
  const changedBlocksSet: Set<EntityId> = new Set();
  afterBlockIds.forEach(blockId => {
    changedBlocksSet.add(blockId);
  });
  Object.keys(parentEntityIds).forEach(blockId => {
    changedBlocksSet.add(EntityId(blockId));
  });
  const changedBlocks: EntityId[] = [...changedBlocksSet.values()];

  // This might be a performance bottleneck for large sets of ops, so we'll need
  // to monitor this over time.
  const aggregatedChanges = changedEntities.map((entityId: EntityId): EntityChange => {
    const tripleChanges: TripleChange[] = [];
    const relationChanges: RelationChange[] = [];

    const afterTriplesForEntity = afterTriplesByEntityId[entityId] ?? {};
    const beforeTriplesForEntity = beforeTriplesByEntityId[entityId] ?? {};
    const afterRelationsForEntity = afterRelationsByEntityId[entityId] ?? {};
    const beforeRelationsForEntity = beforeRelationsByEntityId[entityId] ?? {};

    if (afterEntityIds.includes(entityId)) {
      for (const afterTriple of Object.values(afterTriplesForEntity)) {
        const beforeTriple: Triple | null = beforeTriplesForEntity[afterTriple.attributeId] ?? null;
        const beforeValue = beforeTriple ? beforeTriple.value : null;
        const before = AfterTripleDiff.diffBefore(afterTriple.value, beforeValue);
        const after = AfterTripleDiff.diffAfter(afterTriple.value, beforeValue);

        tripleChanges.push({
          attribute: {
            id: afterTriple.attributeId,
            name: afterTriple.attributeName,
          },
          type: afterTriple.value.type,
          before,
          after,
        });
      }

      for (const beforeTriple of Object.values(beforeTriplesForEntity)) {
        const afterTriple: Triple | null = afterTriplesForEntity[beforeTriple.attributeId] ?? null;
        const afterValue = afterTriple ? afterTriple.value : null;
        const before = BeforeTripleDiff.diffBefore(beforeTriple.value, afterValue);
        const after = BeforeTripleDiff.diffAfter(beforeTriple.value, afterValue);

        tripleChanges.push({
          attribute: {
            id: beforeTriple.attributeId,
            name: beforeTriple.attributeName,
          },
          type: beforeTriple.value.type,
          before,
          after,
        });
      }

      for (const relations of Object.values(afterRelationsForEntity)) {
        const seenRelations: Set<EntityId> = new Set();

        for (const relation of relations) {
          const beforeRelationsForAttributeId = beforeRelationsForEntity[relation.typeOf.id] ?? null;
          const before = AfterRelationDiff.diffBefore(relation, beforeRelationsForAttributeId);
          const after = AfterRelationDiff.diffAfter(relation, beforeRelationsForAttributeId);

          if (!seenRelations.has(relation.id)) {
            relationChanges.push({
              attribute: {
                id: relation.typeOf.id,
                name: relation.typeOf.name,
              },
              // Filter out the block-related relation types until we render blocks in the diff editor
              type: relation.toEntity.renderableType === 'IMAGE' ? 'IMAGE' : 'RELATION',
              before,
              after,
            });
          }

          seenRelations.add(relation.id);
        }
      }

      for (const relations of Object.values(beforeRelationsForEntity)) {
        for (const relation of relations) {
          const afterRelationsForPropertyId = afterRelationsForEntity[relation.typeOf.id] ?? null;
          const before = BeforeRelationDiff.diffBefore(relation, afterRelationsForPropertyId);
          const after = BeforeRelationDiff.diffAfter(relation, afterRelationsForPropertyId);

          relationChanges.push({
            attribute: {
              id: relation.typeOf.id,
              name: relation.typeOf.name,
            },
            // Filter out the block-related relation types until we render blocks in the diff editor
            type: relation.toEntity.renderableType === 'IMAGE' ? 'IMAGE' : 'RELATION',
            before: after,
            after: before,
          });
        }
      }
    }

    const nonBlockRelationChanges = relationChanges.filter(c => c.attribute.id !== SystemIds.BLOCKS);

    // Filter out any "dead" changes where the values are the exact same
    // in the before and after.
    const realChanges = [...tripleChanges, ...nonBlockRelationChanges].filter(c => isRealChange(c.before, c.after));

    const entity = (afterEntities.find(entity => entity.id === entityId) ??
      beforeEntities.find(entity => entity.id === entityId)) as Entity;

    const blockChanges: Array<BlockChange> = [];

    changedBlocks.forEach(blockId => {
      const isBlockForThisEntity = parentEntityIds?.[blockId] === entityId;

      if (isBlockForThisEntity) {
        const beforeBlock = beforeBlocks.find(beforeEntity => beforeEntity.id === blockId);
        const afterBlock = afterBlocks.find(afterEntity => afterEntity.id === blockId);

        const isTextBlock =
          (beforeBlock?.types.some(type => type.id === EntityId(SystemIds.TEXT_BLOCK)) ||
            afterBlock?.types.some(type => type.id === EntityId(SystemIds.TEXT_BLOCK)) ||
            afterBlock?.relationsOut.some(relation => relation.typeOf.id === EntityId(SystemIds.TEXT_BLOCK))) ??
          false;

        const isImageBlock =
          (beforeBlock?.types?.some(type => type.id === EntityId(SystemIds.IMAGE_TYPE)) ||
            afterBlock?.types?.some(type => type.id === EntityId(SystemIds.IMAGE_TYPE)) ||
            afterBlock?.relationsOut.some(relation => relation.typeOf.id === EntityId(SystemIds.IMAGE_TYPE))) ??
          false;

        const isDataBlock =
          (beforeBlock?.types?.some(type => type.id === EntityId(SystemIds.DATA_BLOCK)) ||
            afterBlock?.types?.some(type => type.id === EntityId(SystemIds.DATA_BLOCK)) ||
            afterBlock?.relationsOut.some(relation => relation.typeOf.id === EntityId(SystemIds.DATA_BLOCK))) ??
          false;

        if (isTextBlock) {
          const beforeTriple = beforeBlock?.triples.find(triple => triple.attributeId === SystemIds.MARKDOWN_CONTENT);

          const afterTriple = afterBlock?.triples.find(triple => triple.attributeId === SystemIds.MARKDOWN_CONTENT);

          blockChanges.push({
            type: 'textBlock',
            before: `${beforeTriple?.value?.value ?? ''}`,
            after: `${afterTriple?.value?.value ?? ''}`,
          });
        } else if (isImageBlock) {
          const beforeTriple = beforeBlock?.triples.find(
            triple => triple.attributeId === SystemIds.IMAGE_URL_ATTRIBUTE
          );

          const afterTriple = afterBlock?.triples.find(triple => triple.attributeId === SystemIds.IMAGE_URL_ATTRIBUTE);

          blockChanges.push({
            type: 'imageBlock',
            before: `${beforeTriple?.value?.value ?? ''}`,
            after: `${afterTriple?.value?.value ?? ''}`,
          });
        } else if (isDataBlock) {
          const beforeName = beforeBlock?.name ?? '';
          const afterName = afterBlock?.name ?? '';

          blockChanges.push({
            type: 'dataBlock',
            before: beforeBlock ? beforeName : null,
            after: afterBlock ? afterName : null,
          });
        }
      }
    });

    return {
      id: entity.id,
      name: entity.name,
      avatar: Entities.avatar(entity.relationsOut),
      blockChanges,
      changes: realChanges,
    };
  });

  return aggregatedChanges;
}

function isRealChange(
  before: TripleChangeValue | RelationChangeValue | null,
  after: TripleChangeValue | RelationChangeValue | null
) {
  // The before and after values are the same
  if (before?.value === after?.value && before?.valueName === after?.valueName) {
    return false;
  }

  // We add then remove a triple locally that doesn't exist remotely
  if (before === null && after?.type === 'REMOVE') {
    return false;
  }

  return true;
}

type TripleByAttributeMap = Record<string, Triple>;
type EntityByAttributeMapMap = Record<string, TripleByAttributeMap>;

const RELATION_TRIPLES = [
  EntityId(SystemIds.RELATION_FROM_ATTRIBUTE),
  EntityId(SystemIds.RELATION_TO_ATTRIBUTE),
  EntityId(SystemIds.RELATION_INDEX),
  EntityId(SystemIds.RELATION_TYPE_ATTRIBUTE),
];

function shouldFilterTriple(triple: Triple) {
  // Filter out any triples for relation entities. This is to prevent
  // the diffs from being noisy with metadata about the relation.
  if (RELATION_TRIPLES.includes(EntityId(triple.attributeId))) {
    return true;
  }

  if (
    triple.attributeId === SystemIds.TYPES_ATTRIBUTE &&
    triple.value.type === 'URL' &&
    triple.value.value === GraphUrl.fromEntityId(SystemIds.RELATION_TYPE)
  ) {
    return true;
  }

  return false;
}

function groupTriplesByEntityIdAndAttributeId(triples: Triple[]) {
  return triples.reduce<EntityByAttributeMapMap>((acc, triple) => {
    const entityId = triple.entityId;
    const attributeId = triple.attributeId;

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

const getIsRenderedAsEntity = (entity: Entity | EntityWithSchema) => {
  if (entity.types.some(type => blockTypes.includes(type.id))) {
    return false;
  } else {
    return true;
  }
};

const blockTypes = [
  EntityId(SystemIds.DATA_BLOCK),
  EntityId(SystemIds.IMAGE_BLOCK),
  EntityId(SystemIds.IMAGE_TYPE),
  EntityId(SystemIds.RELATION_TYPE),
  EntityId(SystemIds.TEXT_BLOCK),
];

// @TODO use attributes as a hint as well
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
const blockAttributes = [
  SystemIds.DATA_SOURCE_ATTRIBUTE,
  SystemIds.ENTITY_FILTER,
  SystemIds.FILTER,
  SystemIds.SHOWN_COLUMNS,
  SystemIds.SPACE_FILTER,
  SystemIds.VIEW_TYPE,
];

const getBlockParentEntityIds = async (blockIds: EntityId[], entities: Entity[]) => {
  const blockParentEntityIds: Record<EntityId, EntityId | null> = {};

  const parentEntityIds: Array<EntityId | null> = await Promise.all(
    blockIds.map(async blockId => {
      const possibleParentEntityId = await fetchParentEntityId(blockId);

      return possibleParentEntityId;
    })
  );

  blockIds.forEach((blockId: EntityId, index: number) => {
    blockParentEntityIds[blockId] = parentEntityIds[index];
  });

  entities.forEach(entity => {
    entity.relationsOut
      .filter(relation => relation.typeOf.id === EntityId(SystemIds.BLOCKS))
      .forEach(relation => {
        blockParentEntityIds[relation.toEntity.id] = entity.id;
      });
  });

  return blockParentEntityIds;
};

const getNewAndDeletedBlockParentEntityIds = (beforeEntities: Entity[], afterEntities: Entity[]) => {
  const createdBlockParentEntityIds: Record<EntityId, EntityId> = {};
  const deletedBlockParentEntityIds: Record<EntityId, EntityId> = {};

  afterEntities.forEach(afterEntity => {
    const beforeEntity = beforeEntities.find(entity => entity.id === afterEntity.id);

    const beforeBlockIds =
      beforeEntity?.relationsOut
        .filter(relation => relation.typeOf.id === EntityId(SystemIds.BLOCKS))
        .map(relation => relation.toEntity.id) ?? [];

    const afterBlockIds = afterEntity.relationsOut
      .filter(relation => relation.typeOf.id === EntityId(SystemIds.BLOCKS))
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
