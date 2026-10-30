'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { CloseSmall } from '~/design-system/icons/close-small';
import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import type { DebateLobbySummary } from '../api';
import { EditLobbyButton, EditLobbyDialog, canEditLobby } from '../lobbies/edit-lobby-dialog';
import { useDebateLobby } from '../lobbies/hooks';
import type { LobbyLineup } from '../lobbies/live-lobbies';
import { markLobbyEntry } from '../lobbies/lobby-analytics';
import { lobbyDateLabel, lobbyTimeLabel, notYetOpenLabel } from '../lobbies/lobby-format';
import { usePreOpenHosts } from '../lobbies/lobby-host-lobbies';
import { LobbyHandoffScope } from '../lobbies/lobby-popup';
import { LobbyClaimListNames, LobbyGoing, LobbyHostedBy } from '../lobbies/lobby-pre-open-details';
import { LobbyReminderError, useLobbyReminderPress } from '../lobbies/lobby-reminder-press';
import { LiveLobbySpotlight, SPOTLIGHT_SECONDARY_PILL_CLASS_NAME } from '../lobbies/lobby-spotlight';
import { LobbyRsvpPill } from '../lobbies/upcoming-lobbies';
import { useMinuteNow } from '../lobbies/use-minute-now';
import { debateRoomPath } from '../rooms/room-routes';
import { claimCalendarPicks, personCalendarPicks } from './debate-calendar-route';
import { debateAnalyticsLabel, hubAnalyticsAttributes } from './hub-analytics';
import { useHubAskState } from './hub-ask-context';
import { HUB_ICON_BUTTON_CLASS_NAME, hubPillClassName } from './hub-pill-button';
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
 *  4. the next scheduled lobby, when none is live.
 *
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
  // An edit (GEO-3540) outlives the strip it began from, pinned to that lobby: the lobby opening
  // swaps the strip for the live one, and another lobby taking the next spot hands the same strip a
  // different lobby.
  const [editingId, setEditingId] = React.useState<string | null>(null);
  return (
    <>
      <HubLiveStripContent lineup={lineup} todaysCallout={todaysCallout} onEdit={setEditingId} />
      {editingId ? <EditFromStrip key={editingId} lobbyId={editingId} onClose={() => setEditingId(null)} /> : null}
    </>
  );
}

function HubLiveStripContent({
  lineup,
  todaysCallout,
  onEdit,
}: {
  lineup: LobbyLineup;
  todaysCallout: React.ReactNode;
  onEdit: (lobbyId: string) => void;
}) {
  const { ask, ended, cancel, cancelling, dismissEnded } = useHubAskState();

  if (ask) return <AskStrip ask={ask} onCancel={cancel} cancelling={cancelling} />;
  if (ended) return <EndedAskStrip ended={ended} onDismiss={dismissEnded} />;

  const [live] = lineup.live;
  if (live) return <LiveLobbySpotlight lineup={lineup} />;

  if (todaysCallout) return todaysCallout;

  const next = lineup.soon ?? lineup.later[0] ?? null;
  if (next) return <NextLobbyStrip lobby={next} onEdit={onEdit} />;

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
 * The next lobby, when none is live. Light, not the live strip's black (Preston, 26 Oct): black means
 * "happening now", and a lobby on Tuesday is not. The name opens the lobby's details — its full name,
 * when it opens, who hosts it, who is going and the claim lists it starts with.
 */
function NextLobbyStrip({ lobby, onEdit }: { lobby: DebateLobbySummary; onEdit: (lobbyId: string) => void }) {
  const remind = useLobbyReminderPress(lobby);
  const now = useMinuteNow();
  const when = lobbyTimeLabel(lobby.starts_at, now);
  const portal = useElevatedPopoverPortal();
  const [open, setOpen] = React.useState(false);

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
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={`${lobby.name}, lobby details`}
              {...hubAnalyticsAttributes('Lobby strip details', 'open_lobby_details')}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className="shrink-0 text-footnoteMedium text-grey-04">Lobby</span>
              <span className="min-w-0 truncate text-metadataMedium underline-offset-2 hover:underline">
                {lobby.name}
              </span>
              {when ? <span className="shrink-0 text-breadcrumb whitespace-nowrap text-grey-04">{when}</span> : null}
            </button>
          </Popover.Trigger>
          {portal ? (
            <Popover.Portal container={portal}>
              <Popover.Content
                side="bottom"
                align="start"
                sideOffset={8}
                collisionPadding={16}
                aria-label="Lobby details"
                className="z-100 flex w-[368px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-xl border border-grey-02 bg-white p-3.5 shadow-lg"
              >
                <LobbyHandoffScope onOpenChange={setOpen}>
                  <LobbyDetails lobby={lobby} now={now} rsvp={rsvp} onEdit={() => onEdit(lobby.lobby_id)} />
                </LobbyHandoffScope>
              </Popover.Content>
            </Popover.Portal>
          ) : null}
        </Popover.Root>
        {rsvp}
      </section>
      <LobbyReminderError error={remind.error} />
    </>
  );
}

