'use client';

import cx from 'classnames';
import Link from 'next/link';

import { CloseSmall } from '~/design-system/icons/close-small';

import type { DebateLobbySummary } from '../api';
import { useGeoChatAuth } from '../hooks';
import type { LobbyLineup } from '../lobbies/live-lobbies';
import { lobbyTimeLabel } from '../lobbies/lobby-format';
import { LobbyReminderError, useLobbyReminderPress } from '../lobbies/lobby-reminder-press';
import { LiveLobbySpotlight, SPOTLIGHT_SECONDARY_PILL_CLASS_NAME } from '../lobbies/lobby-spotlight';
import { LobbyRsvpPill } from '../lobbies/upcoming-lobbies';
import { useMinuteNow } from '../lobbies/use-minute-now';
import { claimCalendarPicks, personCalendarPicks } from './debate-calendar-route';
import { debateAnalyticsLabel, hubAnalyticsAttributes } from './hub-analytics';
import { useHubAskState } from './hub-ask-context';
import { HUB_ICON_BUTTON_CLASS_NAME, hubPillClassName } from './hub-pill-button';
import { LobbyDetailsPopover } from './lobby-details-popover';
import { AskTimer } from './requesting-pill';
import { useCalendarHref } from './use-calendar-href';
import { useDebatesHub } from './use-debates-hub';
import { type EndedAsk, type OutgoingAsk, useAskClock } from './use-outgoing-ask';

const STRIP_CLASS_NAME = 'mx-4 mb-3 flex h-11 shrink-0 items-center gap-2 overflow-hidden rounded-lg pr-2 pl-3';

const STRIP_PILL_CLASS_NAME = hubPillClassName('primary', 'px-3.5 md:h-8');

/**
 * The one thing above the tabs (GEO-3463), and nothing at all when none of these apply, so the tabs
 * and the list start right under the header rather than under the banners that used to stack there.
 * A 44px strip, except a live lobby, which keeps its full card (Preston, 28 Oct).
 *
 * In priority order:
 *  1. your open ask — who was asked, the time left, Cancel — and once it ends unanswered, that nobody
 *     took it, with Schedule;
 *  2. a live lobby, as the full live card (`LiveLobbySpotlight`): every live lobby, Join for each;
 *  3. the Today's claims callout (GEO-3498), which waits for a live lobby but not a scheduled one;
 *  4. signed out, the next lobby still to open, when none is live.
 *
 * Signed in, a lobby still to open is not here: the Requests timeline is the place for those
 * (GEO-3519). Signed out there is no Requests tab, so the strip stays (Preston, 28 Oct).
 * It sits outside the tabs, so the ask stays in view on every tab while it runs.
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
  // Nothing while auth is still resolving, so a signed-in viewer never sees the strip flash.
  const { ready, authenticated } = useGeoChatAuth();

  if (ask) return <AskStrip ask={ask} onCancel={cancel} cancelling={cancelling} />;
  if (ended) return <EndedAskStrip ended={ended} onDismiss={dismissEnded} />;

  const [live] = lineup.live;
  if (live) return <LiveLobbySpotlight lineup={lineup} />;

  if (todaysCallout) return todaysCallout;

  if (ready && !authenticated && lineup.next) return <NextLobbyStrip lobby={lineup.next} />;

  return null;
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
 * The next lobby, for a signed-out visitor when none is live. Light, not the live strip's black
 * (Preston, 26 Oct): black means "happening now", and a lobby on Tuesday is not. The name opens the
 * lobby's details, and RSVP queues the sign-up (`useLobbyReminderPress`).
 */
function NextLobbyStrip({ lobby }: { lobby: DebateLobbySummary }) {
  const remind = useLobbyReminderPress(lobby);
  const now = useMinuteNow();
  const when = lobbyTimeLabel(lobby.starts_at, now);

  // The calendar's RSVP, Going black, on the strip's light surface. One press for both copies of it.
  const rsvp = (
    <LobbyRsvpPill
      remind={remind}
      analyticsLabel={debateAnalyticsLabel(
        'hub',
        remind.reminded ? 'Lobby spotlight reminded' : 'Lobby spotlight remind me'
      )}
      className="md:h-8"
    />
  );

  return (
    <>
      <section
        aria-label="Next debate lobby"
        data-testid="hub-strip-next-lobby"
        className={cx(STRIP_CLASS_NAME, 'border border-grey-02 bg-white text-text')}
      >
        <LobbyDetailsPopover
          lobby={lobby}
          now={now}
          rsvp={rsvp}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="shrink-0 text-footnoteMedium text-grey-04">Lobby</span>
          <span className="min-w-0 truncate text-metadataMedium underline-offset-2 hover:underline">{lobby.name}</span>
          {when ? <span className="shrink-0 text-breadcrumb whitespace-nowrap text-grey-04">{when}</span> : null}
        </LobbyDetailsPopover>
        {rsvp}
      </section>
      <LobbyReminderError error={remind.error} />
    </>
  );
}
