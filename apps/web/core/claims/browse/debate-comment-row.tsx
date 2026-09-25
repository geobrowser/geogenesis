'use client';

import * as React from 'react';

import cx from 'classnames';

import { ClaimCommentPositionBadge } from '~/core/claims/browse/claim-comment-position';
import { useOpenDebaterProfile } from '~/core/debates/browse/use-open-debater-profile';
import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';

import { PAGE_DENSITY, threadSpineOffsetPx } from '~/partials/comments/comment-density';
import { getRelativeTime } from '~/partials/comments/comment-time';
import { InlineCommentComposer, useInlineComposer } from '~/partials/comments/inline-comment-composer';
import { ThreadBranch, ThreadBranchRow } from '~/partials/comments/thread-branch-list';
import { ThreadContinue, ThreadShowMore } from '~/partials/comments/thread-overflow';
import type { CommentWithReplies } from '~/partials/comments/types';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ActivityRowTag } from './activity-row-tag';
import { canNestBelow } from './claim-activity-depth';

/**
 * A comment somebody left on a debate, shown in the claim's activity thread.
 *
 * These do not appear in the claim's own comment backlinks — they reply to the debate, not to the
 * claim — so without this the reader saw a debate, the claims it produced, and no sign of the
 * conversation happening on it one click away.
 *
 * Replying happens here rather than in the debate's comment panel. The reply still lands on that
 * other entity — a reply to a comment on a debate is a comment on the debate — but the panel used to
 * take the whole thread away to collect it, so the reader lost the claim, the debate and the badge
 * they were replying to at the moment they wanted to answer them.
 */
/** Replies drawn before the rest are offered in place. Beyond this a thread stops being scannable. */
const REPLY_PAGE_SIZE = 3;

/** Stable identity for a row directly under the entity, so the default doesn't rebuild each render. */
const NO_ANCESTORS: Array<{ id: string; spaceId: string }> = [];

export function DebateCommentRow({
  comment,
  targetEntityId,
  spaceId,
  depth,
  ancestors = NO_ANCESTORS,
}: {
  comment: CommentWithReplies;
  /** The entity this comment replies to — the debate, or the extracted claim. */
  targetEntityId: string;
  spaceId: string;
  /** Counted from the claim, not from this branch. See `claim-activity-depth.ts`. */
  depth: number;
  /**
   * The comments between this one and the entity, nearest first.
   *
   * A reply carries `Reply to` to every ancestor, so this is not decoration: an incomplete chain
   * writes a reply that the counts and the collapse tree cannot see.
   */
  ancestors?: Array<{ id: string; spaceId: string }>;
}) {
  const composer = useInlineComposer();
  const openAuthorProfile = useOpenDebaterProfile(comment.author.spaceId, { interactionSurface: 'comment_author' });
  const [visibleReplies, setVisibleReplies] = React.useState(REPLY_PAGE_SIZE);
  const body = React.useMemo(() => renderMarkdownDocument(comment.markdownContent), [comment.markdownContent]);
  const replies = Array.isArray(comment.replies) ? comment.replies : [];

  // Two different overflows, and they want different offers. Replies we are holding back for length
  // are already loaded, so revealing them is free and happens here. Replies below the depth floor
  // are a different matter: there is no room to draw them, so the reader is sent to the page where
  // this thread is the whole page rather than a branch of one.
  const canNest = canNestBelow(depth);
  const shown = canNest ? replies.slice(0, visibleReplies) : [];
  const hiddenHere = canNest ? replies.length - shown.length : 0;
  const belowFloor = canNest ? 0 : replies.length;

  return (
    <div className="flex min-w-0 gap-3">
      {/* `Avatar` fills its container whenever it has a real `avatarUrl` — `size` only sizes the
          generated fallback — so the frame is the caller's job, exactly as in the comment rows. */}
      {/* A link, so middle-click and copy-address still reach the person's space, with the click
          itself intercepted to open the profile beside the thread instead of replacing it. */}
      <a
        href={NavUtils.toSpace(comment.author.spaceId)}
        onClick={openAuthorProfile}
        className="relative shrink-0 overflow-hidden rounded-full"
        style={{ width: PAGE_DENSITY.avatarPx, height: PAGE_DENSITY.avatarPx }}
      >
        <Avatar avatarUrl={comment.author.avatarUrl} value={comment.author.address} size={PAGE_DENSITY.avatarPx} />
      </a>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <a
            href={NavUtils.toSpace(comment.author.spaceId)}
            onClick={openAuthorProfile}
            className="min-w-0 truncate hover:underline"
          >
            <span className={cx(PAGE_DENSITY.nameClass, 'text-text')}>{comment.author.name ?? 'Anonymous'}</span>
          </a>
          <ActivityRowTag kind="comment" />
          {/*
            Where this person stands on the *claim*, not on the debate — the same badge, from the
            same provider, that a commenter on the claim gets. Someone who argues under a debate and
            holds a position on the claim it argued is the same person making the same commitment,
            and the thread should say so in one place rather than only where the comment happened to
            be filed. Renders nothing for a commenter who holds no position.
          */}
          <ClaimCommentPositionBadge authorSpaceId={comment.author.spaceId} />
          <span className={cx(PAGE_DENSITY.metaClass, 'shrink-0 whitespace-nowrap text-grey-04')}>
            {comment.isPublishing ? 'Publishing…' : getRelativeTime(comment.createdAt)}
          </span>
        </div>

        <div
          className={cx('prose prose-sm max-w-none text-text [&_a]:text-ctaPrimary [&_p]:my-1', PAGE_DENSITY.bodyClass)}
        >
          {body}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          <EntityVoteButtons entityId={comment.id} spaceId={comment.spaceId} />
          <button
            type="button"
            aria-expanded={composer.isComposing}
            onClick={composer.toggle}
            className={cx(PAGE_DENSITY.metaClass, 'text-grey-04 transition-colors hover:text-text')}
          >
            Reply
          </button>
          <ThreadContinue href={NavUtils.toEntity(spaceId, targetEntityId)} count={belowFloor} />
        </div>

        {composer.isComposing && (
          <div className="mt-2">
            <InlineCommentComposer
              targetEntityId={targetEntityId}
              targetSpaceId={spaceId}
              ancestors={[{ id: comment.id, spaceId: comment.spaceId }, ...ancestors]}
              placeholder={`Reply to ${comment.author.name ?? 'comment'}...`}
              onCancel={composer.close}
              onPosted={composer.markPosted}
            />
          </div>
        )}

        {/*
          Replies come with the comment — they are already in the tree `useComments` built — so
          drawing them costs nothing but space, and the cap below is about legibility rather than
          fetching.
        */}
        {shown.length > 0 && (
          <div className="mt-3">
            <ThreadBranch rowDensity={PAGE_DENSITY} reachPx={threadSpineOffsetPx(PAGE_DENSITY)}>
              {shown.map((reply, index) => (
                <ThreadBranchRow key={reply.id} isLast={index === shown.length - 1}>
                  <DebateCommentRow
                    comment={reply}
                    targetEntityId={targetEntityId}
                    spaceId={spaceId}
                    depth={depth + 1}
                    ancestors={[{ id: comment.id, spaceId: comment.spaceId }, ...ancestors]}
                  />
                </ThreadBranchRow>
              ))}
              {hiddenHere > 0 && (
                <ThreadShowMore
                  count={hiddenHere}
                  noun="reply"
                  onShowMore={() => setVisibleReplies(count => count + REPLY_PAGE_SIZE)}
                />
              )}
            </ThreadBranch>
          </div>
        )}
      </div>
    </div>
  );
}
