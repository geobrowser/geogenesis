'use client';

import * as React from 'react';

import cx from 'classnames';

import { PLAYBACK_OUTLINE_STYLE } from './browse/playback-typography';
import {
  PLAYER_ENTER_CLASS,
  PLAYER_EXIT_CLASS,
  PLAYER_EXIT_MS,
  PLAYER_FADE_CLASS,
  PLAYER_PICK_BASE_CLASS,
  PLAYER_PICK_CLASS,
} from './browse/player-overlay-styles';
import { recordingFont } from './recording-overlay-styles';

export const ROOM_UI_FONT = recordingFont;

/** Option 5, Debate room / Open rounds (GEO-3366). The export scales type by .78 and pills by .86. */
export const ROOM_GLASS_CLASS = 'bg-black/66 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)]';
export const ROOM_WHITE_GLASS_CLASS = 'bg-white text-[#111]';
export const ROOM_END_TURN_CLASS =
  'block rounded-full bg-black px-[3.2cqw] py-[2cqw] text-[3cqw] leading-none font-medium text-white transition hover:bg-black/85 disabled:cursor-default disabled:opacity-70';

/** Share playback's 250ms fade and quiet 1.025x settle, including its reduced-motion fade. */
export const ROOM_MOMENT_ENTER_CLASS = PLAYER_ENTER_CLASS;

/** White outlined announcements share the merged classic + glass playback treatment. */
export const ROOM_OUTLINED_STYLE = {
  ...recordingFont,
  ...PLAYBACK_OUTLINE_STYLE,
} as const;

/** A glass pill that fades in with the reference's small settle, without moving across the tile. */
export function RoomPill({
  children,
  tone = 'dark',
  delayMs = 0,
  fontWeight = 600,
  className,
  style,
  ...props
}: React.ComponentPropsWithoutRef<'span'> & {
  tone?: 'dark' | 'white' | 'red' | 'dashed';
  delayMs?: number;
  fontWeight?: 600 | 700;
}) {
  return (
    <span
      {...props}
      className={cx(
        PLAYER_PICK_BASE_CLASS,
        'max-w-[92%]',
        ROOM_MOMENT_ENTER_CLASS,
        tone === 'white'
          ? [ROOM_WHITE_GLASS_CLASS, 'shadow-[0_1cqw_3cqw_rgba(0,0,0,0.2)] backdrop-blur-[14px]']
          : tone === 'red'
            ? 'bg-[#FF4A26]/90 text-white backdrop-blur-[14px]'
            : tone === 'dashed'
              ? PLAYER_PICK_CLASS.none
              : PLAYER_PICK_CLASS.end,
        className
      )}
      style={{
        ...ROOM_UI_FONT,
        fontWeight,
        animationDelay: delayMs ? `${delayMs}ms, ${delayMs}ms` : undefined,
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

/** A single outlined announcement, fading in and out in place. */
export function RoomPhrase({
  children,
  sizeCqw,
  fontWeight = 600,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & {
  sizeCqw: number;
  fontWeight?: 600 | 700;
}) {
  return (
    <div
      {...props}
      className={cx(
        'mx-auto grid w-max max-w-[92%] justify-items-center text-center leading-[0.95] tracking-[-0.02em] text-white',
        fontWeight === 700 ? 'font-bold' : 'font-semibold',
        ROOM_MOMENT_ENTER_CLASS,
        className
      )}
      style={{ ...ROOM_OUTLINED_STYLE, fontSize: `${sizeCqw}cqw` }}
    >
      <span className="block whitespace-nowrap">{children}</span>
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
        'pointer-events-none absolute inset-0 z-[15] bg-black/42 transition-opacity duration-250 ease-out',
        on ? 'opacity-100' : 'opacity-0'
      )}
    />
  );
}

/** How long a moment takes to fade out. Playback also uses this duration for its banner exit. */
export const ROOM_EXIT_MS = PLAYER_EXIT_MS;

/** Muted indicators and panels share playback's soft entrance. */
export const ROOM_ENTER_CLASS = PLAYER_FADE_CLASS;

function shown(node: React.ReactNode) {
  return node !== null && node !== undefined && node !== false;
}

/**
 * A moment that leaves rather than vanishing (GEO-3315). While `children` is there it renders as is;
 * when it goes, the last of it stays for `ROOM_EXIT_MS`, fading out, so the next moment
 * comes in over the last one going rather than after a cut. Reduced motion keeps the fade.
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
  layout = 'fill',
  className,
}: {
  children: React.ReactNode;
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
        isLeaving && PLAYER_EXIT_CLASS,
        className
      )}
    >
      {content}
    </div>
  );
}
