'use client';

import * as React from 'react';

import Link from 'next/link';

import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import { hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { debateRoomPath } from '../rooms/room-routes';
import { useDebateLobbyReminder } from './hooks';
import type { LobbyLineup } from './live-lobbies';
import { markLobbyEntry } from './lobby-analytics';
import {
  RSVP_FAILED,
  debatingLabel,
  goingLabel,
  hereLabel,
  lobbyErrorMessage,
  lobbyScheduleLabel,
  rsvpLabel,
} from './lobby-format';
import { LobbyHostNames } from './lobby-host-names';
import { LobbyAvatarStack } from './lobby-people';

/**
 * The surface's own dark: the Explore welcome banner's and the navbar's black pill. The avatar
 * stack's ring takes it too, so faces are cut out of the card rather than haloed in white.
 */
const SPOTLIGHT_SURFACE_STYLE = { '--avatar-group-ring': '#151515' } as React.CSSProperties;

/**
 * The spotlight's one action: the dialog action button's full-width pill, in white for the dark
 * card. `md:h-11` is the phone touch target, as on the dialog's.
 */
export const SPOTLIGHT_ACTION_CLASS_NAME =
  'flex h-7 md:h-11 w-full items-center justify-center gap-1.5 rounded-full bg-white px-4 text-metadata text-text transition-colors hover:bg-white/90 disabled:opacity-50';

/** A secondary pill on the dark card: the Explore banner close button's white/30 outline. */
export const SPOTLIGHT_SECONDARY_PILL_CLASS_NAME =
  'inline-flex h-7 shrink-0 items-center justify-center rounded-full border border-white/30 px-3 text-metadata whitespace-nowrap text-white transition-colors hover:bg-white/10';

/** The shared "Live" / "2 lobbies live" line: a pulsing green dot and its label. */
export function LiveMark({ count, className }: { count: number; className?: string }) {
  return (
    <span className={className ?? 'inline-flex items-center gap-1.5'}>
      <span
        aria-hidden
        className="size-1.5 shrink-0 animate-pulse-strong rounded-full bg-green motion-reduce:animate-none"
      />
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

/**
 * The lobby spotlight at the top of the debates panel (GEO-3268), above the tabs, in place of the
 * set-schedule banner. The panel shows it while a lobby is live or one opens within 15 minutes.
 *
 * Live: the busiest lobby large, every other live one listed under it. Soon: a countdown to the
 * next opening, with RSVP. Lobbies further out stay in the card under the tabs, which scrolls.
 */
export function LobbySpotlight({ lineup }: { lineup: LobbyLineup }) {
  const [lead, ...others] = lineup.live;
  if (!lead && !lineup.soon) return null;

  return (
    <div className="mx-4 mb-3" data-testid="lobby-spotlight">
      {lead ? (
        <LiveSpotlight lead={lead} others={others} />
      ) : lineup.soon ? (
        <SoonSpotlight lobby={lineup.soon} />
      ) : null}
    </div>
  );
}

function LiveSpotlight({ lead, others }: { lead: DebateLobbySummary; others: DebateLobbySummary[] }) {
  const href = debateRoomPath(lead.lobby_id);

  return (
    <section
      aria-label={others.length > 0 ? 'Live debate lobbies' : 'Live debate lobby'}
      className="flex flex-col gap-3 rounded-lg bg-[#151515] p-4"
      style={SPOTLIGHT_SURFACE_STYLE}
    >
      <LiveMark count={others.length + 1} />

      <div className="flex min-w-0 flex-col gap-1">
        <Text as="h3" variant="smallTitle" color="white" className="truncate">
          {lead.name}
        </Text>
        {lead.hosts.length > 0 ? (
          <p className="truncate text-[16px] leading-[18px] font-normal tracking-[-0.48px] text-grey-03">
            Hosted by <LobbyHostNames hosts={lead.hosts} analyticsLabel="Lobby spotlight host" />
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <LobbyAvatarStack people={lead.avatars} total={lead.headcount} />
        <p className="min-w-0 truncate text-[16px] leading-[18px] font-normal tracking-[-0.48px] text-white">
          {liveLobbyCounts(lead)}
        </p>
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
  );
}

/** Re-renders every 15 seconds while mounted, for a countdown in whole minutes. */
function useMinuteCountdown(iso: string) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(interval);
  }, []);
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : at - now;
}

/** "Opens in 12 min", "Opens in 1 min", then "Opening now" until geo-chat opens it. */
export function opensInLabel(msUntil: number | null) {
  if (msUntil === null) return 'Opening soon';
  if (msUntil <= 0) return 'Opening now';
  const minutes = Math.ceil(msUntil / 60_000);
  return `Opens in ${minutes} min`;
}

function SoonSpotlight({ lobby }: { lobby: DebateLobbySummary }) {
  const reminder = useDebateLobbyReminder();
  const msUntil = useMinuteCountdown(lobby.opens_at);
  const schedule = lobbyScheduleLabel(lobby);

  return (
    <section aria-label="Upcoming debate lobby" className="flex flex-col gap-3 rounded-lg bg-[#151515] p-4">
      {schedule ? (
        <Text as="p" variant="footnoteMedium" color="grey-03">
          {schedule}
        </Text>
      ) : null}

      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-largeTitle text-white tabular-nums" aria-live="polite">
          {opensInLabel(msUntil)}
        </p>
        <Text as="h3" variant="smallTitle" color="white" className="truncate">
          {lobby.name}
        </Text>
      </div>

      <p className="text-[16px] leading-[18px] font-normal tracking-[-0.48px] text-grey-03">
        {lobby.hosts.length > 0 ? (
          <>
            Hosted by <LobbyHostNames hosts={lobby.hosts} analyticsLabel="Lobby spotlight host" />
          </>
        ) : null}
        {lobby.hosts.length > 0 && lobby.reminder_count > 0 ? ' · ' : null}
        {lobby.reminder_count > 0 ? goingLabel(lobby.reminder_count) : null}
      </p>

      <button
        type="button"
        {...hubAnalyticsAttributes(lobby.viewer_reminded ? 'Lobby spotlight reminded' : 'Lobby spotlight remind me')}
        aria-pressed={lobby.viewer_reminded}
        aria-busy={reminder.isPending || undefined}
        disabled={reminder.isPending}
        onClick={() => reminder.mutate({ lobbyId: lobby.lobby_id, reminded: !lobby.viewer_reminded })}
        className={SPOTLIGHT_ACTION_CLASS_NAME}
      >
        {rsvpLabel(lobby.viewer_reminded)}
      </button>
      {reminder.isError ? (
        <Text as="p" variant="footnote" color="red-01">
          {lobbyErrorMessage(reminder.error, RSVP_FAILED)}
        </Text>
      ) : null}
    </section>
  );
}
