'use client';

import * as React from 'react';

import cx from 'classnames';

import { Fullscreen } from '~/design-system/icons/full-screen';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

type FullscreenLinkProps = {
  href: string;
  /** What is being opened, for the accessible name — the icon says nothing on its own. */
  ariaLabel: string;
  /**
   * Still rendered, so the control does not disappear from a row as it loads, but inert: no hover,
   * no focus ring, no navigation. `pointer-events-none` rather than an `aria-disabled` anchor,
   * which is the shape the data block already used here.
   */
  disabled?: boolean;
  /** Prefetch hints, when the target is an entity page. See {@link Link}. */
  entityId?: string;
  spaceId?: string;
  className?: string;
};

/**
 * "Open this at full size" — the bare expand glyph, no button chrome around it.
 *
 * One definition because two unrelated surfaces ask the same question of the reader and had to
 * look like they were asking it: a data block's header offers it for the block, and an explore
 * debate card offers it for the debate. The same reasoning as `vote-button-styles` — the styling
 * is the whole contract here, so a copy of the class list in each place is a copy that drifts.
 *
 * A real anchor with a real `href`, never a button, so modifier-click still opens a tab and
 * "copy link address" still works (GEO-2701). Surfaces that expand in place rather than navigate
 * want a button instead, which is why `DataBlockExpandControl` keeps its own `onClick` branch.
 */
export function FullscreenLink({
  href,
  ariaLabel,
  disabled = false,
  entityId,
  spaceId,
  className,
}: FullscreenLinkProps) {
  return (
    <Link
      href={href}
      entityId={entityId}
      spaceId={spaceId}
      aria-label={ariaLabel}
      className={cx(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-none bg-transparent text-grey-04',
        disabled
          ? 'pointer-events-none'
          : 'transition hover:bg-bg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04',
        className
      )}
    >
      <Fullscreen color="grey-04" />
    </Link>
  );
}
