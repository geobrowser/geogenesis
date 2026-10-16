'use client';

import * as React from 'react';

import cx from 'classnames';

import { LABEL_FONT, STAMP_FONT } from './browse/stamp-styles';

/** Open rounds room graphics (GEO-3366). Sizes follow the tile's width via its size container. */
export const ROOM_GLASS_CLASS = 'border border-white/30 bg-black/40 text-white backdrop-blur-md';
export const ROOM_WHITE_GLASS_CLASS = 'border border-white/70 bg-white/85 text-text backdrop-blur-md';

/** White Geist Bold with a black outline, including the smaller count-in label. */
export const ROOM_OUTLINED_STYLE = {
  ...STAMP_FONT,
  WebkitTextStroke: '0.06em #000',
  paintOrder: 'stroke fill',
  textShadow: '0 0.08em 0.25em rgba(0,0,0,0.45)',
} as const;

/** A glass pill that fades in without moving, rotating or scaling. */
export function RoomPill({
  children,
  tone = 'dark',
  sizeCqw,
  delayMs = 0,
  className,
  style,
  ...props
}: React.ComponentPropsWithoutRef<'span'> & {
  tone?: 'dark' | 'white' | 'red' | 'dashed';
  sizeCqw: number;
  delayMs?: number;
}) {
  return (
    <span
      {...props}
      className={cx(
        'inline-flex max-w-[92%] items-center rounded-full px-[0.65em] py-[0.35em] leading-none font-medium shadow-[0_0.12em_0.45em_rgba(0,0,0,0.2)]',
        ROOM_ENTER_CLASS,
        tone === 'white'
          ? ROOM_WHITE_GLASS_CLASS
          : tone === 'red'
            ? 'border border-white/35 bg-[#FF4A26]/85 text-white backdrop-blur-md'
            : [ROOM_GLASS_CLASS, tone === 'dashed' && 'border-dashed'],
        className
      )}
      style={{
        ...LABEL_FONT,
        fontSize: `${sizeCqw}cqw`,
        animationDelay: delayMs ? `${delayMs}ms` : undefined,
        ...style,
      }}
    >
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function RoomTilePill(props: React.ComponentProps<typeof RoomPill>) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <RoomPill {...props} />
    </div>
  );
}

/** An outlined announcement and optional opener, fading in and out in place. */
export function RoomPhrase({
  children,
  sub,
  sizeCqw,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & {
  sub?: React.ReactNode;
  sizeCqw: number;
}) {
  return (
    <div
      {...props}
      className={cx('px-[0.6em] text-center leading-tight font-bold text-white', ROOM_ENTER_CLASS, className)}
      style={{ ...ROOM_OUTLINED_STYLE, fontSize: `${sizeCqw}cqw` }}
    >
      <span className="block text-balance">{children}</span>
      {sub && <span className="mt-[0.35em] block truncate text-[0.6em]">{sub}</span>}
    </div>
  );
}

export function RoomMiddlePhrase(props: React.ComponentProps<typeof RoomPhrase>) {
  return (
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
      <RoomPhrase {...props} />
    </div>
  );
}

/** Small glass label for the last speaker or a round count. */
export function RoomTag({ className, style, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={cx(
        ROOM_GLASS_CLASS,
        'inline-flex items-center rounded-full px-[0.65em] py-[0.35em] leading-none whitespace-nowrap',
        className
      )}
      style={{ ...LABEL_FONT, ...style }}
    />
  );
}

/**
 * The tile under a moment, dimmed as in the mockup so the graphic reads over any picture.
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

/** How long a moment takes to fade out. Playback also uses this duration for its banner exit. */
export const ROOM_EXIT_MS = 300;

const EXIT_CLASS = {
  // Legacy playback banners still roll; recording-room moments use the default fade.
  roll: 'motion-safe:animate-debate-banner-out',
  fade: 'motion-safe:animate-[fadeIn_300ms_linear_reverse_both]',
} as const;

/** The `fade` exit run forwards: a piece that fades in over `ROOM_EXIT_MS` and out the same way. */
export const ROOM_ENTER_CLASS = 'motion-safe:animate-[fadeIn_300ms_linear_both]';

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
 * that needs them, like the pick panel, asks for them itself, and only until it starts to leave.
 *
 * `layout="inline"` drops the box, for a piece that sits in a corner sized to its contents: the
 * turn timer, the muted microphone and End turn (GEO-3347).
 */
export function RoomExit({
  children,
  exit = 'fade',
  layout = 'fill',
  className,
}: {
  children: React.ReactNode;
  exit?: keyof typeof EXIT_CLASS;
  layout?: 'fill' | 'inline';
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
  const isLeaving = !shown(children);
  return (
    <div
      data-room-leaving={isLeaving ? 'true' : undefined}
      // On its way out it is only a picture: a late tap on the pick panel must not send a pick after
      // the round resolved, and a screen reader should not land on it.
      inert={isLeaving}
      aria-hidden={isLeaving || undefined}
      className={cx(
        'pointer-events-none',
        layout === 'fill' && 'absolute inset-0',
        isLeaving && [EXIT_CLASS[exit], 'motion-reduce:hidden'],
        className
      )}
    >
      {content}
    </div>
  );
}
