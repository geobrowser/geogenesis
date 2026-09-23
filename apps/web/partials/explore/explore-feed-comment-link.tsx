'use client';

import * as React from 'react';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreCommentsIcon } from './explore-comments-icon';

/**
 * The comment count beside an explore card's vote buttons.
 *
 * Its own module because the topic card draws the same link as the generic one, and importing it
 * from `explore-feed-card` would be a cycle the moment that dispatcher ever draws a topic.
 */
export function ExploreFeedCommentLink({ href, count }: { href: string; count: number }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 transition-colors hover:text-grey-04">
      <ExploreCommentsIcon className="text-grey-03" />
      <span className="tabular-nums">{count}</span>
    </Link>
  );
}
