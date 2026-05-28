'use client';

import { IdUtils, Position } from '@geoprotocol/geo-sdk/lite';

import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { SUBTOPIC_RELATION_TYPE_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { usePublish } from '~/core/hooks/use-publish';
import { useSpace } from '~/core/hooks/use-space';
import { useMutate } from '~/core/sync/use-mutate';
import type { Relation } from '~/core/types';
import { createTypeRelationForNewEntity } from '~/partials/blocks/table/change-entry';

type ProposeSubtopicAddArgs = {
  parentEntityId: string;
  parentName: string | null;
  childEntityId: string;
  childName: string | null;
};

type ProposeSubtopicRemoveArgs = {
  parentEntityId: string;
  parentName: string | null;
  childEntityId: string;
  childName: string | null;
  relationId: string;
};

function buildSubtopicRelation({
  parentEntityId,
  parentName,
  childEntityId,
  childName,
  spaceId,
}: ProposeSubtopicAddArgs & { spaceId: string }): Relation {
  return {
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    isLocal: true,
    hasBeenPublished: false,
    isDeleted: false,
    type: {
      id: SUBTOPIC_RELATION_TYPE_ID,
      name: 'Subtopics',
    },
    fromEntity: {
      id: parentEntityId,
      name: parentName,
    },
    toEntity: {
      id: childEntityId,
      name: childName,
      value: childEntityId,
    },
  };
}

export function useProposeSubtopicRelation(spaceId: string) {
  const { storage } = useMutate();
  const { makeProposal } = usePublish();
  const { space } = useSpace(spaceId);
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = React.useState(false);

  const invalidateSubtopics = React.useCallback(
    (parentEntityId: string) => {
      void queryClient.invalidateQueries({ queryKey: ['pending-subtopic-proposals', spaceId] });
      void queryClient.invalidateQueries({ queryKey: ['subtopic-children', spaceId, parentEntityId] });
    },
    [queryClient, spaceId]
  );

  const proposeAdd = React.useCallback(
    async ({ parentEntityId, parentName, childEntityId, childName }: ProposeSubtopicAddArgs) => {
      if (!space) return;

      setIsPending(true);

      const relation = buildSubtopicRelation({
        parentEntityId,
        parentName,
        childEntityId,
        childName,
        spaceId,
      });

      storage.relations.set(relation);

      const proposalName = `Add subtopic: ${childName ?? 'Untitled'} to ${parentName ?? 'topic'}`;

      try {
        await makeProposal({
          values: [],
          relations: [relation],
          spaceId,
          name: proposalName,
          onSuccess: () => invalidateSubtopics(parentEntityId),
        });
      } finally {
        setIsPending(false);
      }
    },
    [invalidateSubtopics, makeProposal, space, spaceId, storage.relations]
  );

  const proposeRemove = React.useCallback(
    async ({ parentEntityId, parentName, childEntityId, childName, relationId }: ProposeSubtopicRemoveArgs) => {
      if (!space) return;

      setIsPending(true);

      const relation: Relation = {
        id: relationId,
        entityId: IdUtils.generate(),
        spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        isLocal: true,
        hasBeenPublished: false,
        isDeleted: true,
        type: {
          id: SUBTOPIC_RELATION_TYPE_ID,
          name: 'Subtopics',
        },
        fromEntity: {
          id: parentEntityId,
          name: parentName,
        },
        toEntity: {
          id: childEntityId,
          name: childName,
          value: childEntityId,
        },
      };

      storage.relations.set(relation);

      const proposalName = `Remove subtopic: ${childName ?? 'Untitled'} from ${parentName ?? 'topic'}`;

      try {
        await makeProposal({
          values: [],
          relations: [relation],
          spaceId,
          name: proposalName,
          onSuccess: () => invalidateSubtopics(parentEntityId),
        });
      } finally {
        setIsPending(false);
      }
    },
    [invalidateSubtopics, makeProposal, space, spaceId, storage.relations]
  );

  const assignTopicTypeOnCreate = React.useCallback(
    (entity: { id: string; name: string | null; space?: string; verified?: boolean }) => {
      createTypeRelationForNewEntity(storage, spaceId, entity, {
        id: TOPIC_TYPE_ID,
        name: 'Topic',
      });
    },
    [spaceId, storage]
  );

  return {
    proposeAdd,
    proposeRemove,
    assignTopicTypeOnCreate,
    isPending,
  };
}
