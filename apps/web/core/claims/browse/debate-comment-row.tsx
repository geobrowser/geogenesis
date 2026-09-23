'use client';

import * as React from 'react';

import cx from 'classnames';

import { useEntityCommentsPanel } from '~/core/hooks/use-entity-comments-panel';
import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';

import { PAGE_DENSITY } from '~/partials/comments/comment-density';
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
}: {
  comment: CommentWithReplies;
  debateId: string;
  spaceId: string;
}) {
  const { openComments } = useEntityCommentsPanel();
  const body = React.useMemo(() => renderMarkdownDocument(comment.markdownContent), [comment.markdownContent]);
  const replyCount = comment.replies.length;

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
          {replyCount > 0 && (
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
      </div>
    </div>
  );
}
