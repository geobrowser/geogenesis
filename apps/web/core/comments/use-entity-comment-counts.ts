'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { COMMENT_REPLY_TO_ID } from '~/core/comment-ids';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

/**
 * How many comments each of a set of entities has, in one request.
 *
 * The aggregate the explore cards already use for their comment pill — incoming `Reply to`
 * backlinks, counted by the server — asked for many entities at once rather than one card at a
 * time. A feed that shows a comment count beside a row it does not own needs exactly this: a
 * number, not the comments.
 *
 * The alternative is what this replaces. `EntityCommentsButton` seeds itself from a count its host
 * supplies and only ever corrects that seed *downward* from a list someone has actually opened
 * (see `useCommentCount`) — so a host with no count to give passes zero, and the button reads "0"
 * on an entity with comments until the reader opens the panel and finds them. That is a number
 * being wrong in the one direction that tells the reader not to look.
 *
 * `getEntityCommentCount` (GEO-3030) is the single-entity sibling of this, and the two are not
 * duplicates: that one answers for one entity over `entitiesConnection` and is what a page with a
 * single count wants; this one answers for a whole screen of rows in one round trip, which is the
 * only reason the activity feed can put a count on every debate it draws. They count the same
 * thing from opposite ends — Comment entities replying to the target, versus `Reply to` relations
 * arriving at it — so if one ever changes what it counts, change both.
 */
const ENTITY_COMMENT_COUNTS_SOURCE = /* GraphQL */ `
  query EntityCommentCounts($ids: [UUID!], $replyToTypeId: UUID!) {
    entities(filter: { id: { in: $ids } }) {
      id
      backlinks(filter: { typeId: { is: $replyToTypeId } }) {
        totalCount
      }
    }
  }
`;

const entityCommentCountsDocument = parse(ENTITY_COMMENT_COUNTS_SOURCE) as TypedDocumentNode<any, any>;

type CountsResponse = {
  entities?: Array<{ id?: string | null; backlinks?: { totalCount?: number | null } | null } | null> | null;
};

const NO_COUNTS = new Map<string, number>();

export function decodeEntityCommentCounts(data: CountsResponse): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entity of data.entities ?? []) {
    if (!entity?.id) continue;
    counts.set(uuidToHex(entity.id), entity.backlinks?.totalCount ?? 0);
  }
  return counts;
}

export const entityCommentCountsQueryKey = (ids: string[]) => ['entity-comment-counts', ids] as const;

/**
 * Comment counts keyed by canonical entity id. Absent means "not answered yet", not "none" —
 * callers should hold the button's own live count rather than rendering a zero they invented.
 */
export function useEntityCommentCounts(entityIds: string[], enabled = true): Map<string, number> {
  // Sorted and deduped so the same set of rows in a different order is the same query.
  const ids = React.useMemo(
    () => [...new Set(entityIds.filter(Boolean).map(uuidToHex))].sort(),
    [entityIds]
  );

  const { data } = useQuery({
    queryKey: entityCommentCountsQueryKey(ids),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: entityCommentCountsDocument,
          decoder: decodeEntityCommentCounts,
          variables: { ids, replyToTypeId: COMMENT_REPLY_TO_ID },
          signal,
        })
      ),
    enabled: enabled && ids.length > 0,
    staleTime: 60_000,
  });

  return data ?? NO_COUNTS;
}
