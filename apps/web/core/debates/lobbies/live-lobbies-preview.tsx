'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import Link from 'next/link';

import { useHoverIntent } from '~/core/hooks/use-hover-intent';

import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import { debateAnalyticsLabel, hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { hubPillClassName } from '../matchmaking/hub-pill-button';
import { debateRoomPath } from '../rooms/room-routes';
import { markLobbyEntry } from './lobby-analytics';
import { LobbyByline } from './lobby-host-names';
import { LobbyAvatarStack } from './lobby-people';
import { LiveDot, joinLabel, liveLobbyCounts } from './lobby-spotlight';

/** How long the pointer rests on the Debate button before the list opens, and off both before it closes. */
const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 200;

/**
 * The live lobbies on hover over the navbar's Debate button (GEO-3268), so a desktop visitor can
 * see who is in the room and join without opening the panel.
 *
 * Mouse only. A tap on a phone or tablet goes straight to the button's click, which opens the
 * panel and its spotlight; a keyboard user gets the same from Enter. `disabled` keeps it shut
 * while the panel is already open, where the same lobbies are on screen.
 */
export function LiveLobbiesPreview({
  lobbies,
  disabled,
  children,
}: {
  lobbies: DebateLobbySummary[];
  disabled: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const intent = useHoverIntent({ openDelay: OPEN_DELAY_MS, closeDelay: CLOSE_DELAY_MS });
  const clear = intent.cancel;
  const openSoon = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    intent.openSoon(() => setOpen(true));
  };
  const closeSoon = () => intent.closeSoon(() => setOpen(false));

  const shown = open && !disabled && lobbies.length > 0;

  return (
    <Popover.Root open={shown} onOpenChange={next => (next ? null : setOpen(false))}>
      <Popover.Anchor asChild>
        {/* The button keeps its own click: it opens the panel, and closing this list on the way. */}
        <div
          className="flex"
          onPointerEnter={openSoon}
          onPointerLeave={closeSoon}
          onClickCapture={() => {
            clear();
            setOpen(false);
          }}
        >
          {children}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          // Opened by hover, so focus stays on the page rather than jumping into the list.
          onOpenAutoFocus={event => event.preventDefault()}
          onPointerEnter={clear}
          onPointerLeave={closeSoon}
          // Every row here is a Join link, so a click is leaving for the lobby.
          onClickCapture={() => setOpen(false)}
          className="z-[210] w-[320px] rounded-lg border border-grey-02 bg-white p-3 shadow-dropdown"
          data-testid="live-lobbies-preview"
        >
          <section aria-label="Live debate lobbies" className="flex flex-col gap-3">
            {/* One heading says they are all live, so the rows leave out their own Live line. */}
            <span className="inline-flex items-center gap-1.5">
              <LiveDot />
              <Text as="h3" variant="footnoteMedium" color="text">
                {lobbies.length > 1 ? `${lobbies.length} live debate lobbies` : 'Live debate lobby'}
              </Text>
            </span>
            <ul className="flex flex-col divide-y divide-grey-02">
              {lobbies.map(lobby => (
                <LiveLobbyRow key={lobby.lobby_id} lobby={lobby} />
              ))}
            </ul>
          </section>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** One live lobby: its name, who is there, Join, and its hosts. */
export function LiveLobbyRow({ lobby }: { lobby: DebateLobbySummary }) {
  const href = debateRoomPath(lobby.lobby_id);
  const enter = () => markLobbyEntry(lobby.lobby_id, 'nav');
  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0" data-testid="live-lobby-row">
      <Link href={href} onClick={enter} className="min-w-0 hover:underline">
        <Text as="p" variant="metadataMedium" className="truncate">
          {lobby.name}
        </Text>
      </Link>
      <div className="flex items-center gap-2.5">
        <LobbyAvatarStack people={lobby.avatars} total={lobby.headcount} />
        <Text as="span" variant="footnote" color="text" className="min-w-0 flex-1 truncate">
          {liveLobbyCounts(lobby)}
        </Text>
        <Link
          href={href}
          onClick={enter}
          {...hubAnalyticsAttributes(
            lobby.viewer_on_roster ? 'Live lobbies preview Open' : 'Live lobbies preview Join',
            'join_lobby'
          )}
          className={hubPillClassName(lobby.viewer_on_roster ? 'secondary' : 'primary')}
        >
          {joinLabel(lobby, true)}
        </Link>
      </div>
      {lobby.hosts.length > 0 ? (
        <Text as="p" variant="footnote" color="grey-04" className="truncate">
          <LobbyByline
            lobby={lobby}
            analyticsLabel={debateAnalyticsLabel('hub', 'Live lobbies preview host')}
            hostedBy
          />
        </Text>
      ) : null}
    </li>
  );
}
