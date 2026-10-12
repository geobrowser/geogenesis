'use client';

import * as React from 'react';

import { BOTTOM_STACK, useAppBottomInset, useAppBottomInsetBelow } from '~/core/app-bottom-inset';

import { Text } from '~/design-system/text';

import { GeoChatRequestError } from '../api';
import { debateSurfaceAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { lobbyErrorMessage } from './lobby-format';
import type { MemberLobbyPageView } from './lobby-view';
import { useLobbyHand } from './moderation-hooks';

/** The intent `HubPillButton` gives a hub pill, for the raised-hand pill drawn without it. */
const HUB_PILL_INTENT = debateSurfaceAnalyticsAttributes('hub', 'action')['data-geo-analytics-intent'];

export const LOBBY_CONTROL_COPY = {
  hint: 'Request someone on a claim, or tap a person to request them directly.',
  listener: 'You can still vote and request debates.',
  handRaised: 'Hosts can see your hand.',
  leave: 'Leave lobby',
} as const;

/**
 * The lobby's bottom bar (GEO-3131, GEO-3137): voice, the hand, a hint and Leave. Sticky, so on a
 * phone it stays under either tab. `controlsRef` is where voice draws Mute or "Listening".
 */
export function LobbyControlBar({
  controlsRef,
  hand,
  availability,
  showHint,
  leave,
  banner,
  notices,
}: {
  controlsRef: (element: HTMLElement | null) => void;
  /** A listener's Raise hand, with its own hint. */
  hand?: React.ReactNode;
  /** The availability pill, on a phone. */
  availability?: React.ReactNode;
  showHint: boolean;
  leave: React.ReactNode;
  /** A guest’s create-account banner, above the controls. */
  banner?: React.ReactNode;
  /** Toasts, stacked just above the bar whatever its height. */
  notices?: React.ReactNode;
}) {
  const [footer, setFooter] = React.useState<HTMLElement | null>(null);
  const height = useElementHeight(footer);
  // Docked over the upload banner when it shows; the launcher and dropdowns keep clear of both.
  useAppBottomInset('lobby-control-bar', height, height > 0, BOTTOM_STACK.lobbyControlBar);
  const below = useAppBottomInsetBelow(BOTTOM_STACK.lobbyControlBar);

  return (
    <footer
      ref={setFooter}
      style={below > 0 ? { bottom: below } : undefined}
      className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-grey-02 bg-white px-8 py-3 md:gap-2.5 md:px-4 md:pt-2.5 md:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      data-testid="lobby-control-bar"
    >
      <div className="pointer-events-none absolute inset-x-4 bottom-full mb-3 flex flex-col items-center gap-2">
        {notices}
      </div>
      {banner}
      <div className="flex min-w-0 items-center gap-2">
        <div ref={controlsRef} className="contents" />
        {hand}
        {availability ? <div className="flex min-w-0 flex-1 items-center">{availability}</div> : null}
        {hand || availability ? null : showHint ? (
          <>
            <Text as="p" variant="footnote" color="grey-04" className="min-w-0 flex-1 md:hidden">
              {LOBBY_CONTROL_COPY.hint}
            </Text>
            <span className="hidden flex-1 md:block" />
          </>
        ) : (
          <span className="flex-1" />
        )}
        {leave}
      </div>
    </footer>
  );
}

/** The element's border-box height, kept current as it resizes; 0 until measured. */
function useElementHeight(element: HTMLElement | null) {
  const [height, setHeight] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!element) return;
    setHeight(element.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return height;
}

/** Raise hand / "Hand raised · Lower", for a listener who is in the lobby, with its hint. */
export function LobbyHandControl({ lobby }: { lobby: Pick<MemberLobbyPageView, 'lobby_id' | 'viewer'> }) {
  const hand = useLobbyHand(lobby.lobby_id);
  const raised = Boolean(lobby.viewer.hand_raised_at);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" data-testid="lobby-hand-control">
      {raised ? (
        <button
          type="button"
          aria-pressed
          data-geo-analytics-label="Lobby lower hand"
          data-geo-analytics-intent={HUB_PILL_INTENT}
          disabled={hand.isPending}
          aria-busy={hand.isPending || undefined}
          onClick={() => hand.mutate(false)}
          className="inline-flex h-7 shrink-0 items-center rounded-full border border-ctaPrimary bg-ctaTertiary px-3 text-metadata whitespace-nowrap text-ctaPrimary disabled:opacity-50 md:h-10"
        >
          Hand raised · Lower
        </button>
      ) : (
        <HubPillButton
          analyticsLabel="Lobby raise hand"
          aria-pressed={false}
          pending={hand.isPending}
          onClick={() => hand.mutate(true)}
          className="md:h-10"
        >
          <span className="inline-flex items-center gap-1.5">
            <HandIcon />
            Raise hand
          </span>
        </HubPillButton>
      )}
      <Text
        as="p"
        variant="footnote"
        color={hand.isError ? 'red-01' : 'grey-04'}
        className={hand.isError ? 'min-w-0 flex-1' : 'min-w-0 flex-1 md:hidden'}
      >
        {hand.isError
          ? handErrorMessage(hand.error)
          : raised
            ? LOBBY_CONTROL_COPY.handRaised
            : LOBBY_CONTROL_COPY.listener}
      </Text>
    </div>
  );
}

function handErrorMessage(error: unknown) {
  if (error instanceof GeoChatRequestError) {
    if (error.code === 'lobby_not_present') return 'Join the lobby to raise your hand.';
    if (error.code === 'lobby_stepped_out') return 'You stepped out. Go back to the room to raise your hand.';
  }
  return lobbyErrorMessage(error, 'Could not change your hand. Try again.');
}

function HandIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 11V6a2 2 0 0 0-4 0" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" />
    </svg>
  );
}
