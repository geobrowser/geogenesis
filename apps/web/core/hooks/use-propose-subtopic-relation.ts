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

// Insert a child into a cached list, keeping it deduped and name-sorted to match
// the ordering fetchSubtopicChildren returns.
function addChild(list: SubtopicChild[], child: SubtopicChild): SubtopicChild[] {
  if (list.some(existing => existing.id === child.id)) return list;
  return [...list, child].sort((a, b) => a.name.localeCompare(b.name));
}

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
      // For personal spaces the child list was updated optimistically; refetching
      // now would clobber it with not-yet-indexed subgraph data. It reconciles on
      // the next natural refetch. DAO edits are proposals, so children are unchanged.
      if (!isPersonalSpace) {
        void queryClient.invalidateQueries({ queryKey: ['subtopic-children', spaceId, parentEntityId] });
      }
    },
    [isPersonalSpace, queryClient, spaceId]
  );

  // Optimistically patch a parent's cached child list (personal spaces only) and
  // return a rollback that restores the previous value if the edit fails.
  const patchChildrenCache = React.useCallback(
    (parentEntityId: string, update: (current: SubtopicChild[]) => SubtopicChild[]): (() => void) => {
      if (!isPersonalSpace) return () => {};

      const key = ['subtopic-children', spaceId, parentEntityId];
      const previous = queryClient.getQueryData<SubtopicChild[]>(key);

      queryClient.setQueryData<SubtopicChild[]>(key, current => update(current ?? []));

      return () => {
        if (previous === undefined) {
          // setQueryData(key, undefined) is a no-op, so drop the entry we created.
          queryClient.removeQueries({ queryKey: key });
        } else {
          queryClient.setQueryData<SubtopicChild[]>(key, previous);
        }
      };
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

      const rollback = patchChildrenCache(parentEntityId, list =>
        addChild(list, {
          id: childEntityId,
          name: childName?.trim() || PLACEHOLDER_TOPIC_NAME,
          relationId: relation.id,
        })
      );

      const proposalName = `Add subtopic: ${childName ?? 'Untitled'} to ${parentName ?? 'topic'}`;

      try {
        // makeProposal reports failures via onError (and the status bar) instead of throwing.
        await makeProposal({
          values: [],
          relations: [relation],
          spaceId,
          name: proposalName,
          onSuccess: () => invalidateSubtopics(parentEntityId),
          onError: rollback,
        });
      } finally {
        setIsPending(false);
      }
    },
    [invalidateSubtopics, makeProposal, patchChildrenCache, space, spaceId, storage.relations]
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

      const rollback = patchChildrenCache(parentEntityId, list => list.filter(child => child.id !== childEntityId));

      const proposalName = `Remove subtopic: ${childName ?? 'Untitled'} from ${parentName ?? 'topic'}`;

      try {
        await makeProposal({
          values: [],
          relations: [relation],
          spaceId,
          name: proposalName,
          onSuccess: () => invalidateSubtopics(parentEntityId),
          onError: rollback,
        });
      } finally {
        setIsPending(false);
      }
    },
    [invalidateSubtopics, makeProposal, patchChildrenCache, space, spaceId, storage.relations]
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

      const rollback = patchChildrenCache(parentEntityId, list =>
        addChild(list, { id: childEntityId, name: childName, relationId: subtopicRelation.id })
      );

      const proposalName = `Add subtopic: ${childName} to ${parentName ?? 'topic'}`;

      try {
        await makeProposal({
          values: [nameValue],
          relations: [typeRelation, subtopicRelation],
          spaceId,
          name: proposalName,
          onSuccess: () => invalidateSubtopics(parentEntityId),
          onError: rollback,
        });
      } finally {
        setIsPending(false);
      }
    },
    [invalidateSubtopics, makeProposal, patchChildrenCache, space, spaceId, storage]
  );

  return {
    proposeAdd,
    proposeRemove,
    proposeCreateAndAdd,
    isPending,
    isPersonalSpace,
  };
}
