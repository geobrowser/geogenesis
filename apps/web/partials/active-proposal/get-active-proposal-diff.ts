import { SYSTEM_IDS } from '@geogenesis/ids';

import { Subgraph } from '~/core/io';
import { fetchProposal } from '~/core/io/subgraph';
import { fetchVersions } from '~/core/io/subgraph/fetch-versions';
import { Action, EntityId, Proposal, Version } from '~/core/types';
import { Triple as TripleType } from '~/core/types';
import { BlockChange, BlockValueType, Changeset } from '~/core/utils/change/change';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { Value } from '~/core/utils/value';

export async function getActiveProposalDiff(
  selectedProposal: Proposal,
  previousProposalId: string | null,
  subgraph: Subgraph.ISubgraph
) {
  const changes: Record<EntityId, Changeset> = {};

  const previousProposal = previousProposalId ? await fetchProposal({ id: previousProposalId }) : null;

  const proposals = {
    selected: selectedProposal,
    previous: previousProposal,
  };

  const entitySet = new Set<EntityId>(
    selectedProposal.proposedVersions.map(proposedVersion => proposedVersion.entity.id)
  );

  const entityIds = [...entitySet.values()];

  const allActionsInProposal = selectedProposal.proposedVersions.reduce((acc, proposedVersion) => {
    return [...acc, ...proposedVersion.actions];
  }, [] as Action[]);

  for (const entityId of entityIds) {
    // Fetch the entity versions that correlate with the selected and previous proposals
    // from the currently live version of each entity.
    //
    // We want to compare against the live version of the entity so we can see the changes
    // that the proposal introduces.
    //
    // There's no way to fetch a specific version by proposal id so we need to fetch all
    // versions by proposal id and select the first one. There should only ever be one
    // version for an entity for a proposal.
    const [maybeSelectedVersions, maybePreviousVersions] = await Promise.all([
      fetchVersions({
        entityId: entityId,
      }),
      previousProposal
        ? fetchVersions({
            entityId: entityId,
            proposalId: previousProposal.id,
          })
        : [],
    ]);

    const selectedRemoteVersion: Version | undefined = maybeSelectedVersions[0];
    const previousVersion: Version | undefined = maybePreviousVersions[0];

    // Entity.mergeActionsWithEntity gives us the state of the entity after the actions in
    // the proposal are applied.
    const selectedVersion = Entity.mergeActionsWithEntity(allActionsInProposal, {
      id: entityId,
      description: Entity.description(selectedRemoteVersion.triples),
      name: Entity.name(selectedRemoteVersion.triples),
      triples: selectedRemoteVersion.triples,
      types: Entity.types(selectedRemoteVersion.triples),
    });

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

    // @TODO: What do we do about selected entity blocks?
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
        name: selectedVersion.name ?? '',
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

const CONTENT_ATTRIBUTE_IDS = [
  SYSTEM_IDS.ROW_TYPE,
  SYSTEM_IDS.TABLE_BLOCK,
  SYSTEM_IDS.IMAGE_BLOCK,
  SYSTEM_IDS.MARKDOWN_CONTENT,
  SYSTEM_IDS.FILTER,
];

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
