import { SYSTEM_IDS } from '@geogenesis/ids';

import { Subgraph } from '~/core/io/';
import { fetchVersion } from '~/core/io/subgraph/fetch-version';
import { fetchVersions } from '~/core/io/subgraph/fetch-versions';
import type {
  Action as ActionType,
  Entity as EntityType,
  ProposedVersion,
  Triple as TripleType,
  TripleValueType,
  Version,
} from '~/core/types';
import { Action } from '~/core/utils/action';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { Value } from '~/core/utils/value';

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

export async function fromActions(actions: ActionType[], subgraph: Subgraph.ISubgraph) {
  const entities: Record<EntityId, EntityType> = await getEntitiesFromActions(actions, subgraph);

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

const getEntitiesFromActions = async (actions: ActionType[], subgraph: Subgraph.ISubgraph) => {
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
    [...entitySet.values()].map((entityId: EntityId) => subgraph.fetchEntity({ id: entityId }))
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
    parentEntityIds.map((entityId: EntityId) => subgraph.fetchEntity({ id: entityId }))
  );
  const remoteParentEntities = maybeRemoteParentEntities.flatMap(entity => (entity ? [entity] : []));

  remoteParentEntities.forEach(entity => {
    entities[entity.id] = entity;
  });

  return entities;
};

export async function fromVersion(versionId: string, previousVersionId: string, subgraph: Subgraph.ISubgraph) {
  const changes: Record<EntityId, Changeset> = {};

  const [selectedVersion, previousVersion] = await Promise.all([
    fetchVersion({ versionId: versionId }),
    fetchVersion({ versionId: previousVersionId }),
  ]);

  const versions = {
    selected: selectedVersion,
    previous: previousVersion,
  };

  let entityId = '';
  let selectedBlock = 0;
  let previousBlock = 0;

  if (selectedVersion) {
    entityId = selectedVersion.entity.id;

    selectedBlock = parseInt(selectedVersion.createdAtBlock, 10);
    previousBlock = selectedBlock - 1;
  }

  const selectedEntityBlockIdsTriple = selectedVersion?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
  const selectedEntityBlockIds: string[] = selectedEntityBlockIdsTriple
    ? JSON.parse(Value.stringValue(selectedEntityBlockIdsTriple) || '[]')
    : [];

  const previousEntityBlockIdsTriple = previousVersion?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
  const previousEntityBlockIds: string[] = previousEntityBlockIdsTriple
    ? JSON.parse(Value.stringValue(previousEntityBlockIdsTriple) || '[]')
    : [];

  const [maybeRemoteSelectedEntityBlocks, maybeRemotePreviousEntityBlocks, maybeAdditionalRemotePreviousEntityBlocks] =
    await Promise.all([
      Promise.all(selectedEntityBlockIds.map(entityId => subgraph.fetchEntity({ id: entityId }))),
      Promise.all(selectedEntityBlockIds.map(entityId => subgraph.fetchEntity({ id: entityId }))),
      Promise.all(previousEntityBlockIds.map(entityId => subgraph.fetchEntity({ id: entityId }))),
    ]);

  if (selectedVersion) {
    changes[entityId] = {
      name: previousVersion?.name ?? '',
    };

    selectedVersion.triples.map(triple => {
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

  if (previousVersion) {
    previousVersion.triples.map(triple => {
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

export async function fromProposal(proposalId: string, previousProposalId: string, subgraph: Subgraph.ISubgraph) {
  const changes: Record<EntityId, Changeset> = {};

  const [selectedProposal, previousProposal] = await Promise.all([
    subgraph.fetchProposal({ id: proposalId }),
    subgraph.fetchProposal({ id: previousProposalId }),
  ]);

  const proposals = {
    selected: selectedProposal,
    previous: previousProposal,
  };

  const entitySet = new Set<EntityId>();

  if (selectedProposal) {
    selectedProposal.proposedVersions.forEach(proposedVersion => entitySet.add(proposedVersion.entity.id));
  }

  const entityIds = [...entitySet.values()];

  for (const entityId of entityIds) {
    // Fetch the entity versions that correlate with the selected and previous proposals
    // There's no way to fetch a specific version by proposal id so we need to fetch all
    // versions by proposal id and select the first one. There should only ever be one
    // version for an entity for a proposal.
    const [maybeSelectedVersions, maybePreviousVersions] = await Promise.all([
      selectedProposal ? fetchVersions({ entityId: entityId, proposalId: selectedProposal.id }) : [],
      previousProposal ? fetchVersions({ entityId: entityId, proposalId: previousProposal.id }) : [],
    ]);

    const selectedVersion: Version | undefined = maybeSelectedVersions[0];
    const previousVersion: Version | undefined = maybePreviousVersions[0];

    const selectedEntityBlockIdsTriple =
      selectedVersion?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
    const selectedEntityBlockIds: string[] = selectedEntityBlockIdsTriple
      ? JSON.parse(Value.stringValue(selectedEntityBlockIdsTriple) || '[]')
      : [];

    const previousEntityBlockIdsTriple =
      previousVersion?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) ?? null;
    const previousEntityBlockIds: string[] = previousEntityBlockIdsTriple
      ? JSON.parse(Value.stringValue(previousEntityBlockIdsTriple) || '[]')
      : [];

    const [
      maybeRemoteSelectedEntityBlocks,
      maybeRemotePreviousEntityBlocks,
      maybeAdditionalRemotePreviousEntityBlocks,
    ] = await Promise.all([
      Promise.all(selectedEntityBlockIds.map(entityId => subgraph.fetchEntity({ id: entityId }))),
      Promise.all(selectedEntityBlockIds.map(entityId => subgraph.fetchEntity({ id: entityId }))),
      Promise.all(previousEntityBlockIds.map(previousEntityId => subgraph.fetchEntity({ id: previousEntityId }))),
    ]);

    if (selectedVersion && !selectedVersion.triples.find(triple => triple.attributeId === SYSTEM_IDS.PARENT_ENTITY)) {
      changes[entityId] = {
        name: selectedVersion.entity.name ?? '',
      };

      selectedVersion.triples.map(triple => {
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

    if (previousVersion && !previousVersion.triples.find(triple => triple.attributeId === SYSTEM_IDS.PARENT_ENTITY)) {
      previousVersion.triples.map(triple => {
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
