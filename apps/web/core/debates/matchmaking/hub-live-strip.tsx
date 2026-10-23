'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { urlWithoutModal } from '~/core/deep-links/modal-deep-link';

import { CloseSmall } from '~/design-system/icons/close-small';

import type { DebateLobbySummary } from '../api';
import type { LobbyLineup } from '../lobbies/live-lobbies';
import { markLobbyEntry } from '../lobbies/lobby-analytics';
import { hereLabel, lobbyTimeLabel, rsvpLabel } from '../lobbies/lobby-format';
import { LobbyReminderError, useLobbyReminderPress } from '../lobbies/lobby-reminder-press';
import { LOBBY_DARK_SURFACE_CLASS_NAME, LiveDot, joinLabel } from '../lobbies/lobby-spotlight';
import { useMinuteNow } from '../lobbies/use-minute-now';
import { debateRoomPath } from '../rooms/room-routes';
import { claimPickKey } from './calendar-narrowing';
import { calendarHref } from './debate-calendar-route';
import { hubAnalyticsAttributes } from './hub-analytics';
import { useDebatesHub } from './use-debates-hub';
import { type EndedAsk, type OutgoingAsk, useAskClock, useOutgoingAsk } from './use-outgoing-ask';

/** Claim requests live 90 s and challenges 2 min (geo-chat); the bar's width is measured against these. */
const ASK_LIFETIME_MS: Record<OutgoingAsk['kind'], number> = { claim: 90_000, person: 120_000 };

const STRIP_CLASS_NAME = 'mx-4 mb-3 flex h-11 shrink-0 items-center gap-2 overflow-hidden rounded-lg pr-2 pl-3';

const STRIP_PILL_CLASS_NAME =
  'inline-flex h-7 shrink-0 items-center justify-center rounded-full px-3.5 text-metadata whitespace-nowrap transition-colors md:h-8';

/**
 * The one strip above the tabs (GEO-3463). At most one, 44px, and nothing at all when none of these
 * apply — so the tabs and the list start right under the header, rather than under the banners and
 * the lobby card that used to stack there.
 *
 * In priority order:
 *  1. your open ask — who was asked, the time left, Cancel — and once it ends unanswered, that nobody
 *     took it, with Schedule;
 *  2. a live lobby;
 *  3. the next scheduled lobby, when none is live.
 *
 * It sits outside the tabs, so the ask stays in view on every tab while it runs.
 */
export function HubLiveStrip({ lineup }: { lineup: LobbyLineup }) {
  const { ask, ended, cancel, cancelling, dismissEnded } = useOutgoingAsk();

  if (ask) return <AskStrip ask={ask} onCancel={cancel} cancelling={cancelling} />;
  if (ended) return <EndedAskStrip ended={ended} onDismiss={dismissEnded} />;

  const [live] = lineup.live;
  if (live) return <LiveLobbyStrip lobby={live} />;

  const next = lineup.soon ?? lineup.later[0] ?? null;
  if (next) return <NextLobbyStrip lobby={next} />;

  return null;
}

function askTitle(ask: OutgoingAsk) {
  return ask.kind === 'person' ? `Requesting ${ask.recipientName}` : 'Requesting · people who disagree';
}

function AskStrip({ ask, onCancel, cancelling }: { ask: OutgoingAsk; onCancel: () => void; cancelling: boolean }) {
  const { remainingMs, label } = useAskClock(ask.expiresAt);
  const lifetime = ASK_LIFETIME_MS[ask.kind];
  const share = Math.max(0, Math.min(1, remainingMs / lifetime));

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
      <span
        className="shrink-0 text-metadata tabular-nums"
        aria-label={`${Math.ceil(remainingMs / 1000)} seconds left`}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelling}
        {...hubAnalyticsAttributes('Strip cancel request', 'withdraw_debate_request')}
        className={cx(STRIP_PILL_CLASS_NAME, 'border border-white/30 text-white hover:bg-white/10 disabled:opacity-50')}
      >
        {cancelling ? 'Cancelling…' : 'Cancel'}
      </button>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = urlWithoutModal(pathname, searchParams, typeof window === 'undefined' ? '' : window.location.hash);
  const href = calendarHref(
    from,
    ended.kind === 'claim'
      ? { people: [], claims: [claimPickKey(ended.claim.space_id, ended.claim.claim_entity_id)], matchesOnly: false }
      : { people: [ended.recipientProfileSpaceId], claims: [], matchesOnly: false }
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
        className={cx(STRIP_PILL_CLASS_NAME, 'bg-text text-white hover:bg-text/90')}
      >
        Schedule
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        {...hubAnalyticsAttributes('Strip dismiss ended request')}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-grey-04 hover:bg-grey-01"
      >
        <CloseSmall />
      </button>
    </section>
  );
}

function LiveLobbyStrip({ lobby }: { lobby: DebateLobbySummary }) {
  return (
    <Link
      href={debateRoomPath(lobby.lobby_id)}
      onClick={() => markLobbyEntry(lobby.lobby_id, 'side_panel')}
      aria-label={`Live lobby ${lobby.name}, ${joinLabel(lobby, true).toLowerCase()}`}
      data-testid="hub-strip-live-lobby"
      {...hubAnalyticsAttributes(
        lobby.viewer_on_roster ? 'Lobby spotlight Open' : 'Lobby spotlight Join',
        'join_lobby'
      )}
      className={cx(STRIP_CLASS_NAME, LOBBY_DARK_SURFACE_CLASS_NAME, 'text-white')}
    >
      <LiveDot />
      <span className="shrink-0 text-footnoteMedium">Live</span>
      <span className="min-w-0 truncate text-metadataMedium">{lobby.name}</span>
      <span className="shrink-0 text-breadcrumb whitespace-nowrap text-grey-03">{hereLabel(lobby.headcount)}</span>
      <span aria-hidden className={cx(STRIP_PILL_CLASS_NAME, 'ml-auto bg-white text-text')}>
        {joinLabel(lobby, true)}
      </span>
    </Link>
  );
}

function NextLobbyStrip({ lobby }: { lobby: DebateLobbySummary }) {
  const remind = useLobbyReminderPress(lobby);
  const now = useMinuteNow();
  const when = lobbyTimeLabel(lobby.starts_at, now);

  return (
    <>
      <section
        aria-label="Next debate lobby"
        data-testid="hub-strip-next-lobby"
        className={cx(STRIP_CLASS_NAME, LOBBY_DARK_SURFACE_CLASS_NAME, 'text-white')}
      >
        <span className="shrink-0 text-footnoteMedium text-grey-03">Lobby</span>
        <span className="min-w-0 truncate text-metadataMedium">{lobby.name}</span>
        {when ? <span className="shrink-0 text-breadcrumb whitespace-nowrap text-grey-03">{when}</span> : null}
        <button
          type="button"
          {...hubAnalyticsAttributes(remind.reminded ? 'Lobby spotlight reminded' : 'Lobby spotlight remind me')}
          aria-pressed={remind.reminded}
          aria-busy={remind.pending || undefined}
          disabled={remind.pending}
          onClick={remind.press}
          className={cx(STRIP_PILL_CLASS_NAME, 'ml-auto bg-white text-text hover:bg-white/90 disabled:opacity-50')}
        >
          {rsvpLabel(remind.reminded)}
        </button>
      </section>
      <LobbyReminderError error={remind.error} />
    </>
  );
}
