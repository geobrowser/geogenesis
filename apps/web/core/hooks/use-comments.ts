'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import * as React from 'react';

import {
  COMMENT_MARKDOWN_CONTENT_ID,
  COMMENT_REPLY_TO_ID,
  COMMENT_RESOLVED_ID,
} from '~/core/comment-ids';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { uuidToHex } from '~/core/id/normalize';
import { getCommentEntitiesViaParentEntityReplyBacklinks } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import type { Entity } from '~/core/types';

import type { CommentEntity, CommentWithReplies } from '~/partials/comments/types';

/**
 * Parse a fetched Entity into a CommentEntity.
 * The "Reply To" relations determine both the target entity and any parent comment.
 * - A reply-to pointing to a non-comment entity = the target entity
 * - A reply-to pointing to another comment entity = the parent comment
 *
 * A reply may have "Reply To" relations to ALL ancestor comments (cascading).
 * We identify the immediate parent as the ancestor whose target comment has the highest true nesting
 * depth (computed by traversing the parent chain), using the provided depth map (keyed by canonical id).
 */
function parseCommentEntity(
  entity: Entity,
  commentIdKeySet: Set<string>,
  targetEntityId: string,
  depthMap: Map<string, number>
): CommentEntity {
  const markdownContent =
    entity.values.find(v => v.property.id === COMMENT_MARKDOWN_CONTENT_ID)?.value ?? '';

  const resolvedValue = entity.values.find(v => v.property.id === COMMENT_RESOLVED_ID)?.value;
  const resolved = resolvedValue === '1' || resolvedValue === 'true' || resolvedValue === 'True';

  const replyToType = uuidToHex(COMMENT_REPLY_TO_ID);
  const replyToRelations = entity.relations.filter(r => uuidToHex(r.type.id) === replyToType);

  const targetKey = uuidToHex(targetEntityId);

  const replyToCommentRelations = replyToRelations.filter(r => commentIdKeySet.has(uuidToHex(r.toEntity.id)));

  let replyToCommentRelation = replyToCommentRelations[0] ?? null;
  if (replyToCommentRelations.length > 1) {
    replyToCommentRelation = replyToCommentRelations.reduce((best, r) => {
      const depth = depthMap.get(uuidToHex(r.toEntity.id)) ?? 0;
      const bestDepth = depthMap.get(uuidToHex(best.toEntity.id)) ?? 0;
      return depth > bestDepth ? r : best;
    });
  }

  const replyToEntityRelation = replyToRelations.find(r => uuidToHex(r.toEntity.id) === targetKey);

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
    createdAt: entity.createdAt
      ? new Date(Number(entity.createdAt) * 1000).toISOString()
      : entity.updatedAt
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
    commentMap.set(uuidToHex(comment.id), { ...comment, replies: [] });
  }

  for (const comment of comments) {
    const wrapped = commentMap.get(uuidToHex(comment.id))!;
    const parentKey = comment.replyToCommentId ? uuidToHex(comment.replyToCommentId) : null;

    if (parentKey && commentMap.has(parentKey)) {
      commentMap.get(parentKey)!.replies.push(wrapped);
    } else {
      rootComments.push(wrapped);
    }
  }

  // Baseline reply order is oldest-first (thread reading order). The UI applies the active
  // sort and pins session-new comments on top of whatever order is chosen.
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

/**
 * Fetch all comments targeting a given entity from the server, fully parsed into CommentEntity objects.
 * Shared between the useComments queryFn and the post-publish poller in useCreateComment so both paths
 * apply identical parsing/ID-normalization rules.
 */
export async function fetchCommentEntitiesForTarget(
  entityId: string,
  signal?: AbortController['signal']
): Promise<CommentEntity[]> {
  const loaded = await Effect.runPromise(getCommentEntitiesViaParentEntityReplyBacklinks(entityId, signal));
  const targetKey = uuidToHex(entityId);
  const replyToType = uuidToHex(COMMENT_REPLY_TO_ID);

  const allEntities = loaded.filter(entity =>
    entity.relations.some(
      r => uuidToHex(r.type.id) === replyToType && uuidToHex(r.toEntity.id) === targetKey
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

  const allCommentIdKeys = new Set(allEntities.map(e => uuidToHex(e.id)));

  const adjacency = new Map<string, string[]>();
  for (const entity of allEntities) {
    const targets = entity.relations
      .filter(r => uuidToHex(r.type.id) === replyToType && allCommentIdKeys.has(uuidToHex(r.toEntity.id)))
      .map(r => uuidToHex(r.toEntity.id));
    adjacency.set(uuidToHex(entity.id), targets);
  }

  const depthMap = new Map<string, number>();
  function computeDepth(commentKey: string): number {
    if (depthMap.has(commentKey)) return depthMap.get(commentKey)!;
    const targets = adjacency.get(commentKey) ?? [];
    if (targets.length === 0) {
      depthMap.set(commentKey, 0);
      return 0;
    }
    const maxParentDepth = Math.max(...targets.map(t => computeDepth(t)));
    const depth = maxParentDepth + 1;
    depthMap.set(commentKey, depth);
    return depth;
  }
  for (const key of allCommentIdKeys) {
    computeDepth(key);
  }

  return allEntities.map(entity => {
    const comment = parseCommentEntity(entity, allCommentIdKeys, entityId, depthMap);
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
}

/**
 * Merge server-returned comments with any locally-pending comments still in the cache.
 * A pending row is kept only if the server has not yet returned it (matched by canonical id).
 */
export function mergePendingWithServer(
  server: CommentEntity[],
  prev: CommentEntity[] | undefined
): CommentEntity[] {
  if (!prev || prev.length === 0) return server;
  const serverIds = new Set(server.map(c => uuidToHex(c.id)));
  const pendingOnly = prev.filter(c => c.isPendingPublish === true && !serverIds.has(uuidToHex(c.id)));
  return pendingOnly.length > 0 ? [...server, ...pendingOnly] : server;
}

export function useComments({ entityId }: UseCommentsOptions) {
  const queryClient = useQueryClient();

  const {
    data: rawComments,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['comments', entityId],
    queryFn: async () => {
      const server = await fetchCommentEntitiesForTarget(entityId);
      const prev = queryClient.getQueryData<CommentEntity[]>(['comments', entityId]);
      return mergePendingWithServer(server, prev);
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
