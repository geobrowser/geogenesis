import { SYSTEM_IDS } from '@geogenesis/ids';

import { Action } from '~/modules/action';
import { Entity } from '~/modules/entity';
import { Triple } from '~/modules/triple';
import { Value } from '~/modules/value';

import type {
  Action as ActionType,
  Entity as EntityType,
  Triple as TripleType,
  TripleValueType,
} from '~/modules/types';
import type { INetwork } from '~/modules/io/data-source/network';

export type ActionId = string;
export type EntityId = string;
export type BlockId = string;
export type BlockValueType = 'textBlock' | 'tableFilter' | 'imageBlock' | 'tableBlock' | 'markdownContent';
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
  const entities: Record<EntityId, EntityType> = await getEntitiesFromActions(actions, network);

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
              // @NOTE we're assuming this means we're creating a table filter
            } else {
              changes[parentEntityId] = {
                ...changes[parentEntityId],
                name: entities?.[parentEntityId]?.name ?? '',
                blocks: {
                  ...(changes[parentEntityId]?.blocks ?? {}),
                  [entityId]: {
                    ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                    type: 'tableFilter',
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
                    before:
                      typeof changes[parentEntityId]?.blocks?.[entityId]?.before !== 'undefined'
                        ? (changes[parentEntityId]?.blocks?.[entityId]?.before as string | null)
                        : null,
                    after: Action.getValue(action.after, ''),
                  },
                },
                actions: [...(changes[parentEntityId]?.actions ?? []), action.before.id],
              };
              // @NOTE we're assuming this means we're editing a table filter
            } else {
              changes[parentEntityId] = {
                ...changes[parentEntityId],
                name: entities?.[parentEntityId]?.name ?? '',
                blocks: {
                  ...(changes[parentEntityId]?.blocks ?? {}),
                  [entityId]: {
                    ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                    type: 'tableFilter',
                    before:
                      typeof changes[parentEntityId]?.blocks?.[entityId]?.before !== 'undefined'
                        ? (changes[parentEntityId]?.blocks?.[entityId]?.before as string | null)
                        : Action.getValue(action.before, ''),
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
                before:
                  typeof changes[parentEntityId]?.blocks?.[entityId]?.before === 'undefined'
                    ? (changes[parentEntityId]?.blocks?.[entityId]?.before as string | null)
                    : Action.getValue(action.before, ''),
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
                  typeof changes[entityId]?.attributes?.[attributeId]?.before !== 'undefined'
                    ? (changes[entityId]?.attributes?.[attributeId]?.before as string | null)
                    : Action.getName(action.before) ?? Action.getValue(action.before, ''),
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
                    before:
                      typeof changes[parentEntityId]?.blocks?.[entityId]?.before === 'undefined'
                        ? (changes[parentEntityId]?.blocks?.[entityId]?.before as string | null)
                        : Action.getValue(action, ''),
                    after: null,
                  },
                },
                actions: [...(changes[parentEntityId]?.actions ?? []), action.id],
              };
              // @NOTE we're assuming this means we're deleting a table filter
            } else {
              changes[parentEntityId] = {
                ...changes[parentEntityId],
                name: entities?.[parentEntityId]?.name ?? '',
                blocks: {
                  ...(changes[parentEntityId]?.blocks ?? {}),
                  [entityId]: {
                    ...(changes[parentEntityId]?.blocks?.[entityId] ?? {}),
                    type: 'tableFilter',
                    before:
                      typeof changes[parentEntityId]?.blocks?.[entityId]?.before !== 'undefined'
                        ? (changes[parentEntityId]?.blocks?.[entityId]?.before as string | null)
                        : Action.getValue(action, ''),
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

  return { changes, entities };
}

const getEntitiesFromActions = async (actions: ActionType[], network: INetwork) => {
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

export async function fromVersion(versionId: string, previousVersionId: string, network: INetwork) {
  const changes: Record<EntityId, Changeset> = {};

  const [selectedVersion, previousVersion] = await Promise.all([
    network.fetchProposedVersion(versionId),
    network.fetchProposedVersion(previousVersionId),
  ]);

  const versions = {
    selected: selectedVersion,
    previous: previousVersion,
  };

  const entityId = selectedVersion.entity.id;

  const selectedBlock = parseInt(selectedVersion.createdAtBlock, 10);
  const previousBlock = selectedBlock - 1;

  const [selectedEntity, previousEntity] = await Promise.all([
    network.fetchEntity(entityId, null, selectedBlock),
    network.fetchEntity(entityId, null, previousBlock),
  ]);

  const selectedEntityBlockIdsTriple = selectedEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
  const selectedEntityBlockIds: string[] = selectedEntityBlockIdsTriple
    ? JSON.parse(Value.stringValue(selectedEntityBlockIdsTriple) || '[]')
    : [];

  const previousEntityBlockIdsTriple = previousEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
  const previousEntityBlockIds: string[] = previousEntityBlockIdsTriple
    ? JSON.parse(Value.stringValue(previousEntityBlockIdsTriple) || '[]')
    : [];

  const [maybeRemoteSelectedEntityBlocks, maybeRemotePreviousEntityBlocks, maybeAdditionalRemotePreviousEntityBlocks] =
    await Promise.all([
      Promise.all(selectedEntityBlockIds.map(entityId => network.fetchEntity(entityId, null, selectedBlock))),
      Promise.all(selectedEntityBlockIds.map(entityId => network.fetchEntity(entityId, null, previousBlock))),
      Promise.all(previousEntityBlockIds.map(entityId => network.fetchEntity(entityId, null, previousBlock))),
    ]);

  if (selectedEntity) {
    changes[entityId] = {
      name: selectedEntity.name ?? '',
    };

    selectedEntity.triples.map(triple => {
      switch (triple.value.type) {
        case 'entity': {
          changes[entityId] = {
            ...changes[entityId],
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [triple.attributeId]: {
                ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
                type: triple.value.type ?? '',
                name: triple.attributeName ?? '',
                before: [],
                after: [...(changes[entityId]?.attributes?.[triple.attributeId]?.after ?? []), triple.value.name],
                actions: [],
              },
            },
          };
          break;
        }

        default: {
          changes[entityId] = {
            ...changes[entityId],
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [triple.attributeId]: {
                ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
                type: triple.value.type ?? '',
                name: triple.attributeName ?? '',
                before: null,
                after: Triple.getValue(triple) ?? '',
                actions: [],
              },
            },
          };
          break;
        }
      }
    });
  }

  if (previousEntity) {
    previousEntity.triples.map(triple => {
      switch (triple.value.type) {
        case 'entity': {
          changes[entityId] = {
            ...changes[entityId],
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [triple.attributeId]: {
                ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
                type: triple.value.type ?? '',
                name: triple.attributeName ?? '',
                before: [...(changes[entityId]?.attributes?.[triple.attributeId]?.before ?? []), triple.value.name],
                after: changes[entityId]?.attributes?.[triple.attributeId]?.after ?? null,
                actions: [],
              },
            },
          };
          break;
        }
        default: {
          changes[entityId] = {
            ...changes[entityId],
            attributes: {
              ...(changes[entityId]?.attributes ?? {}),
              [triple.attributeId]: {
                ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
                type: triple.value.type ?? '',
                name: triple.attributeName ?? '',
                before: Triple.getValue(triple) ?? '',
                after: changes[entityId]?.attributes?.[triple.attributeId]?.after ?? null,
                actions: [],
              },
            },
          };
          break;
        }
      }
    });
  }

  if (maybeRemoteSelectedEntityBlocks) {
    maybeRemoteSelectedEntityBlocks.forEach(selectedEntityBlock => {
      if (selectedEntityBlock === null) return;

      changes[entityId] = {
        ...changes[entityId],
        blocks: {
          ...(changes[entityId]?.blocks ?? {}),
          [selectedEntityBlock.id]: {
            type: getBlockTypeFromTriples(selectedEntityBlock.triples),
            before: null,
            after: getBlockValueFromTriples(selectedEntityBlock.triples),
          },
        },
      };
    });
  }

  if (maybeRemotePreviousEntityBlocks) {
    maybeRemotePreviousEntityBlocks.forEach(previousEntityBlock => {
      if (previousEntityBlock === null) return;

      changes[entityId] = {
        ...changes[entityId],
        blocks: {
          ...(changes[entityId]?.blocks ?? {}),
          [previousEntityBlock.id]: {
            ...(changes[entityId]?.blocks?.[previousEntityBlock.id] ?? {}),
            before: getBlockValueFromTriples(previousEntityBlock.triples),
          } as BlockChange,
        },
      };
    });
  }

  if (maybeAdditionalRemotePreviousEntityBlocks) {
    maybeAdditionalRemotePreviousEntityBlocks.forEach(previousEntityBlock => {
      if (previousEntityBlock === null) return;

      changes[entityId] = {
        ...changes[entityId],
        blocks: {
          ...(changes[entityId]?.blocks ?? {}),
          [previousEntityBlock.id]: {
            ...(changes[entityId]?.blocks?.[previousEntityBlock.id] ?? {}),
            type: getBlockTypeFromTriples(previousEntityBlock.triples),
            before: getBlockValueFromTriples(previousEntityBlock.triples),
            after: changes[entityId]?.blocks?.[previousEntityBlock.id]?.after ?? null,
          },
        },
      };
    });
  }

  return { changes, versions };
}

export async function fromProposal(proposalId: string, previousProposalId: string, network: INetwork) {
  const changes: Record<EntityId, Changeset> = {};

  const [selectedProposal, previousProposal] = await Promise.all([
    network.fetchProposal(proposalId),
    network.fetchProposal(previousProposalId),
  ]);

  const proposals = {
    selected: selectedProposal,
    previous: previousProposal,
  };

  const selectedBlock = parseInt(selectedProposal.createdAtBlock, 10);
  const previousBlock = selectedBlock - 1;

  const entitySet = new Set<EntityId>();

  if (selectedProposal) {
    selectedProposal.proposedVersions.forEach((proposedVersion: any) => {
      proposedVersion.actions.forEach((action: any) => {
        entitySet.add(action.entity.id);
      });
    });
  }

  const entityIds = [...entitySet.values()];

  for (const entityId of entityIds) {
    const [selectedEntity, previousEntity] = await Promise.all([
      network.fetchEntity(entityId, null, selectedBlock),
      network.fetchEntity(entityId, null, previousBlock),
    ]);

    const selectedEntityBlockIdsTriple = selectedEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
    const selectedEntityBlockIds: string[] = selectedEntityBlockIdsTriple
      ? JSON.parse(Value.stringValue(selectedEntityBlockIdsTriple) || '[]')
      : [];

    const previousEntityBlockIdsTriple = previousEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
    const previousEntityBlockIds: string[] = previousEntityBlockIdsTriple
      ? JSON.parse(Value.stringValue(previousEntityBlockIdsTriple) || '[]')
      : [];

    const [
      maybeRemoteSelectedEntityBlocks,
      maybeRemotePreviousEntityBlocks,
      maybeAdditionalRemotePreviousEntityBlocks,
    ] = await Promise.all([
      Promise.all(selectedEntityBlockIds.map(entityId => network.fetchEntity(entityId, null, selectedBlock))),
      Promise.all(selectedEntityBlockIds.map(entityId => network.fetchEntity(entityId, null, previousBlock))),
      Promise.all(previousEntityBlockIds.map(entityId => network.fetchEntity(entityId, null, previousBlock))),
    ]);

    if (selectedEntity) {
      changes[entityId] = {
        name: selectedEntity.name ?? '',
      };

      selectedEntity.triples.map(triple => {
        switch (triple.value.type) {
          case 'entity': {
            changes[entityId] = {
              ...changes[entityId],
              attributes: {
                ...(changes[entityId]?.attributes ?? {}),
                [triple.attributeId]: {
                  ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
                  type: triple.value.type ?? '',
                  name: triple.attributeName ?? '',
                  before: [],
                  after: [...(changes[entityId]?.attributes?.[triple.attributeId]?.after ?? []), triple.value.name],
                  actions: [],
                },
              },
            };
            break;
          }

          default: {
            changes[entityId] = {
              ...changes[entityId],
              attributes: {
                ...(changes[entityId]?.attributes ?? {}),
                [triple.attributeId]: {
                  ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
                  type: triple.value.type ?? '',
                  name: triple.attributeName ?? '',
                  before: null,
                  after: Triple.getValue(triple) ?? '',
                  actions: [],
                },
              },
            };
            break;
          }
        }
      });
    }

    if (previousEntity) {
      previousEntity.triples.map(triple => {
        switch (triple.value.type) {
          case 'entity': {
            changes[entityId] = {
              ...changes[entityId],
              attributes: {
                ...(changes[entityId]?.attributes ?? {}),
                [triple.attributeId]: {
                  ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
                  type: triple.value.type ?? '',
                  name: triple.attributeName ?? '',
                  before: [...(changes[entityId]?.attributes?.[triple.attributeId]?.before ?? []), triple.value.name],
                  after: changes[entityId]?.attributes?.[triple.attributeId]?.after ?? null,
                  actions: [],
                },
              },
            };
            break;
          }
          default: {
            changes[entityId] = {
              ...changes[entityId],
              attributes: {
                ...(changes[entityId]?.attributes ?? {}),
                [triple.attributeId]: {
                  ...(changes[entityId]?.attributes?.[triple.attributeId] ?? {}),
                  type: triple.value.type ?? '',
                  name: triple.attributeName ?? '',
                  before: Triple.getValue(triple) ?? '',
                  after: changes[entityId]?.attributes?.[triple.attributeId]?.after ?? null,
                  actions: [],
                },
              },
            };
            break;
          }
        }
      });
    }

    if (maybeRemoteSelectedEntityBlocks) {
      maybeRemoteSelectedEntityBlocks.forEach(selectedEntityBlock => {
        if (selectedEntityBlock === null) return;

        changes[entityId] = {
          ...changes[entityId],
          blocks: {
            ...(changes[entityId]?.blocks ?? {}),
            [selectedEntityBlock.id]: {
              type: getBlockTypeFromTriples(selectedEntityBlock.triples),
              before: null,
              after: getBlockValueFromTriples(selectedEntityBlock.triples),
            },
          },
        };
      });
    }

    if (maybeRemotePreviousEntityBlocks) {
      maybeRemotePreviousEntityBlocks.forEach(previousEntityBlock => {
        if (previousEntityBlock === null) return;

        changes[entityId] = {
          ...changes[entityId],
          blocks: {
            ...(changes[entityId]?.blocks ?? {}),
            [previousEntityBlock.id]: {
              ...(changes[entityId]?.blocks?.[previousEntityBlock.id] ?? {}),
              before: getBlockValueFromTriples(previousEntityBlock.triples),
            } as BlockChange,
          },
        };
      });
    }

    if (maybeAdditionalRemotePreviousEntityBlocks) {
      maybeAdditionalRemotePreviousEntityBlocks.forEach(previousEntityBlock => {
        if (previousEntityBlock === null) return;

        changes[entityId] = {
          ...changes[entityId],
          blocks: {
            ...(changes[entityId]?.blocks ?? {}),
            [previousEntityBlock.id]: {
              ...(changes[entityId]?.blocks?.[previousEntityBlock.id] ?? {}),
              type: getBlockTypeFromTriples(previousEntityBlock.triples),
              before: getBlockValueFromTriples(previousEntityBlock.triples),
              after: changes[entityId]?.blocks?.[previousEntityBlock.id]?.after ?? null,
            },
          },
        };
      });
    }
  }

  return { changes, proposals };
}

const getBlockTypeFromTriples = (triples: TripleType[]): BlockValueType => {
  const tripleWithContent = triples.find(triple => CONTENT_ATTRIBUTE_IDS.includes(triple.attributeId));

  // @TODO replace with better fallback
  if (!tripleWithContent) return 'markdownContent';

  switch (tripleWithContent.attributeId) {
    case SYSTEM_IDS.ROW_TYPE:
    case SYSTEM_IDS.TABLE_BLOCK:
      return 'tableBlock';
    case SYSTEM_IDS.IMAGE_BLOCK:
      return 'imageBlock';
    case SYSTEM_IDS.MARKDOWN_CONTENT:
      return 'markdownContent';
    case SYSTEM_IDS.FILTER:
      return 'tableFilter';
    default:
      // @TODO replace with better fallback
      return 'markdownContent';
  }
};

const getBlockValueFromTriples = (triples: TripleType[]) => {
  const tripleWithContent = triples.find(triple => CONTENT_ATTRIBUTE_IDS.includes(triple.attributeId));

  // @TODO replace with better fallback
  if (!tripleWithContent) {
    return '';
  }

  if (tripleWithContent.attributeId === SYSTEM_IDS.ROW_TYPE) {
    return tripleWithContent.entityName;
  }

  return Triple.getValue(tripleWithContent);
};

const CONTENT_ATTRIBUTE_IDS = [
  SYSTEM_IDS.ROW_TYPE,
  SYSTEM_IDS.TABLE_BLOCK,
  SYSTEM_IDS.IMAGE_BLOCK,
  SYSTEM_IDS.MARKDOWN_CONTENT,
  SYSTEM_IDS.FILTER,
];
