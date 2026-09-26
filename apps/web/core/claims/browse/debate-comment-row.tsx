'use client';

import * as React from 'react';

import cx from 'classnames';

import { ClaimCommentPositionBadge } from '~/core/claims/browse/claim-comment-position';
import { useOpenDebaterProfile } from '~/core/debates/browse/use-open-debater-profile';
import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';
import { NavUtils } from '~/core/utils/utils';

import { PAGE_DENSITY, avatarBottomInRowPx, threadSpineOffsetPx } from '~/partials/comments/comment-density';
import { getRelativeTime } from '~/partials/comments/comment-time';
import { InlineCommentComposer, useInlineComposer } from '~/partials/comments/inline-comment-composer';
import { ThreadAvatar } from '~/partials/comments/thread-avatar';
import { ThreadCollapseToggle, ThreadParentSpine, useThreadParentSpine } from '~/partials/comments/thread-branch';
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

/**
 * Every reply in a subtree, at every depth.
 *
 * Only asked at the depth floor, where the tree is already loaded and none of it is being drawn — so
 * this walks what the comment query returned rather than counting what is on screen. A reply with no
 * `replies` array is one row and nothing under it; the guard is the same one the row itself uses,
 * because an optimistic comment is inserted before that array exists.
 */
function countRepliesDeep(replies: CommentWithReplies[]): number {
  return replies.reduce(
    (total, reply) => total + 1 + countRepliesDeep(Array.isArray(reply.replies) ? reply.replies : []),
    0
  );
}

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
  const [repliesCollapsed, setRepliesCollapsed] = React.useState(false);

  const spine = useThreadParentSpine(avatarBottomInRowPx(PAGE_DENSITY));
  const body = React.useMemo(() => renderMarkdownDocument(comment.markdownContent), [comment.markdownContent]);
  const replies = Array.isArray(comment.replies) ? comment.replies : [];

  // Two different overflows, and they want different offers. Replies we are holding back for length
  // are already loaded, so revealing them is free and happens here. Replies below the depth floor
  // are a different matter: there is no room to draw them, so the reader is sent to the page where
  // this thread is the whole page rather than a branch of one.
  const canNest = canNestBelow(depth);
  const shown = canNest ? replies.slice(0, visibleReplies) : [];
  const hiddenHere = canNest ? replies.length - shown.length : 0;
  // The whole subtree, not this comment's own replies. `ThreadContinue` promises "how many rows are
  // down there", and one reply carrying ten of its own is eleven rows the reader is not being shown —
  // offering that as "Continue this thread (1)" undersells it by an order of magnitude on exactly the
  // threads deep enough to reach the floor in the first place.
  const belowFloor = canNest ? 0 : countRepliesDeep(replies);

  const branchLabel = { expand: 'Show replies', collapse: 'Hide replies' };
  const drawnReplies = repliesCollapsed ? [] : shown;

  return (
    <div ref={spine.rowRef} className="thread-branch-hover-root relative flex min-w-0 gap-3">
      {/* The line from this comment's face down to its replies. Without it the branch below reaches
          an elbow back to a spine that was never drawn. */}
      {drawnReplies.length > 0 && (
        <ThreadParentSpine
          leftPx={PAGE_DENSITY.avatarCenterPx}
          topPx={spine.topPx}
          heightPx={spine.heightPx}
          lit={false}
          label={branchLabel.collapse}
          onToggle={() => setRepliesCollapsed(true)}
        />
      )}
      {/* `Avatar` fills its container whenever it has a real `avatarUrl` — `size` only sizes the
          generated fallback — so the frame is the caller's job, exactly as in the comment rows. */}
      {/* A link, so middle-click and copy-address still reach the person's space, with the click
          itself intercepted to open the profile beside the thread instead of replacing it. */}
      <ThreadAvatar
        href={NavUtils.toSpace(comment.author.spaceId)}
        // The same name the row prints beside it, because a face on its own announces nothing.
        label={comment.author.name ?? 'Anonymous'}
        onClick={openAuthorProfile}
        avatarUrl={comment.author.avatarUrl}
        value={comment.author.address}
        sizePx={PAGE_DENSITY.avatarPx}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <a
            href={NavUtils.toSpace(comment.author.spaceId)}
            onClick={openAuthorProfile}
            className="min-w-0 truncate hover:underline"
          >
            <span className={cx(PAGE_DENSITY.nameClass, 'text-text')}>{comment.author.name ?? 'Anonymous'}</span>
          </a>
          {/*
            Where this person stands on the claim this comment hangs under — the extracted claim when
            there is one, the page's claim otherwise. Same badge, same provider a commenter on the
            claim gets; which claim it reports is decided by whichever provider is nearest, so a
            comment under an extracted claim badges against that claim rather than against something
            several screens up. Renders nothing for someone who holds no position on it.

            Before the row's own tag: the side is a fact about the person whose name it follows.
          */}
          <ClaimCommentPositionBadge authorSpaceId={comment.author.spaceId} />
          <ActivityRowTag kind="comment" />
          <span className={cx(PAGE_DENSITY.metaClass, 'shrink-0 whitespace-nowrap text-grey-04')}>
            {comment.isPublishing ? 'Publishing…' : getRelativeTime(comment.createdAt)}
          </span>
        </div>

        <div
          className={cx('prose prose-sm max-w-none text-text [&_a]:text-ctaPrimary [&_p]:my-1', PAGE_DENSITY.bodyClass)}
        >
          {body}
        </div>

        <div className="relative flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          {shown.length > 0 && (
            <ThreadCollapseToggle
              collapsed={repliesCollapsed}
              leftPx={PAGE_DENSITY.avatarCenterPx - PAGE_DENSITY.bodyInsetPx}
              label={branchLabel}
              onToggle={() => setRepliesCollapsed(collapsed => !collapsed)}
            />
          )}
          <EntityVoteButtons entityId={comment.id} spaceId={comment.spaceId} />
          <button
            type="button"
            aria-expanded={composer.isComposing}
            onClick={composer.toggle}
            className={cx(PAGE_DENSITY.metaClass, 'text-grey-04 transition-colors hover:text-text')}
          >
            Reply
          </button>
          {/* This comment's own page, not the debate's. A Comment is an entity like any other and its
              page renders its own thread, so continuing lands on the branch the reader was reading
              with a fresh depth budget — which is what the control promises. Pointing at the target
              entity reopened the whole parent thread instead, and for a debate that is the video
              page, where the thread is behind a button. Verified on the preview: a comment entity
              page draws `Comments (11)` for a comment with eleven replies. */}
          <ThreadContinue href={NavUtils.toEntity(comment.spaceId, comment.id)} count={belowFloor} />
        </div>

        <InlineCommentComposer
          composer={composer}
          targetEntityId={targetEntityId}
          targetSpaceId={spaceId}
          ancestors={[{ id: comment.id, spaceId: comment.spaceId }, ...ancestors]}
          placeholder={`Reply to ${comment.author.name ?? 'comment'}...`}
        />

        {/*
          Replies come with the comment — they are already in the tree `useComments` built — so
          drawing them costs nothing but space, and the cap below is about legibility rather than
          fetching.
        */}
        {drawnReplies.length > 0 && (
          <div ref={spine.branchRef} className="mt-3">
            <ThreadBranch
              rowDensity={PAGE_DENSITY}
              reachPx={threadSpineOffsetPx(PAGE_DENSITY)}
              onCollapse={() => setRepliesCollapsed(true)}
              label={branchLabel}
            >
              {drawnReplies.map((reply, index) => (
                <ThreadBranchRow key={reply.id} isLast={index === drawnReplies.length - 1}>
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
