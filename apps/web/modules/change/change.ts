import { SYSTEM_IDS } from '@geogenesis/ids';

import { Action } from '~/modules/action';
import { Entity } from '~/modules/entity';
import type { Action as ActionType, Entity as EntityType, TripleValueType } from '~/modules/types';
import type { INetwork } from '~/modules/io/data-source/network';

type EntityId = string;
type BlockId = string;
type BlockValueType = 'textBlock' | 'imageBlock' | 'tableBlock' | 'markdownContent';
type AttributeId = string;
type Changeset = {
  name: string;
  blocks?: Record<BlockId, BlockChange>;
  attributes?: Record<AttributeId, TripleChange>;
};
type BlockChange = {
  type: BlockValueType;
  before: string | null;
  after: string | null;
};
type TripleChange = {
  type: TripleValueType;
  before: string | null;
  after: string | null;
};

export async function fromActions(actions: ActionType[], network: INetwork) {
  const entities: Record<EntityId, EntityType> = await getEntities(actions, network);

  const changes: Record<EntityId, Changeset> = {};

  const newBlocks = new Map();

  actions.forEach(action => {
    switch (action.type) {
      case 'createTriple': {
        const entityId = action.entityId;

        if (action.attributeId === SYSTEM_IDS.PARENT_ENTITY) {
          const parentEntityId = action.id.split(':').slice(-1)[0];
          newBlocks.set(entityId, parentEntityId);
        }

        const parentEntityId = newBlocks.get(entityId) ?? Entity.getParentEntityId(entities[entityId].triples);
        const attributeId = action.attributeId;

        if (parentEntityId) {
          const blockType = Action.getBlockType(action);

          if (blockType === null) break;

          changes[parentEntityId] = {
            ...changes[parentEntityId],
            name: entities[parentEntityId]?.name ?? '',
            blocks: {
              ...(changes[parentEntityId]?.blocks ?? {}),
              [entityId]: {
                ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                type: blockType,
                before: null,
                after: Action.getName(action) ?? Action.getValue(action, ''),
              },
            },
          };
        } else {
          changes[entityId] = {
            ...changes[entityId],
            name: entities[entityId]?.name ?? '',
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [attributeId]: {
                ...(changes[entityId]?.attributes?.[attributeId] ?? {}),
                type: Action.getValueType(action),
                before: null,
                after: Action.getName(action) ?? Action.getValue(action, ''),
              },
            },
          };
        }

        break;
      }

      case 'editTriple': {
        const entityId = action.before.entityId;
        const parentEntityId = newBlocks.get(entityId) ?? Entity.getParentEntityId(entities[entityId].triples);
        const attributeId = action.before.attributeId;

        if (parentEntityId) {
          const blockType = Action.getBlockType(action.before);

          if (blockType === null) break;

          changes[parentEntityId] = {
            ...changes[parentEntityId],
            name: entities[parentEntityId]?.name ?? '',
            blocks: {
              ...(changes[parentEntityId]?.blocks ?? {}),
              [entityId]: {
                ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),

                type: blockType,
                before:
                  changes[parentEntityId]?.blocks?.[entityId]?.before ??
                  Action.getName(action.before) ??
                  Action.getValue(action.before, ''),
                after: Action.getName(action.after) ?? Action.getValue(action.after, ''),
              },
            },
          };
        } else {
          changes[entityId] = {
            ...changes[entityId],
            name: entities[entityId]?.name ?? '',
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [attributeId]: {
                ...(changes[entityId]?.attributes?.[attributeId] ?? {}),
                type: Action.getValueType(action.after),
                before:
                  changes[entityId]?.attributes?.[attributeId]?.before ??
                  Action.getName(action.before) ??
                  Action.getValue(action.before, ''),
                after: Action.getName(action.after) ?? Action.getValue(action.after, ''),
              },
            },
          };
        }

        break;
      }

      case 'deleteTriple': {
        const entityId = action.entityId;
        const parentEntityId = newBlocks.get(entityId) ?? Entity.getParentEntityId(entities[entityId].triples);
        const attributeId = action.attributeId;

        if (parentEntityId) {
          const blockType = Action.getBlockType(action);

          if (blockType === null) break;

          changes[parentEntityId] = {
            ...changes[parentEntityId],
            name: entities[parentEntityId]?.name ?? '',
            blocks: {
              ...(changes[parentEntityId]?.blocks ?? {}),
              [entityId]: {
                ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                type: blockType,
                before:
                  typeof changes[parentEntityId]?.blocks?.[entityId]?.before !== 'undefined'
                    ? (changes[parentEntityId]?.blocks?.[entityId]?.before as string | null)
                    : Action.getName(action) ?? Action.getValue(action, ''),
                after: null,
              },
            },
          };
        } else {
          changes[entityId] = {
            ...changes[entityId],
            name: entities[entityId]?.name ?? '',
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [attributeId]: {
                ...(changes[entityId]?.attributes?.[attributeId] ?? {}),
                type: Action.getValueType(action),
                before:
                  typeof changes[entityId]?.attributes?.[attributeId]?.before !== 'undefined'
                    ? (changes[entityId]?.attributes?.[attributeId]?.before as string | null)
                    : Action.getName(action) ?? Action.getValue(action, ''),
                after: null,
              },
            },
          };
        }

        break;
      }
    }
  });

  return changes;
}

const getEntities = async (actions: ActionType[], network: INetwork) => {
  const entities: Record<EntityId, EntityType> = {};

  const entitySet = new Set<EntityId>();

  actions.forEach(action => {
    switch (action.type) {
      case 'createTriple':
      case 'deleteTriple':
        entitySet.add(action.entityId);
        break;
      case 'editTriple':
        entitySet.add(action.before.entityId);
        break;
    }
  });

  const maybeRemoteEntities = await Promise.all(
    [...entitySet.values()].map((entityId: EntityId) => network.fetchEntity(entityId))
  );
  const remoteEntities = maybeRemoteEntities.flatMap(entity => (entity ? [entity] : []));

  remoteEntities.forEach(entity => {
    entities[entity.id] = entity;
  });

  const parentEntitySet = new Set<EntityId>();

  Object.keys(entities).forEach(entityId => {
    const parentEntityId = Entity.getParentEntityId(entities[entityId].triples);

    if (parentEntityId && !entitySet.has(parentEntityId)) {
      parentEntitySet.add(parentEntityId);
    }
  });

  const parentEntityIds = [...parentEntitySet.values()];

  const maybeRemoteParentEntities = await Promise.all(
    parentEntityIds.map((entityId: EntityId) => network.fetchEntity(entityId))
  );
  const remoteParentEntities = maybeRemoteParentEntities.flatMap(entity => (entity ? [entity] : []));

  remoteParentEntities.forEach(entity => {
    entities[entity.id] = entity;
  });

  return entities;
};
