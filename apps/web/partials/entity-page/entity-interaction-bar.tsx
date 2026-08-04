'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';

import { useIsClaimEntity } from '~/core/claims/use-is-claim-entity';
import { ClaimDebateButton } from '~/core/debates/claim-debate-button';
import { getEntityCommentCount } from '~/core/io/queries';
import { NavUtils } from '~/core/utils/utils';

import { CommentsIcon } from '~/design-system/icons/comments';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { EntityVoteButtons } from './entity-vote-buttons';

type EntityInteractionBarProps = {
  entityId: string;
  spaceId: string;
  commentCount?: number;
  className?: string;
};

/**
 * The row of interactions shown directly beneath a **Claim** in ranking blocks and
 * data blocks, in order: votes, the voters who ranked it, comments, and — with the
 * debates flag on — the debate megaphone.
 */
export function EntityInteractionBar({ entityId, spaceId, commentCount, className }: EntityInteractionBarProps) {
  const isClaim = useIsClaimEntity(entityId, spaceId);
  const { data: fetchedCommentCount = 0 } = useQuery({
    queryKey: ['entity-comment-count', entityId],
    queryFn: ({ signal }) => Effect.runPromise(getEntityCommentCount(entityId, signal)),
    staleTime: 60_000,
    enabled: commentCount === undefined,
  });

  const count = commentCount ?? fetchedCommentCount;

  if (!isClaim) return null;

  return (
    <div
      className={cx('flex items-center gap-6', className)}
      data-entity-interaction-bar
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onTouchStart={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <EntityVoteButtons entityId={entityId} spaceId={spaceId} claimVoterAvatarsPosition="trailing" />
      <Link
        href={`${NavUtils.toEntity(spaceId, entityId)}#entity-comments`}
        className="inline-flex h-5 items-center gap-1.5 text-grey-04 transition-colors hover:text-text"
        title="Comments"
      >
        <CommentsIcon />
        <span className="text-[14px] leading-5 font-normal tabular-nums">{count}</span>
      </Link>
      <ClaimDebateButton entityId={entityId} spaceId={spaceId} variant="icon" />
    </div>
  );
}
