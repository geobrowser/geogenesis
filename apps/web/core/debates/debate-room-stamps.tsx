'use client';

import * as React from 'react';

import cx from 'classnames';

import { recordingFont, recordingOverlayTextShadow } from './recording-overlay-styles';

export const ROOM_UI_FONT = recordingFont;

/** Option 5, Debate room / Open rounds (GEO-3366). The export scales type by .78 and pills by .86. */
export const ROOM_GLASS_CLASS = 'bg-black/66 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)]';
export const ROOM_WHITE_GLASS_CLASS = 'bg-white text-[#111]';
export const ROOM_END_TURN_CLASS =
  'block rounded-full bg-black px-[3.2cqw] py-[2cqw] text-[3cqw] leading-none font-medium text-white transition hover:bg-black/85 disabled:cursor-default disabled:opacity-70';

/** The export fades over 250 ms while settling from 1.06x, without moving across the tile. */
export const ROOM_MOMENT_ENTER_CLASS =
  'motion-safe:animate-[fadeIn_250ms_linear_both,roomMomentSettle_250ms_cubic-bezier(0.333333,1,0.666667,1)_both]';

/** Open rounds keeps its white type, using the fixed-format room's face and outline weight. */
export const ROOM_OUTLINED_STYLE = {
  ...recordingFont,
  ...recordingOverlayTextShadow,
} as const;

/** A glass pill that fades in with the reference's small settle, without moving across the tile. */
export function RoomPill({
  children,
  tone = 'dark',
  delayMs = 0,
  fadeInMs = 250,
  fontWeight = 600,
  className,
  style,
  ...props
}: React.ComponentPropsWithoutRef<'span'> & {
  tone?: 'dark' | 'white' | 'red' | 'dashed';
  delayMs?: number;
  fadeInMs?: number;
  fontWeight?: 600 | 700;
}) {
  return (
    <span
      {...props}
      className={cx(
        'inline-flex max-w-[92%] items-center rounded-full px-[4.644cqw] py-[2.064cqw] text-[4.816cqw] leading-none',
        fontWeight === 700 ? 'font-bold' : 'font-semibold',
        ROOM_MOMENT_ENTER_CLASS,
        tone === 'white'
          ? [ROOM_WHITE_GLASS_CLASS, 'shadow-[0_1cqw_3cqw_rgba(0,0,0,0.2)] backdrop-blur-[14px]']
          : tone === 'red'
            ? 'bg-[#FF4A26]/90 text-white backdrop-blur-[14px]'
            : tone === 'dashed'
              ? 'border-[0.5cqw] border-dashed border-white/60 bg-transparent text-white/80'
              : 'bg-[rgba(36,36,40,0.48)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] backdrop-blur-[14px]',
        className
      )}
      style={{
        ...ROOM_UI_FONT,
        animationDelay: delayMs ? `${delayMs}ms, ${delayMs}ms` : undefined,
        animationDuration: `${fadeInMs}ms, 250ms`,
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
  eyebrow,
  sub,
  sizeCqw,
  fontWeight = 600,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & {
  eyebrow?: React.ReactNode;
  sub?: React.ReactNode;
  sizeCqw: number;
  fontWeight?: 600 | 700;
}) {
  const card = eyebrow !== undefined || sub !== undefined;
  return (
    <div
      {...props}
      className={cx(
        'mx-auto grid w-max max-w-[92%] justify-items-center text-center leading-[0.95] tracking-[-0.02em] text-white',
        fontWeight === 700 ? 'font-bold' : 'font-semibold',
        ROOM_MOMENT_ENTER_CLASS,
        className
      )}
      style={{ ...ROOM_OUTLINED_STYLE, fontSize: card ? '16px' : `${sizeCqw}cqw` }}
    >
      {eyebrow && (
        <span className="text-[7.02cqw] leading-none font-semibold tracking-[-0.01em] text-white/88">{eyebrow}</span>
      )}
      <span
        className={cx('block whitespace-nowrap', card && 'leading-[0.95] tracking-[-0.03em]')}
        style={card ? { fontSize: `${sizeCqw}cqw` } : undefined}
      >
        {children}
      </span>
      {sub && (
        <span className="mt-[1.6cqw] max-w-full truncate text-[3.744cqw] leading-none font-semibold tracking-normal">
          {sub}
        </span>
      )}
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
        'inline-flex items-center rounded-full px-[2.2cqw] py-[1.1cqw] leading-none font-medium tracking-[0.04em] whitespace-nowrap',
        className
      )}
      style={{ ...ROOM_UI_FONT, ...style }}
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
