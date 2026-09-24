'use client';

import * as React from 'react';

import cx from 'classnames';

import { ClaimCommentPositionBadge } from '~/core/claims/browse/claim-comment-position';
import { useEntityCommentsPanel } from '~/core/hooks/use-entity-comments-panel';
import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';

import { PAGE_DENSITY, threadSpineOffsetPx } from '~/partials/comments/comment-density';
import { ThreadBranch, ThreadBranchRow } from '~/partials/comments/thread-branch-list';
import { getRelativeTime } from '~/partials/comments/comment-time';
import type { CommentWithReplies } from '~/partials/comments/types';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

/**
 * A comment somebody left on a debate, shown in the claim's activity thread.
 *
 * These do not appear in the claim's own comment backlinks — they reply to the debate, not to the
 * claim — so without this the reader saw a debate, the claims it produced, and no sign of the
 * conversation happening on it one click away.
 *
 * Read-only apart from voting. Replying lands in the debate's comment panel, which is where the
 * reply chain for that entity actually lives; threading a composer for a second entity into this
 * one's list would put the reply somewhere the surrounding thread cannot show it.
 */
export function DebateCommentRow({
  comment,
  debateId,
  spaceId,
  depth = 0,
  maxDepth,
}: {
  comment: CommentWithReplies;
  debateId: string;
  spaceId: string;
  /** How far below the branch's first row this one sits. */
  depth?: number;
  /** Rows deeper than this are counted, not drawn — the reader opens the debate for the rest. */
  maxDepth: number;
}) {
  const { openComments } = useEntityCommentsPanel();
  const body = React.useMemo(() => renderMarkdownDocument(comment.markdownContent), [comment.markdownContent]);
  const replies = Array.isArray(comment.replies) ? comment.replies : [];
  const replyCount = replies.length;
  const showsReplies = replies.length > 0 && depth < maxDepth;

  return (
    <div className="flex min-w-0 gap-3">
      {/* `Avatar` fills its container whenever it has a real `avatarUrl` — `size` only sizes the
          generated fallback — so the frame is the caller's job, exactly as in the comment rows. */}
      <a
        href={NavUtils.toSpace(comment.author.spaceId)}
        className="relative shrink-0 overflow-hidden rounded-full"
        style={{ width: PAGE_DENSITY.avatarPx, height: PAGE_DENSITY.avatarPx }}
      >
        <Avatar
          avatarUrl={comment.author.avatarUrl}
          value={comment.author.address}
          size={PAGE_DENSITY.avatarPx}
        />
      </a>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <a href={NavUtils.toSpace(comment.author.spaceId)} className="min-w-0 truncate hover:underline">
            <span className={cx(PAGE_DENSITY.nameClass, 'text-text')}>{comment.author.name ?? 'Anonymous'}</span>
          </a>
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
          className={cx(
            'prose prose-sm max-w-none text-text [&_a]:text-ctaPrimary [&_p]:my-1',
            PAGE_DENSITY.bodyClass
          )}
        >
          {body}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          <EntityVoteButtons entityId={comment.id} spaceId={comment.spaceId} />
          <button
            type="button"
            data-entity-comments-opener
            onClick={() => openComments(debateId, spaceId)}
            className={cx(PAGE_DENSITY.metaClass, 'text-grey-04 transition-colors hover:text-text')}
          >
            Reply
          </button>
          {replyCount > 0 && !showsReplies && (
            <button
              type="button"
              data-entity-comments-opener
              onClick={() => openComments(debateId, spaceId)}
              className={cx(PAGE_DENSITY.metaClass, 'text-ctaPrimary transition-colors hover:text-ctaHover')}
            >
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>

        {/*
          Replies come with the comment — they are already in the tree `useComments` built — so
          drawing them costs nothing beyond the depth budget. Past that budget the count above takes
          over and the debate's own panel is where the rest of the thread lives.
        */}
        {showsReplies && (
          <div className="mt-3">
            <ThreadBranch rowDensity={PAGE_DENSITY} reachPx={threadSpineOffsetPx(PAGE_DENSITY)}>
              {replies.map((reply, index) => (
                <ThreadBranchRow key={reply.id} isLast={index === replies.length - 1}>
                  <DebateCommentRow
                    comment={reply}
                    debateId={debateId}
                    spaceId={spaceId}
                    depth={depth + 1}
                    maxDepth={maxDepth}
                  />
                </ThreadBranchRow>
              ))}
            </ThreadBranch>
          </div>
        )}
      </div>
    </div>
  );
}
