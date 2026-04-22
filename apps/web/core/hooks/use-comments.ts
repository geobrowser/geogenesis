'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import * as React from 'react';

import {
  COMMENT_MARKDOWN_CONTENT_ID,
  COMMENT_REPLY_TO_ID,
  COMMENT_RESOLVED_ID,
} from '~/core/comment-ids';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getCommentEntitiesViaParentEntityReplyBacklinks } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import type { Entity } from '~/core/types';

import type { CommentEntity, CommentWithReplies } from '~/partials/comments/types';

function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

/**
 * Parse a fetched Entity into a CommentEntity.
 * The "Reply To" relations determine both the target entity and any parent comment.
 * - A reply-to pointing to a non-comment entity = the target entity
 * - A reply-to pointing to another comment entity = the parent comment
 *
 * A reply may have "Reply To" relations to ALL ancestor comments (cascading).
 * We identify the immediate parent as the ancestor whose target comment has the highest true nesting
 * depth (computed by traversing the parent chain), using the provided depth map.
 */
function parseCommentEntity(
  entity: Entity,
  commentIds: Set<string>,
  targetEntityId: string,
  depthMap: Map<string, number>
): CommentEntity {
  const markdownContent =
    entity.values.find(v => v.property.id === COMMENT_MARKDOWN_CONTENT_ID)?.value ?? '';

  const resolvedValue = entity.values.find(v => v.property.id === COMMENT_RESOLVED_ID)?.value;
  const resolved = resolvedValue === '1' || resolvedValue === 'true' || resolvedValue === 'True';

  const replyToType = normId(COMMENT_REPLY_TO_ID);
  const replyToRelations = entity.relations.filter(r => normId(r.type.id) === replyToType);

  const targetKey = normId(targetEntityId);
  const commentIdKeySet = new Set([...commentIds].map(normId));

  const replyToCommentRelations = replyToRelations.filter(r => commentIdKeySet.has(normId(r.toEntity.id)));

  let replyToCommentRelation = replyToCommentRelations[0] ?? null;
  if (replyToCommentRelations.length > 1) {
    replyToCommentRelation = replyToCommentRelations.reduce((best, r) => {
      const depth = depthMap.get(r.toEntity.id) ?? 0;
      const bestDepth = depthMap.get(best.toEntity.id) ?? 0;
      return depth > bestDepth ? r : best;
    });
  }

  const replyToEntityRelation = replyToRelations.find(r => normId(r.toEntity.id) === targetKey);

  const spaceId = entity.spaces[0] ?? '';

  return {
    id: entity.id,
    name: entity.name,
    markdownContent,
    targetEntityId,
    targetSpaceId: replyToEntityRelation?.toSpaceId ?? '',
    replyToCommentId: replyToCommentRelation?.toEntity.id ?? null,
    replyToCommentSpaceId: replyToCommentRelation?.toSpaceId ?? null,
    author: {
      spaceId,
      address: spaceId,
      name: null,
      avatarUrl: null,
    },
    createdAt: entity.updatedAt
      ? new Date(Number(entity.updatedAt) * 1000).toISOString()
      : new Date().toISOString(),
    spaceId,
    resolved,
  };
}

function buildCommentTree(comments: CommentEntity[]): CommentWithReplies[] {
  const commentMap = new Map<string, CommentWithReplies>();
  const rootComments: CommentWithReplies[] = [];

  for (const comment of comments) {
    commentMap.set(comment.id, { ...comment, replies: [] });
  }

  for (const comment of comments) {
    const wrapped = commentMap.get(comment.id)!;

    if (comment.replyToCommentId && commentMap.has(comment.replyToCommentId)) {
      commentMap.get(comment.replyToCommentId)!.replies.push(wrapped);
    } else {
      rootComments.push(wrapped);
    }
  }

  const sortReplies = (items: CommentWithReplies[]) => {
    for (const item of items) {
      item.replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      sortReplies(item.replies);
    }
  };
  sortReplies(rootComments);

  return rootComments;
}

interface UseCommentsOptions {
  entityId: string;
  spaceId: string;
}

export function useComments({ entityId }: UseCommentsOptions) {
  const {
    data: rawComments,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['comments', entityId],
    queryFn: async () => {
      const loaded = await Effect.runPromise(getCommentEntitiesViaParentEntityReplyBacklinks(entityId));
      const targetKey = normId(entityId);
      const replyToType = normId(COMMENT_REPLY_TO_ID);

      const allEntities = loaded.filter(entity =>
        entity.relations.some(
          r => normId(r.type.id) === replyToType && normId(r.toEntity.id) === targetKey
        )
      );

      const uniqueSpaceIds = [...new Set(allEntities.map(e => e.spaces[0]).filter(Boolean))];
      const profileMap = new Map<string, { address: string; name: string | null; avatarUrl: string | null }>();

      if (uniqueSpaceIds.length > 0) {
        const profiles = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueSpaceIds));
        for (const profile of profiles) {
          const avatarUrl =
            profile.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;
          profileMap.set(profile.spaceId, {
            address: profile.address,
            name: profile.name,
            avatarUrl,
          });
        }
      }

      const allCommentIds = new Set(allEntities.map(e => e.id));
      const allCommentIdKeys = new Set([...allCommentIds].map(normId));

      const adjacency = new Map<string, string[]>();
      for (const entity of allEntities) {
        const targets = entity.relations
          .filter(r => normId(r.type.id) === replyToType && allCommentIdKeys.has(normId(r.toEntity.id)))
          .map(r => r.toEntity.id);
        adjacency.set(entity.id, targets);
      }

      const depthMap = new Map<string, number>();
      function computeDepth(commentId: string): number {
        if (depthMap.has(commentId)) return depthMap.get(commentId)!;
        const targets = adjacency.get(commentId) ?? [];
        if (targets.length === 0) {
          depthMap.set(commentId, 0);
          return 0;
        }
        const maxParentDepth = Math.max(...targets.map(t => computeDepth(t)));
        const depth = maxParentDepth + 1;
        depthMap.set(commentId, depth);
        return depth;
      }
      for (const id of allCommentIds) {
        computeDepth(id);
      }

      const comments = allEntities.map(entity => {
        const comment = parseCommentEntity(entity, allCommentIds, entityId, depthMap);
        const profileInfo = profileMap.get(comment.spaceId);
        if (profileInfo) {
          comment.author = {
            spaceId: comment.spaceId,
            address: profileInfo.address,
            name: profileInfo.name,
            avatarUrl: profileInfo.avatarUrl,
          };
        }
        return comment;
      });

      return comments;
    },
    enabled: !!entityId,
  });

  const comments = React.useMemo(() => {
    if (!rawComments) return [];
    return buildCommentTree(rawComments);
  }, [rawComments]);

  const totalCount = React.useMemo(() => {
    return rawComments?.length ?? 0;
  }, [rawComments]);

  return {
    comments,
    totalCount,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