/** The edit dialog over the lobby's live view. Mounted only while editing, so its read runs only then. */
function EditFromStrip({ lobbyId, onClose }: { lobbyId: string; onClose: () => void }) {
  const { data: view } = useDebateLobby(lobbyId);
  return view ? <EditLobbyDialog lobby={view} onClose={onClose} /> : null;
}

/** Short beside Going in the details' footer. */
const LOBBY_DETAILS_EDIT = 'Edit';

/**
 * The lobby's own read for what the list row leaves out: hosts, who is going, claim lists. Asked for
 * only while the details are open, and drawn from the list row until it lands.
 *
 * The count is the list row's, which the gateway patches live; the view is read again each time the
 * details open, since a held one is fresh for 30s whatever happened since. An RSVP elsewhere, which
 * reaches this viewer as that patch alone, refetches it here for the names. Card broadcasts are
 * coalesced, so one RSVP cleared and another set leave the count where it was: reopening is what
 * catches that, and a block or a name change.
 */
function LobbyDetails({
  lobby,
  now,
  rsvp,
  onEdit,
}: {
  lobby: DebateLobbySummary;
  now: number;
  rsvp: React.ReactNode;
  onEdit: () => void;
}) {
  const { data: view, refetch } = useDebateLobby(lobby.lobby_id);
  // Only over a view already held: with none, the query's own first read is out already.
  const staleAtOpening = React.useRef(view !== undefined);
  React.useEffect(() => {
    if (!staleAtOpening.current) return;
    staleAtOpening.current = false;
    void refetch();
  }, [refetch]);
  const goingCount = lobby.reminder_count;
  const readAtCount = React.useRef(goingCount);
  React.useEffect(() => {
    if (readAtCount.current === goingCount) return;
    readAtCount.current = goingCount;
    void refetch();
  }, [goingCount, refetch]);
  const hosts = usePreOpenHosts(view ?? lobby);
  const date = lobbyDateLabel(lobby.starts_at);

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <Text as="p" variant="metadataMedium">
          {view?.name ?? lobby.name}
        </Text>
        {date ? (
          <Text as="p" variant="breadcrumb" color="grey-04">
            {date} · {notYetOpenLabel(lobby, now)}
          </Text>
        ) : null}
      </div>
      <LobbyHostedBy hosts={hosts} />
      <LobbyGoing
        going={view?.going}
        count={goingCount}
        hostOf={view && canEditLobby(view) ? lobby.lobby_id : undefined}
      />
      <LobbyClaimListNames lists={view?.claim_lists} />
      <div className="flex items-center justify-between gap-2 border-t border-divider pt-3">
        <Link
          href={debateRoomPath(lobby.lobby_id)}
          onClick={() => markLobbyEntry(lobby.lobby_id, 'side_panel')}
          {...hubAnalyticsAttributes('Lobby strip open page', 'open_lobby')}
          className={hubPillClassName('secondary')}
        >
          Open lobby page
        </Link>
        <div className="flex items-center gap-2">
          {view ? <EditLobbyButton lobby={view} label={LOBBY_DETAILS_EDIT} onOpen={onEdit} /> : null}
          {rsvp}
        </div>
      </div>
    </>
  );
}
