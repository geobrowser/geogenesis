'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import * as React from 'react';

import {
  COMMENT_MARKDOWN_CONTENT_ID,
  COMMENT_REPLY_TO_ID,
  COMMENT_RESOLVED_ID,
  COMMENT_TYPE_ID,
} from '~/core/comment-ids';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getAllEntities } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import type { Entity } from '~/core/types';

import type { CommentEntity, CommentWithReplies } from '~/partials/comments/types';

/**
 * Parse a fetched Entity into a CommentEntity.
 * The "Reply To" relations determine both the target entity and any parent comment.
 * - A reply-to pointing to a non-comment entity = the target entity
 * - A reply-to pointing to another comment entity = the parent comment
 *
 * We resolve which is which by checking against the set of all fetched comment IDs.
 */
function parseCommentEntity(entity: Entity, commentIds: Set<string>, targetEntityId: string): CommentEntity {
  const markdownContent =
    entity.values.find(v => v.property.id === COMMENT_MARKDOWN_CONTENT_ID)?.value ?? '';

  const resolvedValue = entity.values.find(v => v.property.id === COMMENT_RESOLVED_ID)?.value;
  const resolved = resolvedValue === 'true' || resolvedValue === 'True';

  // Parse Reply To relations
  const replyToRelations = entity.relations.filter(r => r.type.id === COMMENT_REPLY_TO_ID);

  // Find the reply-to-comment relation (points to another comment)
  const replyToCommentRelation = replyToRelations.find(r => commentIds.has(r.toEntity.id));
  // Find the reply-to-entity relation (points to the target entity)
  const replyToEntityRelation = replyToRelations.find(r => r.toEntity.id === targetEntityId);

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
      address: spaceId, // default; overwritten with wallet address after profile fetch
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

  // First pass: wrap all comments
  for (const comment of comments) {
    commentMap.set(comment.id, { ...comment, replies: [] });
  }

  // Second pass: build tree
  for (const comment of comments) {
    const wrapped = commentMap.get(comment.id)!;

    if (comment.replyToCommentId && commentMap.has(comment.replyToCommentId)) {
      commentMap.get(comment.replyToCommentId)!.replies.push(wrapped);
    } else {
      rootComments.push(wrapped);
    }
  }

  // Sort replies chronologically (oldest first)
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
      // Fetch all Comment-type entities that have a Reply To relation pointing to this entity
      const entities = await Effect.runPromise(
        getAllEntities({
          typeIds: { in: [COMMENT_TYPE_ID] },
          filter: {
            relations: {
              some: {
                toEntityId: { is: entityId },
                typeId: { is: COMMENT_REPLY_TO_ID },
              },
            },
          },
          limit: 1000,
        })
      );

      // Also fetch replies to those comments (comments whose Reply To points to a fetched comment)
      const commentIds = entities.map(e => e.id);
      const allEntities = [...entities];

      if (commentIds.length > 0) {
        const replies = await Effect.runPromise(
          getAllEntities({
            typeIds: { in: [COMMENT_TYPE_ID] },
            filter: {
              relations: {
                some: {
                  toEntityId: { in: commentIds },
                  typeId: { is: COMMENT_REPLY_TO_ID },
                },
              },
            },
            limit: 1000,
          })
        );

        // Dedupe
        const existingIds = new Set(commentIds);
        for (const reply of replies) {
          if (!existingIds.has(reply.id)) {
            allEntities.push(reply);
            existingIds.add(reply.id);
          }
        }
      }

      // Resolve author info via profile API (returns wallet address for avatar seed)
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

      // Parse into CommentEntity
      const allCommentIds = new Set(allEntities.map(e => e.id));
      const comments = allEntities.map(entity => {
        const comment = parseCommentEntity(entity, allCommentIds, entityId);
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
