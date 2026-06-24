'use client';

import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { SUBTOPIC_RELATION_TYPE_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { usePublish } from '~/core/hooks/use-publish';
import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { useMutate } from '~/core/sync/use-mutate';
import type { Relation, Value } from '~/core/types';

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

  const proposeCreateAndAdd = React.useCallback(
    async ({
      parentEntityId,
      parentName,
      name,
    }: {
      parentEntityId: string;
      parentName: string | null;
      name: string;
    }) => {
      if (!space) return;

      const childName = name.trim();
      if (!childName) return;

      setIsPending(true);

      const childEntityId = ID.createEntityId();

      // Name value for the new entity.
      const nameValue: Value = {
        id: ID.createValueId({ entityId: childEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId }),
        entity: { id: childEntityId, name: childName },
        property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT', renderableType: 'TEXT' },
        spaceId,
        value: childName,
        isLocal: true,
        hasBeenPublished: false,
        isDeleted: false,
      };

      // Types relation marking the new entity as a Topic.
      const typeRelation: Relation = {
        id: IdUtils.generate(),
        entityId: IdUtils.generate(),
        spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        isLocal: true,
        hasBeenPublished: false,
        isDeleted: false,
        type: {
          id: SystemIds.TYPES_PROPERTY,
          name: 'Types',
        },
        fromEntity: {
          id: childEntityId,
          name: childName,
        },
        toEntity: {
          id: TOPIC_TYPE_ID,
          name: 'Topic',
          value: TOPIC_TYPE_ID,
        },
      };

      // Subtopic relation linking the parent to the new entity.
      const subtopicRelation = buildSubtopicRelation({
        parentEntityId,
        parentName,
        childEntityId,
        childName,
        spaceId,
      });

      storage.values.set(nameValue);
      storage.relations.set(typeRelation);
      storage.relations.set(subtopicRelation);

      const proposalName = `Add subtopic: ${childName} to ${parentName ?? 'topic'}`;

      try {
        await makeProposal({
          values: [nameValue],
          relations: [typeRelation, subtopicRelation],
          spaceId,
          name: proposalName,
          onSuccess: () => invalidateSubtopics(parentEntityId),
        });
      } finally {
        setIsPending(false);
      }
    },
    [invalidateSubtopics, makeProposal, space, spaceId, storage]
  );

  return {
    proposeAdd,
    proposeRemove,
    proposeCreateAndAdd,
    isPending,
  };
}
