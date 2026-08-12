'use client';

import * as React from 'react';

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
 */
export function EntityCommentsButton({
  entityId,
  spaceId,
  count,
  className,
}: {
  entityId: string;
  spaceId: string;
  count: number;
  className?: string;
}) {
  const { openComments } = useEntityCommentsPanel();

  return (
    <button
      type="button"
      aria-label={`Comments (${count})`}
      onClick={event => {
        // These rows are commonly wrapped in a link to the entity.
        event.preventDefault();
        event.stopPropagation();
        openComments(entityId, spaceId);
      }}
      className={className ?? 'inline-flex items-center gap-1.5 text-grey-04 transition-colors hover:text-text'}
    >
      <ExploreCommentsIcon className="text-grey-04" />
      <span className="text-[14px] font-normal tabular-nums">{count}</span>
    </button>
  );
}
