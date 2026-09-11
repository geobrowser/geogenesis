'use client';

import * as React from 'react';

import { FallbackImage } from '~/design-system/fallback-image';

/**
 * The side panel's space pill: a 16px avatar and a name inside a rounded outline.
 *
 * Shared rather than copied because the two panels that use it are meant to look like one thing —
 * Join spaces on Explore and Subspaces on a space overview (GEO-2875). They differ in what a pill
 * *is*: Join spaces is a button that fires a membership request and swaps its label for loading
 * dots, Subspaces is a link. So what is shared is the shell and the list behaviour, and each
 * caller renders its own element inside.
 */
export const SPACE_PILL_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-grey-02 py-1.5 pr-2.5 pl-2 text-[16px] leading-[18px] text-text transition-colors hover:border-text disabled:cursor-default';

/** The pill's avatar. `FallbackImage` walks gateways and covers a value that will not load. */
export function SpacePillAvatar({ value }: { value: string }) {
  return (
    <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-full bg-grey-01">
      <FallbackImage value={value} sizes="16px" className="object-cover" />
    </span>
  );
}

/**
 * How many pills show before the rest are folded behind "Show more".
 *
 * Nine comes from the Join spaces design, and it is a cap on *panel height* rather than on the
 * list: the rail is narrow (and narrowing — GEO-2774), so pills wrap two or three to a row and an
 * uncapped list of subspaces would push everything below it off the screen.
 */
const INITIAL_VISIBLE_COUNT = 9;

type SpacePillListProps<T> = {
  items: T[];
  keyFor: (item: T) => string;
  renderPill: (item: T) => React.ReactNode;
};

/** The wrapping pill row, with the overflow toggle once there are more than {@link INITIAL_VISIBLE_COUNT}. */
export function SpacePillList<T>({ items, keyFor, renderPill }: SpacePillListProps<T>) {
  const [showAll, setShowAll] = React.useState(false);

  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE_COUNT);
  const hasMore = items.length > INITIAL_VISIBLE_COUNT;

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map(item => (
        <React.Fragment key={keyFor(item)}>{renderPill(item)}</React.Fragment>
      ))}

      {hasMore ? (
        // A disclosure, so it has to say whether it is open rather than only changing its label —
        // a screen reader announcing "Show more, button" tells you what it does, not what state
        // the list is in. Matches how the repo's other toggles are wired (comment threads, the
        // block menus). Fixing it here fixes it for Join spaces too, which is the point of the
        // list being shared.
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll(prev => !prev)}
          className="inline-flex items-center rounded-full border border-grey-02 py-1.5 pr-2.5 pl-2 text-[16px] leading-[18px] text-grey-04 transition-colors hover:border-text hover:text-text"
        >
          {showAll ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The heading above a pill section. Sticky, so it holds its place while the rail scrolls under it,
 * and opaque for the same reason.
 *
 * Named for the pills rather than for the rail because it is *not* what every rail section uses:
 * Featured rankings and Community calls share this type scale but are not sticky, and Daily
 * activities is a size up. Making those four agree is a design decision rather than a refactor, so
 * this stays scoped to the two pill sections that genuinely match.
 */
export function SpacePillSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="sticky top-0 z-20 bg-white pt-1 pb-4 text-[19px] leading-[23px] font-semibold tracking-[-0.02em] text-text">
      {children}
    </h2>
  );
}
