'use client';

import cx from 'classnames';
import Link from 'next/link';

import { useDismissedNotices } from '~/core/hooks/use-dismissed-notice';

import { CloseSmall } from '~/design-system/icons/close-small';
import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import type { LobbyLineup } from '../lobbies/live-lobbies';
import { LobbyByline } from '../lobbies/lobby-host-names';
import { LobbyReminderError, useLobbyReminderPress } from '../lobbies/lobby-reminder-press';
import { LiveLobbySpotlight, SPOTLIGHT_SECONDARY_PILL_CLASS_NAME } from '../lobbies/lobby-spotlight';
import { LobbyRsvpPill, lobbyBadgeTime, lobbyDayLabel, lobbyWhenLabel } from '../lobbies/upcoming-lobbies';
import { useMinuteNow } from '../lobbies/use-minute-now';
import { sameId } from '../rooms/room-presence';
import { claimCalendarPicks, personCalendarPicks } from './debate-calendar-route';
import { debateAnalyticsLabel, hubAnalyticsAttributes } from './hub-analytics';
import { useHubAskState } from './hub-ask-context';
import { HUB_LIGHT_CALLOUT_CLASS_NAME, HubCalloutTitle } from './hub-callout';
import { HubCalloutStack, type HubStackCard } from './hub-callout-stack';
import { HUB_ICON_BUTTON_CLASS_NAME, hubPillClassName } from './hub-pill-button';
import { LobbyDetailsPopover } from './lobby-details-popover';
import { AskTimer } from './requesting-pill';
import { useCalendarHref } from './use-calendar-href';
import { useDebatesHub } from './use-debates-hub';
import { type EndedAsk, type OutgoingAsk, useAskClock } from './use-outgoing-ask';
import { stackLiveLobbyNoticeId, useStackLobbies } from './use-stack-lobbies';

const STRIP_CLASS_NAME = 'mx-4 mb-3 flex h-11 shrink-0 items-center gap-2 overflow-hidden rounded-lg pr-2 pl-3';

const STRIP_PILL_CLASS_NAME = hubPillClassName('primary', 'px-3.5 md:h-8');

/**
 * What sits above the tabs (GEO-3463), and nothing at all when none of it applies, so the tabs and
 * the list start right under the header rather than under the banners that used to stack there.
 *
 * Your open ask — who was asked, the time left, Cancel — and once it ends unanswered, that nobody
 * took it, with Schedule: a 44px strip, alone. It sits outside the tabs, so the ask stays in view on
 * every tab while it runs.
 *
 * Otherwise the callouts, as one stack (GEO-3586): the first in full, the next two as edges beneath
 * it, each dismissed on its own. In order:
 *  1. the live lobbies, as one card (`LiveLobbySpotlight`): the busiest large, the others listed;
 *  2. the soonest upcoming lobby within the week the viewer hasn't answered;
 *  3. the Today's claims callout (GEO-3498);
 *  4. the other upcoming lobbies, soonest first.
 *
 * The upcoming lobbies are the Requests timeline's unanswered ones (GEO-3519), so signed in, a lobby
 * RSVP'd to, hosted or dismissed there is not here. Signed out, every lobby opening that week.
 */
