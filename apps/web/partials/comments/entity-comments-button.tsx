'use client';

import * as React from 'react';

import { useCommentCount } from '~/core/hooks/use-comment-count';
import { useEntityCommentsPanel } from '~/core/hooks/use-entity-comments-panel';

import { ExploreCommentsIcon } from '~/partials/explore/explore-comments-icon';

/**
 * Comment count + icon that opens the entity's comments in the global panel.
 *
 * For every surface that shows an entity it doesn't *own* — explore cards, feed
 * rows, data-block rows — the reader should get the comments beside what
 * they're reading. Only an entity's own full page renders comments inline
 * instead. Rendered as a button rather than a link so nested row links (the
 * card title, the row itself) don't swallow the click.
 *
 * `onActivate` is for the surface that is *already* showing the thread. The claim page's activity
 * feed draws a debate's comments under the debate, so sending the reader to the panel there swaps a
 * thread they can see for a flat list of the same rows, minus the context. Those rows pass a
 * handler and open a composer in place instead. Everywhere else is unchanged.
 */
export function EntityCommentsButton({
  entityId,
  spaceId,
  targetEntityType = 'entity',
  count,
  className,
  onActivate,
  isActive,
  commentsInCount,
}: {
  entityId: string;
  spaceId: string;
  targetEntityType?: string;
  /** A server-rendered count; the live one takes over as soon as the list has been read. */
  count: number;
  className?: string;
  /** Replaces opening the global panel. The caller is then responsible for showing something. */
  onActivate?: () => void;
  /** What the button reports as expanded when the caller owns the disclosure. */
  isActive?: boolean;
  /**
   * How many of `count` are this entity's comments, when `count` measures more than them.
   *
   * Without it the live comment list replaces the number as soon as anything fetches that list, and
   * a pill showing a whole claim's activity collapses to its direct comments. See `useCommentCount`.
   */
  commentsInCount?: number;
}) {
  const { commentsTarget, openComments } = useEntityCommentsPanel();
  const isOpen = onActivate ? (isActive ?? false) : commentsTarget?.entityId === entityId;
  // Commenting from the panel this button opens used to leave the number beside it behind.
  const liveCount = useCommentCount(entityId, count, { commentsInSeed: commentsInCount });

  return (
    <button
      type="button"
      // Marks this as an opener: clicking one while the panel is open switches
      // it to that entity rather than dismissing it as an outside click.
      data-entity-comments-opener={onActivate ? undefined : true}
      data-geo-analytics-label={
        onActivate ? `Comment on ${targetEntityType}` : `Open ${targetEntityType} comments panel`
      }
      data-geo-analytics-intent={onActivate ? 'open_inline_composer' : 'open_comments_panel'}
      aria-label={`Comments (${liveCount})`}
      aria-expanded={isOpen}
      onClick={event => {
        // These rows are commonly wrapped in a link to the entity.
        event.preventDefault();
        event.stopPropagation();
        if (onActivate) {
          onActivate();
          return;
        }
        openComments(entityId, spaceId, targetEntityType);
      }}
      className={className ?? 'inline-flex items-center gap-1.5 text-grey-04 transition-colors hover:text-text'}
    >
      <ExploreCommentsIcon />
      <span className="text-[14px] font-normal tabular-nums">{liveCount}</span>
    </button>
  );
}
