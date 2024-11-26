import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect, Record } from 'effect';

import { mergeEntityAsync } from '~/core/database/entities';
import { getRelations } from '~/core/database/relations';
import { getTriples } from '~/core/database/triples';
import { Entity } from '~/core/io/dto/entities';
import { Proposal } from '~/core/io/dto/proposals';
import { Version } from '~/core/io/dto/versions';
import { EntityId } from '~/core/io/schema';
import { fetchEntity } from '~/core/io/subgraph';
import { queryClient } from '~/core/query-client';
import type { Relation, Triple } from '~/core/types';

import { fetchPreviousVersionByCreatedAt } from './fetch-previous-version-by-created-at';
import { fetchVersionsByEditId } from './fetch-versions-by-edit-id';
import { getAfterTripleChange, getBeforeTripleChange } from './get-triple-change';
import { EntityChange, RelationChange, RelationChangeValue, TripleChange, TripleChangeValue } from './types';

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

  const collectEntities = Effect.gen(function* () {
    const maybeRemoteEntitiesEffect = Effect.all(
      entityIdsToFetch.map(id => Effect.promise(() => getEntityAsync(EntityId(id))))
    );

    const maybeLocalEntitiesEffect = Effect.all(
      entityIdsToFetch.map(id => Effect.promise(() => mergeEntityAsync(EntityId(id))))
    );

    const [maybeRemoteEntities, maybeLocalEntities] = yield* Effect.all([
      maybeRemoteEntitiesEffect,
      maybeLocalEntitiesEffect,
    ]);

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
  const currentVersionsForEntityIds = await Promise.all(versionsByEditId.map(v => fetchEntity({ id: v.id })));

  return aggregateChanges({
    spaceId: proposal.space.id,
    beforeEntities: currentVersionsForEntityIds.filter(v => v !== null),
    afterEntities: versionsByEditId,
  });
}

export async function fromEndedProposal(proposal: Proposal): Promise<EntityChange[]> {
  const versionsByEditId = await fetchVersionsByEditId({ editId: proposal.editId });

  const previousVersions = await Promise.all(
    versionsByEditId.map(v =>
      fetchPreviousVersionByCreatedAt({
        createdAt: proposal.createdAt,
        entityId: v.id,
        spaceId: proposal.space.id,
      })
    )
  );

  // 4. Aggregate changes between the two sets of versions
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
      const before = getBeforeTripleChange(afterTriple.value, beforeValue);
      const after = getAfterTripleChange(afterTriple.value, beforeValue);

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

    for (const relations of Object.values(afterRelationsForEntity)) {
      for (const relation of relations) {
        const beforeRelationsForAttributeId = beforeRelationsForEntity[relation.typeOf.id] ?? null;
        const before = getBeforeRelationChange(relation, beforeRelationsForAttributeId);
        const after = getAfterRelationChange(relation, beforeRelationsForAttributeId);

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

    // Filter out any "dead" changes where the values are the exact same
    // in the before and after.
    const realChanges = [...tripleChanges, ...relationChanges].filter(c => isRealChange(c.before, c.after));

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
  after: TripleChangeValue | RelationChangeValue
) {
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
