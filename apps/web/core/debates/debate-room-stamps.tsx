'use client';

import * as React from 'react';

import cx from 'classnames';

import { BANNER_CLASS, LABEL_FONT, STAMP_CLASS, STAMP_FONT, TAG_CLASS } from './browse/stamp-styles';

/**
 * The recording room's moments in an Open rounds debate, in the stamps design the published player
 * uses (GEO-3315): stamps that land on a tile, and purple banners that roll across one. Every size
 * is in `cqw` of the tile, so the room draws them in the mockup's proportions at any width; the tile
 * and the tiles' grid are size containers for it.
 *
 * Fixed formats keep today's outlined phrases and never draw these.
 */

/** A stamp over the middle of its box, landing from 1.3x as it appears. `delayMs` holds it back. */
export function RoomStamp({
  children,
  ink,
  sizeCqw,
  tilt,
  delayMs = 0,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'> & {
  /** The text colour, which the border takes too. */
  ink: string;
  sizeCqw: number;
  tilt: string;
  delayMs?: number;
}) {
  return (
    <span
      {...props}
      className={cx(STAMP_CLASS, 'motion-safe:animate-debate-stamp', ink, className)}
      style={{
        ...STAMP_FONT,
        fontSize: `${sizeCqw}cqw`,
        transform: `rotate(${tilt})`,
        animationDelay: delayMs ? `${delayMs}ms` : undefined,
      }}
    >
      {children}
    </span>
  );
}

/**
 * A purple banner rolling in across its box's full width. `sub` is a smaller second line, where a
 * long name truncates rather than shrinking the banner.
 */
export function RoomBanner({
  children,
  sub,
  sizeCqw,
  delayMs = 0,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & {
  sub?: React.ReactNode;
  sizeCqw: number;
  delayMs?: number;
}) {
  return (
    <div
      {...props}
      className={cx(BANNER_CLASS, 'motion-safe:animate-debate-banner', className)}
      style={{ ...LABEL_FONT, fontSize: `${sizeCqw}cqw`, animationDelay: delayMs ? `${delayMs}ms` : undefined }}
    >
      <span className="block truncate">{children}</span>
      {sub && (
        <span className="mt-[0.35em] block truncate text-[0.6em] tracking-[0.02em] normal-case opacity-85">{sub}</span>
      )}
    </div>
  );
}

/** A small purple label, "Last word" or a round count. */
export function RoomTag({ className, style, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={cx(TAG_CLASS, 'inline-flex items-center uppercase', className)}
      style={{ ...LABEL_FONT, ...style }}
    />
  );
}

/** The tile under a moment, dimmed as in the mockup so the stamp or banner reads over any picture. */
export function RoomDim() {
  return <div aria-hidden="true" data-room-dim className="pointer-events-none absolute inset-0 z-[15] bg-black/42" />;
}
