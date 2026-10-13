'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import { LobbyRow } from './lobbies-card';

/** How long the pointer rests on the Debate button before the list opens, and off both before it closes. */
const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 200;

/**
 * The live lobbies on hover over the navbar's Debate button (GEO-3268), so a desktop visitor can
 * see who is in the room and join without opening the panel. The rows are the panel card's own.
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
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const openSoon = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    clear();
    timer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };
  const closeSoon = () => {
    clear();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  React.useEffect(() => clear, []);

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
            <Text as="h3" variant="footnoteMedium" color="text">
              Live debate lobbies
            </Text>
            <ul className="flex flex-col divide-y divide-grey-02">
              {lobbies.map(lobby => (
                <LobbyRow key={lobby.lobby_id} lobby={lobby} entry="nav" />
              ))}
            </ul>
          </section>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
