'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { dashlessId } from '~/core/debates/api';
import type { DebateLobbySummary } from '~/core/debates/api';
import { useLobbyLineup } from '~/core/debates/lobbies/live-lobbies';
import { markLobbyEntry } from '~/core/debates/lobbies/lobby-analytics';
import { LobbyByline } from '~/core/debates/lobbies/lobby-host-names';
import { LobbyAvatarStack } from '~/core/debates/lobbies/lobby-people';
import {
  LOBBY_BODY_TEXT_CLASS_NAME,
  LOBBY_DARK_SURFACE_STYLE,
  LiveDot,
  LiveMark,
  SPOTLIGHT_SECONDARY_PILL_CLASS_NAME,
  joinLabel,
  liveLobbyCounts,
} from '~/core/debates/lobbies/lobby-spotlight';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import { useDismissedNotices } from '~/core/hooks/use-dismissed-notice';

import { ClientOnly } from '~/design-system/client-only';
import { Text } from '~/design-system/text';

import { EXPLORE_BANNER_CLASS_NAME, ExploreBannerCloseButton } from './explore-welcome-banner';

/** The dismissed-notice id for one lobby's banner. Per lobby, so the next lobby to go live shows again. */
export function lobbyBannerNoticeId(lobbyId: string) {
  return `exploreLiveLobby:${dashlessId(lobbyId)}`;
}

/**
 * Live debate lobbies, above the Explore feed (GEO-3268). The welcome banner's dark shell and
 * close button, in the same slot, so a live lobby is the first thing on the page.
 *
 * Leads with the busiest live lobby and lists the others under it. A lobby the viewer is already
 * in is left out: the banner is an invitation, and they have accepted it. Dismissing hides the
 * lobbies on screen for good, and only those, so the next lobby to go live brings it back.
 */
export function ExploreLiveLobbiesBanner() {
  return (
    <ClientOnly>
      <LiveLobbiesBanner />
    </ClientOnly>
  );
}

function LiveLobbiesBanner() {
  const { live } = useLobbyLineup();
  const { isDismissed, remember } = useDismissedNotices();

  const shown = live.filter(lobby => !lobby.viewer_on_roster && !isDismissed(lobbyBannerNoticeId(lobby.lobby_id)));
  const [lead, ...others] = shown;
  if (!lead) return null;

  const dismiss = () => remember(shown.map(lobby => lobbyBannerNoticeId(lobby.lobby_id)));

  return (
    <section
      aria-label={others.length > 0 ? 'Live debate lobbies' : 'Live debate lobby'}
      className={EXPLORE_BANNER_CLASS_NAME}
      style={LOBBY_DARK_SURFACE_STYLE}
      data-testid="explore-live-lobbies-banner"
    >
      <div className="flex items-center gap-5 py-5 pr-14 pl-5 mobile:flex-col mobile:items-start mobile:gap-3 mobile:pr-5">
        <div className="min-w-0 flex-1">
          <h2 className="flex min-w-0 items-center gap-2 text-smallTitle text-white mobile:pr-9">
            <LiveDot className="size-2" />
            <span className="truncate">{lead.name} is live</span>
          </h2>
          <p className={cx('mt-2 text-white', LOBBY_BODY_TEXT_CLASS_NAME)}>
            {liveLobbyCounts(lead)}
            {lead.hosts.length > 0 ? ' · ' : null}
            <LobbyByline lobby={lead} analyticsLabel="Explore live lobby host" hostedBy />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-5">
          <LobbyAvatarStack people={lead.avatars} total={lead.headcount} />
          <Link
            href={debateRoomPath(lead.lobby_id)}
            onClick={() => markLobbyEntry(lead.lobby_id, 'explore_banner')}
            data-geo-analytics-label="Explore live lobby Join"
            data-geo-analytics-intent="join_lobby"
            className="inline-flex h-7 shrink-0 items-center rounded-full bg-white px-2.5 text-[16px] leading-[13px] tracking-[-0.35px] whitespace-nowrap text-text transition-colors hover:bg-white/90 md:h-11 md:px-4"
          >
            {joinLabel(lead)}
          </Link>
        </div>
      </div>

      {others.length > 0 ? (
        <ul className="mx-5 flex flex-col border-t border-white/15">
          {others.map(lobby => (
            <AlsoLiveRow key={lobby.lobby_id} lobby={lobby} />
          ))}
        </ul>
      ) : null}

      <ExploreBannerCloseButton
        label={others.length > 0 ? 'Dismiss live lobbies' : 'Dismiss live lobby'}
        analyticsLabel="Explore live lobby dismiss"
        onClick={dismiss}
      />
    </section>
  );
}

function AlsoLiveRow({ lobby }: { lobby: DebateLobbySummary }) {
  return (
    <li className="flex min-w-0 items-center gap-3 py-3" data-testid="explore-also-live-row">
      <LiveMark count={1} className="inline-flex shrink-0 items-center gap-1.5 mobile:hidden" />
      <Text as="span" variant="metadataMedium" color="white" className="min-w-0 truncate">
        {lobby.name}
      </Text>
      <Text as="span" variant="footnote" color="grey-03" className="min-w-0 flex-1 truncate">
        {liveLobbyCounts(lobby)}
      </Text>
      <Link
        href={debateRoomPath(lobby.lobby_id)}
        onClick={() => markLobbyEntry(lobby.lobby_id, 'explore_banner')}
        data-geo-analytics-label="Explore also live lobby Join"
        data-geo-analytics-intent="join_lobby"
        className={SPOTLIGHT_SECONDARY_PILL_CLASS_NAME}
      >
        {joinLabel(lobby, true)}
      </Link>
    </li>
  );
}