export function HubLiveStrip({
  lineup,
  todaysCallout = null,
}: {
  lineup: LobbyLineup;
  /** The Today's claims callout, or null when there is none to show. */
  todaysCallout?: React.ReactNode;
}) {
  const { ask, ended, cancel, cancelling, dismissEnded } = useHubAskState();
  const { isDismissed, remember } = useDismissedNotices();
  const upcoming = useStackLobbies();

  if (ask) return <AskStrip ask={ask} onCancel={cancel} cancelling={cancelling} />;
  if (ended) return <EndedAskStrip ended={ended} onDismiss={dismissEnded} />;

  const live = lineup.live.filter(lobby => !isDismissed(stackLiveLobbyNoticeId(lobby.lobby_id)));
  // Signed out, the list and the week are polled apart, so a lobby that has just opened can still be
  // upcoming in the week: it is the live card's, never both.
  const [soonest, ...later] = upcoming.lobbies.filter(
    lobby => !lineup.live.some(open => sameId(open.lobby_id, lobby.lobby_id))
  );
  const lobbyCard = (lobby: DebateLobbySummary): HubStackCard => ({
    id: `lobby:${lobby.lobby_id}`,
    surface: 'light',
    label: `upcoming lobby ${lobby.name}`,
    content: <UpcomingLobbyCallout lobby={lobby} onDismiss={() => upcoming.dismiss(lobby.lobby_id)} />,
  });

  const cards: HubStackCard[] = [
    ...(live.length > 0
      ? [
          {
            // One card for every live lobby, so a lobby going live mid-stack doesn't reset it.
            id: 'live',
            surface: 'dark' as const,
            label: live.length > 1 ? 'live lobbies' : 'live lobby',
            content: (
              <LiveLobbySpotlight
                lineup={{ live }}
                onDismiss={() => remember(live.map(lobby => stackLiveLobbyNoticeId(lobby.lobby_id)))}
              />
            ),
          },
        ]
      : []),
    ...(soonest ? [lobbyCard(soonest)] : []),
    ...(todaysCallout
      ? [{ id: 'todays-claims', surface: 'tint' as const, label: 'Today’s claims', content: todaysCallout }]
      : []),
    ...later.map(lobbyCard),
  ];

  return <HubCalloutStack cards={cards} />;
}

/**
 * How much of the ask's own lifetime is left, for the bar under it. Measured from the request's
 * timestamps rather than from geo-chat's timeouts written down here, so it cannot drift from them.
 */
export function askShareLeft(ask: Pick<OutgoingAsk, 'createdAt' | 'expiresAt'>, remainingMs: number) {
  const lifetime = Date.parse(ask.expiresAt) - Date.parse(ask.createdAt);
  if (!Number.isFinite(lifetime) || lifetime <= 0) return 0;
  return Math.max(0, Math.min(1, remainingMs / lifetime));
}

export function askTitle(ask: OutgoingAsk) {
  return ask.kind === 'person' ? `Requesting ${ask.recipientName}` : 'Requesting · people who disagree';
}

function AskStrip({ ask, onCancel, cancelling }: { ask: OutgoingAsk; onCancel: () => void; cancelling: boolean }) {
  const { remainingMs, label } = useAskClock(ask.expiresAt);
  const share = askShareLeft(ask, remainingMs);

  return (
    <section
      aria-label="Your open request"
      data-testid="hub-strip-ask"
      className={cx(STRIP_CLASS_NAME, 'relative bg-text text-white')}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-metadataMedium">{askTitle(ask)}</span>
        {ask.kind === 'claim' ? <span className="truncate text-footnote text-grey-03">{ask.claim.claim}</span> : null}
      </div>
      <AskTimer remainingMs={remainingMs} className="shrink-0 text-metadata">
        {label}
      </AskTimer>
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelling}
        {...hubAnalyticsAttributes('Strip cancel request', 'withdraw_debate_request')}
        className={cx(SPOTLIGHT_SECONDARY_PILL_CLASS_NAME, 'disabled:opacity-50 md:h-8')}
      >
        {cancelling ? 'Cancelling…' : 'Cancel'}
      </button>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.75 bg-white/15">
        <span
          className="block h-full bg-green transition-[width] duration-1000 ease-linear"
          style={{ width: `${share * 100}%` }}
        />
      </span>
    </section>
  );
}

/**
 * The ask ran out without an accept. Declined and expired look the same from here — telling them
 * apart needs geo-chat (GEO-3464) — so this says what both mean and offers the way forward.
 */
