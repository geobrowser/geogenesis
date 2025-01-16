import { GraphUrl, SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect, Record } from 'effect';

import { mergeEntity } from '~/core/database/entities';
import { getRelations } from '~/core/database/relations';
import { getTriples } from '~/core/database/triples';
import { Entity } from '~/core/io/dto/entities';
import { Proposal } from '~/core/io/dto/proposals';
import { Version } from '~/core/io/dto/versions';
import { fetchEntitiesBatch, fetchEntitiesBatchCached } from '~/core/io/subgraph/fetch-entities-batch';
import type { Relation, Triple } from '~/core/types';

import { fetchPreviousVersionByCreatedAt } from './fetch-previous-version-by-created-at';
import { fetchVersionsByEditId } from './fetch-versions-by-edit-id';
import { AfterRelationDiff, BeforeRelationDiff } from './get-relation-change';
import { AfterTripleDiff, BeforeTripleDiff } from './get-triple-change';
import { EntityChange, RelationChange, RelationChangeValue, TripleChange, TripleChangeValue } from './types';

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
    const maybeRemoteEntitiesEffect = Effect.promise(() => fetchEntitiesBatchCached(entityIdsToFetch));

    const maybeLocalEntitiesEffect = Effect.promise(async () => {
      const entities = await fetchEntitiesBatchCached(entityIdsToFetch);
      return entities.map(e =>
        mergeEntity({
          id: e.id,
          mergeWith: e,
        })
      );
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

  return aggregateChanges({
    spaceId,
    beforeEntities: remoteEntities,
    afterEntities: localEntities,
  });
}

interface FromVersionsArgs {
  spaceId?: string;
  beforeVersion: Version | null;
  afterVersion: Version;
}

export function fromVersions({ beforeVersion, afterVersion }: FromVersionsArgs): EntityChange[] {
  return aggregateChanges({
    spaceId: undefined,
    afterEntities: [afterVersion],
    beforeEntities: beforeVersion ? [beforeVersion] : [],
  });
}

export async function fromActiveProposal(proposal: Proposal): Promise<EntityChange[]> {
  const versionsByEditId = await fetchVersionsByEditId({ editId: proposal.editId });

  // Version entity ids are mapped to the version.id
  const currentVersionsForEntityIds = await fetchEntitiesBatch(versionsByEditId.map(v => v.id));

  return aggregateChanges({
    spaceId: proposal.space.id,
    beforeEntities: currentVersionsForEntityIds.filter(v => v !== null),
    afterEntities: versionsByEditId,
  });
}

export async function fromEndedProposal(proposal: Proposal): Promise<EntityChange[]> {
  const versionsByEditId = await fetchVersionsByEditId({ editId: proposal.editId });

  // const previousVersions = await fetchVersionsBatch({
  //   versionIds: versionsByEditId.map(v => v.versionId),
  // });

  // We should batch this but not sure the easiest way to do it in a single query
  const previousVersions = await Promise.all(
    versionsByEditId.map(v =>
      fetchPreviousVersionByCreatedAt({
        createdAt: proposal.createdAt,
        entityId: v.id,
        spaceId: proposal.space.id,
      })
    )
  );

  return aggregateChanges({
    spaceId: proposal.space.id,
    beforeEntities: previousVersions.filter(e => e !== null),
    afterEntities: versionsByEditId,
  });
}

interface AggregateChangesArgs {
  spaceId?: string;
  afterEntities: Entity[];
  beforeEntities: Entity[];
}

export function aggregateChanges({ spaceId, afterEntities, beforeEntities }: AggregateChangesArgs): EntityChange[] {
  // Aggregate remote triples into a map of entities -> attributes and attributes -> triples
  // Each map is 1:1 with each entity only having one attribute per attribute id and one triple per attribute id
  //
  // Additionally, make sure that we're filtering out triples that don't match the current space id.
  const afterTriplesByEntityId = groupTriplesByEntityIdAndAttributeId(afterEntities.flatMap(e => e.triples));
  const beforeTriplesByEntityId = groupTriplesByEntityIdAndAttributeId(
    beforeEntities.flatMap(e => e.triples).filter(t => (spaceId ? t.space === spaceId : true))
  );

  const afterRelationsByEntityId = groupRelationsByEntityIdAndAttributeId(afterEntities.flatMap(e => e.relationsOut));
  const beforeRelationsByEntityId = groupRelationsByEntityIdAndAttributeId(beforeEntities.flatMap(e => e.relationsOut));

  // This might be a performance bottleneck for large sets of ops, so we'll need
  // to monitor this over time.
  return afterEntities.map((entity): EntityChange => {
    const tripleChanges: TripleChange[] = [];
    const relationChanges: RelationChange[] = [];

    const afterTriplesForEntity = afterTriplesByEntityId[entity.id] ?? {};
    const beforeTriplesForEntity = beforeTriplesByEntityId[entity.id] ?? {};
    const afterRelationsForEntity = afterRelationsByEntityId[entity.id] ?? {};
    const beforeRelationsForEntity = beforeRelationsByEntityId[entity.id] ?? {};

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
      for (const relation of relations) {
        const beforeRelationsForAttributeId = beforeRelationsForEntity[relation.typeOf.id] ?? null;
        const before = AfterRelationDiff.diffBefore(relation, beforeRelationsForAttributeId);
        const after = AfterRelationDiff.diffAfter(relation, beforeRelationsForAttributeId);

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

    const nonBlockRelationChanges = relationChanges.filter(c => c.attribute.id !== SYSTEM_IDS.BLOCKS);

    // Filter out any "dead" changes where the values are the exact same
    // in the before and after.
    const realChanges = [...tripleChanges, ...nonBlockRelationChanges].filter(c => isRealChange(c.before, c.after));

    // @TODO: map block diffs into a renderable format
    const blockChanges = relationChanges.filter(c => c.attribute.id === SYSTEM_IDS.BLOCKS);

    return {
      id: entity.id,
      name: entity.name,
      blockChanges,
      changes: realChanges,
    };
  });
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
  SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
  SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
  SYSTEM_IDS.RELATION_INDEX,
  SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
];

function shouldFilterTriple(triple: Triple) {
  // Filter out any triples for relation entities. This is to prevent
  // the diffs from being noisy with metadata about the relation.
  if (RELATION_TRIPLES.includes(triple.attributeId)) {
    return true;
  }

  if (
    triple.attributeId === SYSTEM_IDS.TYPES_ATTRIBUTE &&
    triple.value.type === 'URL' &&
    triple.value.value === GraphUrl.fromEntityId(SYSTEM_IDS.RELATION_TYPE)
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
