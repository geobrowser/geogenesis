'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateLobbyMember } from '~/core/debates/api';
import { personName } from '~/core/debates/lobbies/lobby-format';
import { useLobbyVoiceStates } from '~/core/debates/lobbies/lobby-voice';
import { sameId } from '~/core/debates/rooms/room-presence';
import { TrackVideo } from '~/core/debates/track-video';

import { Avatar } from '~/design-system/avatar';
import { Fullscreen } from '~/design-system/icons/full-screen';
import { Text } from '~/design-system/text';

export const CALL_SCREEN_COPY = {
  sharing: (name: string) => `${name} is sharing their screen`,
  fullscreen: 'Full screen',
  shares: 'Shared screens',
  sharingTag: 'Sharing',
  show: (name: string) => `Show ${name}’s screen`,
} as const;

/** Sharers oldest first, and the one the viewer picked by hand while it is live. */
export type ScreenShares = { order: readonly string[]; picked: string | null };

export const NO_SCREEN_SHARES: ScreenShares = { order: [], picked: null };

/**
 * Follows the live sharers: an ended share drops out (and with it a pick of it), a new one goes
 * last. Sharers already live on the first pass keep LiveKit's order.
 */
export function nextScreenShares(current: ScreenShares, live: readonly string[]): ScreenShares {
  const liveIds = new Set(live);
  const order = current.order.filter(id => liveIds.has(id));
  for (const id of live) if (!order.includes(id)) order.push(id);
  const picked = current.picked !== null && liveIds.has(current.picked) ? current.picked : null;
  const same = picked === current.picked && order.length === current.order.length;
  return same && order.every((id, index) => id === current.order[index]) ? current : { order, picked };
}

/** The viewer's pick, else the most recent share. */
export function shownScreenShare(shares: ScreenShares): string | null {
  return shares.picked ?? shares.order[shares.order.length - 1] ?? null;
}

type ScreenShareChoice = { sharers: readonly string[]; shown: string | null; show: (sharerId: string) => void };

const ScreenShareChoiceContext = React.createContext<ScreenShareChoice | null>(null);

/** Who is sharing and whose screen the stage shows; null outside a stage. Ids are voice ids. */
export function useScreenShareChoice() {
  return React.useContext(ScreenShareChoiceContext);
}

/**
 * A shared screen gets the big tile above the speakers (GEO-3419). With several, the most recent
 * shows unless the viewer picks another from the chips or a speaker's tile (`children`).
 */
export function CallScreenStage({
  members,
  children,
}: {
  members: readonly DebateLobbyMember[];
  /** The people below the stage, which can switch it. */
  children?: React.ReactNode;
}) {
  const { screens } = useLobbyVoiceStates();
  const frameRef = React.useRef<HTMLDivElement>(null);
  const live = screens ? [...screens.keys()] : [];

  // The previous state, fed back in: a render that changes nothing returns it and stops.
  const [state, setState] = React.useState(NO_SCREEN_SHARES);
  const shares = nextScreenShares(state, live);
  if (shares !== state) setState(shares);

  const shownId = shownScreenShare(shares);
  const show = React.useCallback((sharerId: string) => setState(current => ({ ...current, picked: sharerId })), []);
  const choice = React.useMemo<ScreenShareChoice>(
    () => ({ sharers: shares.order, shown: shownId, show }),
    [shares.order, shownId, show]
  );

  const track = shownId ? screens?.get(shownId) : undefined;
  const nameOf = (sharerId: string) => {
    const member = members.find(candidate => sameId(candidate.user_id, sharerId));
    return { member, name: member ? personName(member) : 'Someone' };
  };
  const label = CALL_SCREEN_COPY.sharing(shownId ? nameOf(shownId).name : 'Someone');
  // Phones' Safari has no element full screen; the tile is already the page's width there.
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  return (
    <ScreenShareChoiceContext.Provider value={choice}>
      {shownId && track ? (
        <section aria-label={label} className="flex flex-col gap-2" data-testid="call-screen-stage">
          {shares.order.length > 1 ? (
            <ul aria-label={CALL_SCREEN_COPY.shares} className="flex flex-wrap gap-2">
              {shares.order.map(sharerId => {
                const { member, name } = nameOf(sharerId);
                const selected = sharerId === shownId;
                return (
                  <li key={sharerId} className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={CALL_SCREEN_COPY.show(name)}
                      onClick={() => show(sharerId)}
                      className={cx(
                        'flex max-w-full min-w-0 items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-metadataMedium',
                        selected
                          ? 'border-text bg-text text-white'
                          : 'border-grey-02 bg-white text-text hover:border-grey-03'
                      )}
                    >
                      <span className="size-5 shrink-0 overflow-hidden rounded-full [&>svg]:size-full">
                        <Avatar avatarUrl={member?.avatar_cid} value={member?.profile_space_id} alt="" size={20} />
                      </span>
                      <span className="truncate">{name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div ref={frameRef} className="relative aspect-video w-full overflow-hidden rounded-xl bg-text">
            <TrackVideo key={shownId} track={track.publication.track} fit="contain" data-testid="call-screen-video" />
            {canFullscreen ? (
              <button
                type="button"
                onClick={() => void frameRef.current?.requestFullscreen().catch(() => undefined)}
                className="absolute top-3 right-3 flex items-center gap-1 rounded-md bg-text/70 px-2 py-1.5 text-metadataMedium text-white"
              >
                <Fullscreen color="white" />
                {CALL_SCREEN_COPY.fullscreen}
              </button>
            ) : null}
          </div>
          <Text as="p" variant="footnote" color="grey-04">
            {label}
          </Text>
        </section>
      ) : null}
      {children}
    </ScreenShareChoiceContext.Provider>
  );
}