function EndedAskStrip({ ended, onDismiss }: { ended: EndedAsk; onDismiss: () => void }) {
  const { close } = useDebatesHub();
  const href = useCalendarHref(
    ended.kind === 'claim'
      ? claimCalendarPicks(ended.claim.space_id, ended.claim.claim_entity_id)
      : personCalendarPicks(ended.recipientProfileSpaceId)
  );

  return (
    <section
      aria-label="Your request ended"
      data-testid="hub-strip-ended"
      className={cx(STRIP_CLASS_NAME, 'border border-grey-02 bg-white')}
    >
      <span className="min-w-0 flex-1 truncate text-metadataMedium text-text">
        {ended.kind === 'person' ? `${ended.recipientName} can’t right now` : 'Nobody took it this time'}
      </span>
      <Link
        href={href}
        onClick={() => {
          onDismiss();
          close();
        }}
        {...hubAnalyticsAttributes('Strip schedule after request', 'open_debate_calendar')}
        className={STRIP_PILL_CLASS_NAME}
      >
        Schedule
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        {...hubAnalyticsAttributes('Strip dismiss ended request')}
        className={HUB_ICON_BUTTON_CLASS_NAME}
      >
        <CloseSmall />
      </button>
    </section>
  );
}

/**
 * An upcoming lobby in the stack (GEO-3586). Light, not the live card's black (Preston, 26 Oct):
 * black means "happening now", and a lobby on Tuesday is not. The name opens the lobby's details,
 * and RSVP is the Requests timeline's: signed out it queues the sign-up (`useLobbyReminderPress`).
 * Once it lands the card leaves the stack (`useStackLobbies`); the lobby stays in Requests as one
 * the viewer is going to.
 */
function UpcomingLobbyCallout({ lobby, onDismiss }: { lobby: DebateLobbySummary; onDismiss: () => void }) {
  const remind = useLobbyReminderPress(lobby);
  const now = useMinuteNow();

  // One press for both copies of it: the card's and the details'.
  const rsvp = (
    <LobbyRsvpPill
      remind={remind}
      analyticsLabel={debateAnalyticsLabel('hub', `Callout lobby ${remind.reminded ? 'Going' : 'RSVP'}`)}
    />
  );

  return (
    <section
      aria-label="Upcoming lobby"
      data-testid="hub-callout-upcoming-lobby"
      className={HUB_LIGHT_CALLOUT_CLASS_NAME}
    >
      <HubCalloutTitle as="h3" title="Upcoming lobby">
        <button
          type="button"
          aria-label="Dismiss upcoming lobby"
          onClick={onDismiss}
          {...hubAnalyticsAttributes('Callout lobby dismiss')}
          className={HUB_ICON_BUTTON_CLASS_NAME}
        >
          <CloseSmall />
        </button>
      </HubCalloutTitle>
      <div className="mt-3 flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="flex h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-grey-01 px-2"
        >
          <span className="text-footnoteMedium text-grey-04">{lobbyDayLabel(lobby.starts_at)}</span>
          <span className="text-metadataMedium font-semibold whitespace-nowrap">{lobbyBadgeTime(lobby.starts_at)}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <LobbyDetailsPopover
            lobby={lobby}
            now={now}
            rsvp={rsvp}
            className="min-w-0 truncate text-left text-metadataMedium underline-offset-2 hover:underline"
          >
            <span className="sr-only">{lobbyWhenLabel(lobby.starts_at, ' · ')}: </span>
            {lobby.name}
          </LobbyDetailsPopover>
          <Text as="p" variant="footnote" color="grey-04" className="truncate">
            <LobbyByline lobby={lobby} analyticsLabel={UPCOMING_HOST_LABEL} hostedBy />
          </Text>
        </div>
        {rsvp}
      </div>
      <LobbyReminderError error={remind.error} className="mt-2" />
    </section>
  );
}

const UPCOMING_HOST_LABEL = debateAnalyticsLabel('hub', 'Callout lobby host');
