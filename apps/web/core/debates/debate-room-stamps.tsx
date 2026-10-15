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

/**
 * The tile under a moment, dimmed as in the mockup so the stamp or banner reads over any picture.
 * Always there, and faded in and out, so one moment handing over to the next never flashes.
 */
export function RoomDim({ on }: { on: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-room-dim={on ? 'on' : 'off'}
      className={cx(
        'pointer-events-none absolute inset-0 z-[15] bg-black/42 transition-opacity duration-300 motion-reduce:transition-none',
        on ? 'opacity-100' : 'opacity-0'
      )}
    />
  );
}

/** How long a moment takes to leave: the banner's roll and the stamps' fade. */
export const ROOM_EXIT_MS = 300;

const EXIT_CLASS = {
  // A banner rolls on out the way it rolled in, as in the mockup.
  roll: 'motion-safe:animate-debate-banner-out',
  fade: 'motion-safe:animate-[fadeIn_300ms_linear_reverse_both]',
} as const;

function shown(node: React.ReactNode) {
  return node !== null && node !== undefined && node !== false;
}

/**
 * A moment that leaves rather than vanishing (GEO-3315). While `children` is there it renders as is;
 * when it goes, the last of it stays for `ROOM_EXIT_MS`, rolling or fading out, so the next moment
 * comes in over the last one going rather than after a cut. With reduced motion it simply goes.
 *
 * The wrapper is always rendered, a box over the whole of its container, so the moment is never
 * remounted on its way out and its entrance does not replay. It takes no pointer events: a moment
 * that needs them, like the pick panel, asks for them itself.
 */
export function RoomExit({
  children,
  exit = 'fade',
  className,
}: {
  children: React.ReactNode;
  exit?: keyof typeof EXIT_CLASS;
  className?: string;
}) {
  const [previous, setPrevious] = React.useState(children);
  const [leaving, setLeaving] = React.useState<React.ReactNode>(null);
  if (children !== previous) {
    setPrevious(children);
    setLeaving(shown(children) ? null : shown(previous) ? previous : leaving);
  }

  React.useEffect(() => {
    if (!shown(leaving)) return;
    const timer = window.setTimeout(() => setLeaving(null), ROOM_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const content = shown(children) ? children : leaving;
  if (!shown(content)) return null;
  return (
    <div
      data-room-leaving={shown(children) ? undefined : 'true'}
      className={cx(
        'pointer-events-none absolute inset-0',
        !shown(children) && [EXIT_CLASS[exit], 'motion-reduce:hidden'],
        className
      )}
    >
      {content}
    </div>
  );
}
