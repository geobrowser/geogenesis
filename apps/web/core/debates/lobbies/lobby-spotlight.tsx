'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import { debatingLabel, hereLabel } from './lobby-format';

/**
 * The dark surface live lobbies are drawn on (GEO-3268): the Explore welcome banner's and the
 * navbar's black pill. The avatar stack's ring takes it too, so faces are cut out of the card rather
 * than haloed in white.
 */
export const LOBBY_DARK_SURFACE_CLASS_NAME = 'bg-[#151515]';
export const LOBBY_DARK_SURFACE_STYLE = { '--avatar-group-ring': '#151515' } as React.CSSProperties;

/** The welcome banner's body line, which the lobby cards on the dark surface share. */
export const LOBBY_BODY_TEXT_CLASS_NAME = 'text-[16px] leading-[18px] font-normal tracking-[-0.48px]';

/**
 * The spotlight's one action: the dialog action button's full-width pill, in white for the dark
 * card. `md:h-11` is the phone touch target, as on the dialog's.
 */
export const SPOTLIGHT_ACTION_CLASS_NAME =
  'flex h-7 md:h-11 w-full items-center justify-center gap-1.5 rounded-full bg-white px-4 text-metadata text-text transition-colors hover:bg-white/90 disabled:opacity-50';

/** A secondary pill on the dark card: the Explore banner close button's white/30 outline. */
export const SPOTLIGHT_SECONDARY_PILL_CLASS_NAME =
  'inline-flex h-7 shrink-0 items-center justify-center rounded-full border border-white/30 px-3 text-metadata whitespace-nowrap text-white transition-colors hover:bg-white/10';

/** The pulsing green dot that marks a lobby as live everywhere it is promoted. */
export function LiveDot({ className = 'size-1.5' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('shrink-0 animate-pulse-strong rounded-full bg-green motion-reduce:animate-none', className)}
    />
  );
}

/** The shared "Live" / "2 lobbies live" line: the dot and its label. */
export function LiveMark({ count, className }: { count: number; className?: string }) {
  return (
    <span className={className ?? 'inline-flex items-center gap-1.5'}>
      <LiveDot />
      <Text as="span" variant="footnoteMedium" color="white">
        {count > 1 ? `${count} lobbies live` : 'Live'}
      </Text>
    </span>
  );
}

/** "14 here · 6 debating", plus "You're here" for someone on the roster. */
export function liveLobbyCounts(lobby: DebateLobbySummary) {
  return [
    hereLabel(lobby.headcount),
    lobby.debating_count > 0 ? debatingLabel(lobby.debating_count) : null,
    lobby.viewer_on_roster ? 'You’re here' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Join, or the way back in for someone already on the roster. */
export function joinLabel(lobby: Pick<DebateLobbySummary, 'viewer_on_roster'>, short = false) {
  if (lobby.viewer_on_roster) return short ? 'Open' : 'Back to lobby';
  return short ? 'Join' : 'Join lobby';
}
