'use client';

import * as React from 'react';

import cx from 'classnames';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { PAGE_DENSITY } from './comment-density';

/**
 * The two things a thread can say when it has more than it is drawing.
 *
 * Reddit keeps these apart and it is worth copying, because they answer different questions:
 *
 *   * **More of the same, here** — siblings the list is holding back for length. Reddit's "load
 *     more comments (N)". Pressing it reveals them in place; nothing about the reader's position
 *     changes.
 *   * **Deeper than this page goes** — Reddit's "continue this thread", which is *not* a load at
 *     all. It navigates to that comment's permalink, where it becomes the root and gets a fresh
 *     depth budget. In the API those placeholders come back with zero children, which is how you
 *     tell the two apart programmatically.
 *
 * We are better placed for the second than Reddit is. Reddit has to synthesise a permalink for a
 * comment; every node in our tree is already an entity with a page that renders its own thread. So
 * continuing a thread lands the reader somewhere with *more* context than they had, not less —
 * where the previous behaviour, opening the global comments panel, gave them a flat list and lost
 * the claim they were reading.
 */

/** More siblings, revealed in place. The data is already loaded; this only lifts the cap. */
export function ThreadShowMore({
  count,
  noun,
  onShowMore,
  className,
}: {
  count: number;
  /** Singular form; pluralised here. "reply" → "Show 3 more replies". */
  noun: string;
  onShowMore: () => void;
  className?: string;
}) {
  if (count <= 0) return null;

  return (
    <button
      type="button"
      onClick={onShowMore}
      className={cx(
        PAGE_DENSITY.metaClass,
        'self-start text-ctaPrimary transition-colors hover:text-ctaHover',
        className
      )}
    >
      Show {count} more {count === 1 ? noun : `${noun.replace(/y$/, 'ie')}s`}
    </button>
  );
}

/**
 * Deeper than this page draws: go to where the rest of it is the whole page.
 *
 * A link rather than a button, because it is a navigation and should behave like one — middle-click
 * and open-in-new-tab both work, which a button swallowing the click would not.
 */
export function ThreadContinue({
  href,
  count,
  className,
}: {
  /** The entity whose own page roots this thread. */
  href: string;
  /** How many rows are down there, so the offer is specific rather than "there is more". */
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;

  return (
    <Link
      href={href}
      className={cx(
        PAGE_DENSITY.metaClass,
        'self-start text-ctaPrimary no-underline transition-colors hover:text-ctaHover hover:underline',
        className
      )}
      aria-label={`Continue this thread — ${count} more ${count === 1 ? 'reply' : 'replies'}`}
    >
      Continue this thread ({count}) →
    </Link>
  );
}
