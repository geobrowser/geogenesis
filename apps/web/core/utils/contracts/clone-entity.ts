import { ContentIds, Op, Relation, SystemIds } from '@graphprotocol/grc-20';

import { ROOT_SPACE_ID } from '~/core/constants';
import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { EntityId } from '~/core/io/schema';
import { Relation as RelationType } from '~/core/types';
import { Ops } from '~/core/utils/ops';

type Options = {
  oldEntityId: string;
  entityId?: string;
  entityName?: string | null;
  parentEntityId?: string | null;
  parentEntityName?: string | null;
};

export const cloneEntity = async (
  options: Options,
  previouslySeenEntityIds?: Set<string>
): Promise<[Array<Op>, Set<string>]> => {
  if (!options.oldEntityId) {
    throw new Error(`Must specify entity to clone.`);
  }

  const { oldEntityId, entityId = null, entityName, parentEntityId = null, parentEntityName = null } = options;

  const oldEntity = await Subgraph.fetchEntity({ id: oldEntityId, spaceId: ROOT_SPACE_ID });

  if (!oldEntity) return [[], previouslySeenEntityIds ?? new Set()];

  const allSeenEntityIds: Set<string> = new Set();

  if (previouslySeenEntityIds) {
    previouslySeenEntityIds.forEach(entityId => allSeenEntityIds.add(entityId));
  }

  const newEntityId = entityId ?? ID.createEntityId();
  const newEntityName = entityName;
  const newOps: Array<Op> = [];

  const triplesToClone = oldEntity.triples.filter(triple => !SKIPPED_ATTRIBUTES.includes(EntityId(triple.attributeId)));
  const relationsToClone = oldEntity.relationsOut.filter(relation => !SKIPPED_ATTRIBUTES.includes(relation.typeOf.id));
  const tabsToClone = oldEntity.relationsOut.filter(
    relation => relation.typeOf.id === EntityId(SystemIds.TABS_ATTRIBUTE)
  );
  const blocksToClone = oldEntity.relationsOut.filter(relation => relation.typeOf.id === EntityId(SystemIds.BLOCKS));

  if (newEntityName) {
    newOps.push(
      Ops.create({
        entity: newEntityId,
        attribute: SystemIds.NAME_ATTRIBUTE,
        value: {
          type: 'TEXT',
          value: newEntityName,
        },
      })
    );
  }

  triplesToClone.forEach(triple => {
    if (triple.value.type === 'TEXT' && hasVariable(triple.value.value)) {
      const replacedValue = replaceVariables(triple.value.value, {
        entityId: parentEntityId ?? newEntityId,
        entityName: parentEntityName ?? newEntityName ?? '${entityName}',
      });

      newOps.push(
        Ops.create({
          entity: newEntityId,
          attribute: triple.attributeId,
          value: {
            type: triple.value.type,
            value: replacedValue,
          },
        })
      );
    } else {
      newOps.push(
        Ops.create({
          entity: newEntityId,
          attribute: triple.attributeId,
          value: {
            type: triple.value.type,
            value: triple.value.value,
          },
        })
      );
    }
  });

  relationsToClone.forEach(relation => {
    newOps.push(
      Relation.make({
        fromId: newEntityId,
        toId: relation.toEntity.id,
        relationTypeId: relation.typeOf.id,
        position: relation.index,
      })
    );
  });

  const [tabOps, newlySeenTabEntityIds] = await cloneRelatedEntities(
    tabsToClone,
    newEntityId,
    allSeenEntityIds,
    parentEntityId ?? newEntityId,
    parentEntityName ?? newEntityName
  );
  newOps.push(...tabOps);
  newlySeenTabEntityIds.forEach(entityId => allSeenEntityIds.add(entityId));

  const [blockOps, newlySeenBlockEntityIds] = await cloneRelatedEntities(
    blocksToClone,
    newEntityId,
    allSeenEntityIds,
    parentEntityId ?? newEntityId,
    parentEntityName ?? newEntityName
  );
  newOps.push(...blockOps);
  newlySeenBlockEntityIds.forEach(entityId => allSeenEntityIds.add(entityId));

  return [newOps, allSeenEntityIds] as const;
};

const cloneRelatedEntities = async (
  relatedEntitiesToClone: Array<RelationType>,
  newEntityId: string,
  previouslySeenEntityIds: Set<string>,
  parentEntityId: string | null,
  parentEntityName: string | null | undefined
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

      const relationshipOp = Relation.make({
        fromId: newEntityId,
        toId: newRelatedEntityId,
        relationTypeId: relation.typeOf.id,
        position: relation.index,
      });

      const [newRelatedEntityOps, newlySeenEntityIds] = await cloneEntity(
        {
          oldEntityId: relation.toEntity.id,
          entityId: newRelatedEntityId,
          entityName: relation.toEntity.name ?? '',
          parentEntityId,
          parentEntityName,
        },
        allSeenEntityIds
      );
      newlySeenEntityIds.forEach(entityId => allSeenEntityIds.add(entityId));

      return [relationshipOp, ...newRelatedEntityOps];
    })
  );

  return [allOps.flat(), allSeenEntityIds] as const;
};

const SKIPPED_ATTRIBUTES = [
  EntityId(SystemIds.NAME_ATTRIBUTE),
  EntityId(SystemIds.DESCRIPTION_ATTRIBUTE),
  EntityId(ContentIds.AVATAR_ATTRIBUTE),
  EntityId(SystemIds.TABS_ATTRIBUTE),
  EntityId(SystemIds.BLOCKS),
];

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
