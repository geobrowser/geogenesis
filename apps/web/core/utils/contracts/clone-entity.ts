import { ContentIds, Graph, Id, Op, SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';

import { ROOT_SPACE } from '~/core/constants';
import { ID } from '~/core/id';
import { getEntity } from '~/core/io/queries';
import { Relation } from '~/core/types';
import { Ops } from '~/core/utils/ops';

type Options = {
  oldEntityId: string;
  entityId?: string;
  entityName?: string | null;
  parentEntityId?: string | null;
  parentEntityName?: string | null;
  spaceId?: string;
};

export const cloneEntity = async (
  options: Options,
  previouslySeenEntityIds?: Set<string>
): Promise<[Array<Op>, Set<string>]> => {
  if (!options.oldEntityId) {
    throw new Error(`Must specify entity to clone.`);
  }

  const {
    oldEntityId,
    entityId = null,
    entityName,
    parentEntityId = null,
    parentEntityName = null,
    spaceId = ROOT_SPACE,
  } = options;

  const oldEntity = await Effect.runPromise(getEntity(oldEntityId, spaceId));

  if (!oldEntity) return [[], previouslySeenEntityIds ?? new Set()];

  const allSeenEntityIds: Set<string> = new Set();

  if (previouslySeenEntityIds) {
    previouslySeenEntityIds.forEach(entityId => allSeenEntityIds.add(entityId));
  }

  const newEntityId = entityId ?? ID.createEntityId();
  const newEntityName = entityName;
  const newOps: Array<Op> = [];

  const triplesToClone = oldEntity.values.filter(triple => !SKIPPED_PROPERTYS.includes(Id(triple.property.id)));
  const relationsToClone = oldEntity.relations.filter(relation => !SKIPPED_PROPERTYS.includes(Id(relation.type.id)));
  const tabsToClone = oldEntity.relations.filter(relation => relation.type.id === SystemIds.TABS_PROPERTY);
  const blocksToClone = oldEntity.relations.filter(relation => relation.type.id === SystemIds.BLOCKS);

  if (newEntityName) {
    newOps.push(
      Ops.create({
        entity: newEntityId,
        value: {
          property: SystemIds.NAME_PROPERTY,
          value: { type: 'text', value: newEntityName },
        },
      })
    );
  }

  triplesToClone.forEach(triple => {
    let tripleValue = triple.value;

    if (triple.property.dataType === 'TEXT') {
      if (hasVariable(tripleValue)) {
        tripleValue = replaceVariables(tripleValue, {
          entityId: parentEntityId ?? newEntityId,
          entityName: parentEntityName ?? newEntityName ?? '${entityName}',
        });
      }

      if (triple.property.id === SystemIds.FILTER) {
        tripleValue = replaceAuthorsFilter(tripleValue, parentEntityId ?? newEntityId);
      }
    }

    newOps.push(
      Ops.create({
        entity: newEntityId,
        value: {
          property: Id(triple.property.id),
          value: { type: 'text', value: tripleValue },
        },
      })
    );
  });

  relationsToClone.forEach(relation => {
    const { ops } = Graph.createRelation({
      type: Id(relation.type.id),
      fromEntity: newEntityId,
      toEntity: relation.toEntity.id,
      position: relation.position,
    });

    newOps.push(...ops);
  });

  const [tabOps, newlySeenTabEntityIds] = await cloneRelatedEntities(
    tabsToClone,
    newEntityId,
    allSeenEntityIds,
    parentEntityId ?? newEntityId,
    parentEntityName ?? newEntityName,
    spaceId
  );
  newOps.push(...tabOps);
  newlySeenTabEntityIds.forEach(entityId => allSeenEntityIds.add(entityId));

  const [blockOps, newlySeenBlockEntityIds] = await cloneRelatedEntities(
    blocksToClone,
    newEntityId,
    allSeenEntityIds,
    parentEntityId ?? newEntityId,
    parentEntityName ?? newEntityName,
    spaceId
  );
  newOps.push(...blockOps);
  newlySeenBlockEntityIds.forEach(entityId => allSeenEntityIds.add(entityId));

  return [newOps, allSeenEntityIds] as const;
};

const cloneRelatedEntities = async (
  relatedEntitiesToClone: Array<Relation>,
  newEntityId: string,
  previouslySeenEntityIds: Set<string>,
  parentEntityId: string | null,
  parentEntityName: string | null | undefined,
  spaceId: string
) => {
  const allSeenEntityIds: Set<string> = new Set();

  if (previouslySeenEntityIds) {
    previouslySeenEntityIds.forEach(entityId => allSeenEntityIds.add(entityId));
  }

  const allOps = await Promise.all(
    relatedEntitiesToClone.map(async relation => {
      if (allSeenEntityIds.has(relation.id)) return [];

      allSeenEntityIds.add(relation.id);

      const newRelatedEntityId = ID.createEntityId();

      const { ops: relationshipOps } = Graph.createRelation({
        type: Id(relation.type.id),
        fromEntity: newEntityId,
        toEntity: newRelatedEntityId,
        position: relation.position,
      });

      const [newRelatedEntityOps, newlySeenEntityIds] = await cloneEntity(
        {
          oldEntityId: relation.toEntity.id,
          entityId: newRelatedEntityId,
          entityName: relation.toEntity.name ?? '',
          parentEntityId,
          parentEntityName,
          spaceId,
        },
        allSeenEntityIds
      );
      newlySeenEntityIds.forEach(entityId => allSeenEntityIds.add(entityId));

      return [...relationshipOps, ...newRelatedEntityOps];
    })
  );

  return [allOps.flat(), allSeenEntityIds] as const;
};

const SKIPPED_PROPERTYS = [
  SystemIds.NAME_PROPERTY,
  SystemIds.DESCRIPTION_PROPERTY,
  ContentIds.AVATAR_PROPERTY,
  SystemIds.TABS_PROPERTY,
  SystemIds.BLOCKS,
];

const AUTHORS_PROPERTY = '91a9e2f6-e51a-48f7-9976-61de8561b690';

const hasVariable = (value: string) => {
  const entityIdPattern = /\$\{entityId\}/;
  const entityNamePattern = /\$\{entityName\}/;

  return entityIdPattern.test(value) || entityNamePattern.test(value);
};

const replaceVariables = (value: string, variables: { entityId: string; entityName: string }) => {
  let result = value;

  if (variables.entityId) {
    result = result.replace(/\$\{entityId\}/g, variables.entityId);
  }

  if (variables.entityName) {
    result = result.replace(/\$\{entityName\}/g, variables.entityName);
  }

  return result;
};

const replaceAuthorsFilter = (filterString: string, newEntityId: string): string => {
  try {
    const filterObj = JSON.parse(filterString);

    if (filterObj.filter && filterObj.filter[AUTHORS_PROPERTY]) {
      filterObj.filter[AUTHORS_PROPERTY].is = newEntityId;
      return JSON.stringify(filterObj);
    }

    return filterString;
  } catch (error) {
    console.warn('Failed to parse filter string:', error);
    return filterString;
  }
};
