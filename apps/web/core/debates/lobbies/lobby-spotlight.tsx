'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import { debateAnalyticsLabel, hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { debateRoomPath } from '../rooms/room-routes';
import type { LobbyLineup } from './live-lobbies';
import { markLobbyEntry } from './lobby-analytics';
import { debatingLabel, hereLabel } from './lobby-format';
import { LobbyByline } from './lobby-host-names';
import { LobbyAvatarStack } from './lobby-people';

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

const SPOTLIGHT_HOST_LABEL = debateAnalyticsLabel('hub', 'Lobby spotlight host');

/** Join, or the way back in for someone already on the roster. */
export function joinLabel(lobby: Pick<DebateLobbySummary, 'viewer_on_roster'>, short = false) {
  if (lobby.viewer_on_roster) return short ? 'Open' : 'Back to lobby';
  return short ? 'Join' : 'Join lobby';
}

/**
 * The live lobby card at the top of the debates panel (GEO-3268): the busiest live lobby large, every
 * other live one listed under it. Kept over a one-line strip (Preston, 28 Oct): a live lobby is the
 * one thing in the panel worth the room. A lobby that has not opened is in the Requests timeline
 * instead (GEO-3519).
 */
export function LiveLobbySpotlight({ lineup }: { lineup: Pick<LobbyLineup, 'live'> }) {
  const [lead, ...others] = lineup.live;
  if (!lead) return null;
  const href = debateRoomPath(lead.lobby_id);

  return (
    <div className="mx-4 mb-3" data-testid="lobby-spotlight">
      <section
        aria-label={others.length > 0 ? 'Live debate lobbies' : 'Live debate lobby'}
        className={cx('flex flex-col gap-3 rounded-lg p-4', LOBBY_DARK_SURFACE_CLASS_NAME)}
        style={LOBBY_DARK_SURFACE_STYLE}
      >
        <LiveMark count={others.length + 1} />

        <div className="flex min-w-0 flex-col gap-1">
          <Text as="h3" variant="smallTitle" color="white" className="truncate">
            {lead.name}
          </Text>
          {lead.hosts.length > 0 ? (
            <p className={cx('truncate text-grey-03', LOBBY_BODY_TEXT_CLASS_NAME)}>
              <LobbyByline lobby={lead} analyticsLabel={SPOTLIGHT_HOST_LABEL} hostedBy />
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-2.5">
          <LobbyAvatarStack people={lead.avatars} total={lead.headcount} />
          <p className={cx('min-w-0 truncate text-white', LOBBY_BODY_TEXT_CLASS_NAME)}>{liveLobbyCounts(lead)}</p>
        </div>

        <Link
          href={href}
          onClick={() => markLobbyEntry(lead.lobby_id, 'side_panel')}
          {...hubAnalyticsAttributes(
            lead.viewer_on_roster ? 'Lobby spotlight Open' : 'Lobby spotlight Join',
            'join_lobby'
          )}
          className={SPOTLIGHT_ACTION_CLASS_NAME}
        >
          {joinLabel(lead)}
        </Link>

        {others.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-white/15 pt-3">
            <Text as="p" variant="footnoteMedium" color="grey-03">
              Also live
            </Text>
            <ul className="flex flex-col gap-3">
              {others.map(lobby => (
                <li key={lobby.lobby_id} className="flex min-w-0 items-center gap-2.5" data-testid="also-live-row">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Text as="p" variant="metadataMedium" color="white" className="truncate">
                      {lobby.name}
                    </Text>
                    <div className="flex min-w-0 items-center gap-2">
                      <LobbyAvatarStack people={lobby.avatars} total={lobby.headcount} />
                      <Text as="span" variant="footnote" color="grey-03" className="min-w-0 truncate">
                        {liveLobbyCounts(lobby)}
                      </Text>
                    </div>
                  </div>
                  <Link
                    href={debateRoomPath(lobby.lobby_id)}
                    onClick={() => markLobbyEntry(lobby.lobby_id, 'side_panel')}
                    {...hubAnalyticsAttributes(
                      lobby.viewer_on_roster ? 'Lobby spotlight also live Open' : 'Lobby spotlight also live Join',
                      'join_lobby'
                    )}
                    className={SPOTLIGHT_SECONDARY_PILL_CLASS_NAME}
                  >
                    {joinLabel(lobby, true)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
