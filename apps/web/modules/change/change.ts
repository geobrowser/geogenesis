import { SYSTEM_IDS } from '@geogenesis/ids';

import { Action } from '~/modules/action';
import { Entity } from '~/modules/entity';
import type { Action as ActionType, Entity as EntityType, TripleValueType } from '~/modules/types';
import type { INetwork } from '~/modules/io/data-source/network';

export type ActionId = string;
export type EntityId = string;
export type BlockId = string;
export type BlockValueType = 'textBlock' | 'imageBlock' | 'tableBlock' | 'markdownContent';
export type AttributeId = string;
export type Changeset = {
  name: string;
  blocks?: Record<BlockId, BlockChange>;
  attributes?: Record<AttributeId, AttributeChange>;
  actions?: Array<ActionId>;
};
export type BlockChange = {
  type: BlockValueType;
  before: string | null;
  after: string | null;
};
export type AttributeChange = {
  type: TripleValueType;
  name: string;
  before: string | null | Array<string | null>;
  after: string | null | Array<string | null>;
  actions: Array<ActionId>;
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

        const parentEntityId = newBlocks.get(entityId) ?? Entity.getParentEntityId(entities?.[entityId]?.triples);
        const attributeId = action.attributeId;

        if (parentEntityId) {
          const blockType = Action.getBlockType(action);

          if (blockType === null) {
            // @NOTE we're assuming this means we're creating a table block
            if (action.attributeId === 'name') {
              changes[parentEntityId] = {
                ...changes[parentEntityId],
                name: entities?.[parentEntityId]?.name ?? '',
                blocks: {
                  ...(changes[parentEntityId]?.blocks ?? {}),
                  [entityId]: {
                    ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                    type: 'tableBlock',
                    before: null,
                    after: Action.getValue(action, ''),
                  },
                },
                actions: [...(changes[parentEntityId]?.actions ?? []), action.id],
              };
            }

            break;
          }

          changes[parentEntityId] = {
            ...changes[parentEntityId],
            name: entities?.[parentEntityId]?.name ?? '',
            blocks: {
              ...(changes[parentEntityId]?.blocks ?? {}),
              [entityId]: {
                ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                type: blockType,
                before: null,
                after: Action.getValue(action, ''),
              },
            },
            actions: [...(changes[parentEntityId]?.actions ?? []), action.id],
          };
        } else if (action.value.type === 'entity') {
          changes[entityId] = {
            ...changes[entityId],
            name: entities?.[entityId]?.name ?? '',
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [attributeId]: {
                ...(changes[entityId]?.attributes?.[attributeId] ?? {}),
                type: Action.getValueType(action),
                name: action.attributeName ?? '',
                before: [...(changes[entityId]?.attributes?.[attributeId]?.before ?? [])],
                after: [...(changes[entityId]?.attributes?.[attributeId]?.after ?? []), Action.getName(action)],
                actions: [...(changes[entityId]?.attributes?.[attributeId]?.actions ?? []), action.id],
              },
            },
            actions: [...(changes[entityId]?.actions ?? []), action.id],
          };
        } else {
          changes[entityId] = {
            ...changes[entityId],
            name: entities?.[entityId]?.name ?? '',
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [attributeId]: {
                ...(changes[entityId]?.attributes?.[attributeId] ?? {}),
                type: Action.getValueType(action),
                name: action.attributeName ?? '',
                before: null,
                after: Action.getValue(action, ''),
                actions: [...(changes[entityId]?.attributes?.[attributeId]?.actions ?? []), action.id],
              },
            },
            actions: [...(changes[entityId]?.actions ?? []), action.id],
          };
        }

        break;
      }

      case 'editTriple': {
        const entityId = action.before.entityId;
        const parentEntityId = newBlocks.get(entityId) ?? Entity.getParentEntityId(entities?.[entityId]?.triples);
        const attributeId = action.before.attributeId;

        if (parentEntityId) {
          const blockType = Action.getBlockType(action.before);

          if (blockType === null) {
            // @NOTE we're assuming this means we're editing the name of a table block
            if (action.before.attributeId === 'name') {
              changes[parentEntityId] = {
                ...changes[parentEntityId],
                name: entities?.[parentEntityId]?.name ?? '',
                blocks: {
                  ...(changes[parentEntityId]?.blocks ?? {}),
                  [entityId]: {
                    ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                    type: 'tableBlock',
                    before: changes[parentEntityId]?.blocks?.[entityId]?.before ?? Action.getValue(action.before, ''),
                    after: Action.getValue(action.after, ''),
                  },
                },
                actions: [...(changes[parentEntityId]?.actions ?? []), action.before.id],
              };
            }

            break;
          }

          changes[parentEntityId] = {
            ...changes[parentEntityId],
            name: entities?.[parentEntityId]?.name ?? '',
            blocks: {
              ...(changes[parentEntityId]?.blocks ?? {}),
              [entityId]: {
                ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                type: blockType,
                before: changes[parentEntityId]?.blocks?.[entityId]?.before ?? Action.getValue(action.before, ''),
                after: Action.getValue(action.after, ''),
              },
            },
            actions: [...(changes[parentEntityId]?.actions ?? []), action.before.id],
          };
        } else {
          changes[entityId] = {
            ...changes[entityId],
            name: entities?.[entityId]?.name ?? '',
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [attributeId]: {
                ...(changes[entityId]?.attributes?.[attributeId] ?? {}),
                type: Action.getValueType(action.after),
                name: action.before.attributeName ?? '',
                before:
                  changes[entityId]?.attributes?.[attributeId]?.before ??
                  Action.getName(action.before) ??
                  Action.getValue(action.before, ''),
                after: Action.getValue(action.after, ''),
                actions: [...(changes[entityId]?.attributes?.[attributeId]?.actions ?? []), action.before.id],
              },
            },
            actions: [...(changes[entityId]?.actions ?? []), action.before.id],
          };
        }

        break;
      }

      case 'deleteTriple': {
        const entityId = action.entityId;
        const parentEntityId = newBlocks.get(entityId) ?? Entity.getParentEntityId(entities?.[entityId]?.triples);
        const attributeId = action.attributeId;

        if (parentEntityId) {
          const blockType = Action.getBlockType(action);

          if (blockType === null) {
            // @NOTE we're assuming this means we're deleting a table block
            if (action.attributeId === 'name') {
              changes[parentEntityId] = {
                ...changes[parentEntityId],
                name: entities?.[parentEntityId]?.name ?? '',
                blocks: {
                  ...(changes[parentEntityId]?.blocks ?? {}),
                  [entityId]: {
                    ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                    type: 'tableBlock',
                    before: Action.getValue(action, ''),
                    after: null,
                  },
                },
                actions: [...(changes[parentEntityId]?.actions ?? []), action.id],
              };
            }

            break;
          }

          changes[parentEntityId] = {
            ...changes[parentEntityId],
            name: entities?.[parentEntityId]?.name ?? '',
            blocks: {
              ...(changes[parentEntityId]?.blocks ?? {}),
              [entityId]: {
                ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                type: blockType,
                before:
                  typeof changes[parentEntityId]?.blocks?.[entityId]?.before !== 'undefined'
                    ? (changes[parentEntityId]?.blocks?.[entityId]?.before as string | null)
                    : Action.getValue(action, ''),
                after: null,
              },
            },
            actions: [...(changes[parentEntityId]?.actions ?? []), action.id],
          };
        } else if (action.value.type === 'entity') {
          changes[entityId] = {
            ...changes[entityId],
            name: entities?.[entityId]?.name ?? '',
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [attributeId]: {
                ...(changes[entityId]?.attributes?.[attributeId] ?? {}),
                type: Action.getValueType(action),
                name: action.attributeName ?? '',
                before: [...(changes[entityId]?.attributes?.[attributeId]?.before ?? []), Action.getName(action)],
                after: [...(changes[entityId]?.attributes?.[attributeId]?.after ?? [])],
                actions: [...(changes[entityId]?.attributes?.[attributeId]?.actions ?? []), action.id],
              },
            },
            actions: [...(changes[entityId]?.actions ?? []), action.id],
          };
        } else {
          changes[entityId] = {
            ...changes[entityId],
            name: entities?.[entityId]?.name ?? '',
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [attributeId]: {
                ...(changes[entityId]?.attributes?.[attributeId] ?? {}),
                type: Action.getValueType(action),
                name: action.attributeName ?? '',
                before:
                  typeof changes[entityId]?.attributes?.[attributeId]?.before !== 'undefined'
                    ? (changes[entityId]?.attributes?.[attributeId]?.before as string | null)
                    : Action.getValue(action, ''),
                after: null,
                actions: [...(changes[entityId]?.attributes?.[attributeId]?.actions ?? []), action.id],
              },
            },
            actions: [...(changes[entityId]?.actions ?? []), action.id],
          };
        }

        break;
      }
    }
  });

  return [changes, entities];
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
    const parentEntityId = Entity.getParentEntityId(entities?.[entityId]?.triples);

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
