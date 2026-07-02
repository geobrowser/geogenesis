'use client';

import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { SUBTOPIC_RELATION_TYPE_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { usePublish } from '~/core/hooks/use-publish';
import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import type { SubtopicChild } from '~/core/io/subgraph/fetch-subtopic-children';
import { PLACEHOLDER_TOPIC_NAME } from '~/core/io/subgraph/topic-space-usage';
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

  // Personal spaces publish edits directly (no governance vote), so the change
  // never appears in the pending-proposals list. Optimistically patch the tree's
  // children cache so the edit is reflected immediately instead of waiting for a
  // subgraph reindex. DAO spaces create real proposals, which surface separately.
  const isPersonalSpace = space?.type === 'PERSONAL';

  const invalidateSubtopics = React.useCallback(
    (parentEntityId: string) => {
      void queryClient.invalidateQueries({ queryKey: ['pending-subtopic-proposals', spaceId] });
      void queryClient.invalidateQueries({ queryKey: ['subtopic-children', spaceId, parentEntityId] });
    },
    [queryClient, spaceId]
  );

  const optimisticallyAddChild = React.useCallback(
    (parentEntityId: string, child: SubtopicChild): (() => void) => {
      if (!isPersonalSpace) return () => {};

      const key = ['subtopic-children', spaceId, parentEntityId];
      const previous = queryClient.getQueryData<SubtopicChild[]>(key);

      queryClient.setQueryData<SubtopicChild[]>(key, current => {
        const list = current ?? [];
        if (list.some(existing => existing.id === child.id)) return list;
        return [...list, child].sort((a, b) => a.name.localeCompare(b.name));
      });

      return () => queryClient.setQueryData<SubtopicChild[]>(key, previous);
    },
    [isPersonalSpace, queryClient, spaceId]
  );

  const optimisticallyRemoveChild = React.useCallback(
    (parentEntityId: string, childEntityId: string): (() => void) => {
      if (!isPersonalSpace) return () => {};

      const key = ['subtopic-children', spaceId, parentEntityId];
      const previous = queryClient.getQueryData<SubtopicChild[]>(key);

      queryClient.setQueryData<SubtopicChild[]>(key, current =>
        (current ?? []).filter(existing => existing.id !== childEntityId)
      );

      return () => queryClient.setQueryData<SubtopicChild[]>(key, previous);
    },
    [isPersonalSpace, queryClient, spaceId]
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

      const rollback = optimisticallyAddChild(parentEntityId, {
        id: childEntityId,
        name: childName?.trim() || PLACEHOLDER_TOPIC_NAME,
        relationId: relation.id,
      });

      const proposalName = `Add subtopic: ${childName ?? 'Untitled'} to ${parentName ?? 'topic'}`;

      try {
        await makeProposal({
          values: [],
          relations: [relation],
          spaceId,
          name: proposalName,
          onSuccess: () => invalidateSubtopics(parentEntityId),
        });
      } catch (error) {
        rollback();
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [invalidateSubtopics, makeProposal, optimisticallyAddChild, space, spaceId, storage.relations]
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

      const rollback = optimisticallyRemoveChild(parentEntityId, childEntityId);

      const proposalName = `Remove subtopic: ${childName ?? 'Untitled'} from ${parentName ?? 'topic'}`;

      try {
        await makeProposal({
          values: [],
          relations: [relation],
          spaceId,
          name: proposalName,
          onSuccess: () => invalidateSubtopics(parentEntityId),
        });
      } catch (error) {
        rollback();
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [invalidateSubtopics, makeProposal, optimisticallyRemoveChild, space, spaceId, storage.relations]
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

      const rollback = optimisticallyAddChild(parentEntityId, {
        id: childEntityId,
        name: childName,
        relationId: subtopicRelation.id,
      });

      const proposalName = `Add subtopic: ${childName} to ${parentName ?? 'topic'}`;

      try {
        await makeProposal({
          values: [nameValue],
          relations: [typeRelation, subtopicRelation],
          spaceId,
          name: proposalName,
          onSuccess: () => invalidateSubtopics(parentEntityId),
        });
      } catch (error) {
        rollback();
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [invalidateSubtopics, makeProposal, optimisticallyAddChild, space, spaceId, storage]
  );

  return {
    proposeAdd,
    proposeRemove,
    proposeCreateAndAdd,
    isPending,
    isPersonalSpace,
  };
}
