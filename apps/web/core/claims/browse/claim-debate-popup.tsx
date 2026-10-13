'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { ScheduleEntry } from '~/core/availability/schedule-analytics';
import { activeDebate } from '~/core/debates/activity-state';
import type { DebateActivity, DebateChallenge, DebatePerson, DebateRequest } from '~/core/debates/api';
import { DebateDialogShell } from '~/core/debates/debate-dialog-shell';
import { DebateChallengeCard } from '~/core/debates/matchmaking/challenge-card';
import { debateActionAnalyticsAttributes } from '~/core/debates/matchmaking/hub-analytics';
import {
  HUB_ICON_BUTTON_CLASS_NAME,
  HubPillButton,
  hubPillClassName,
} from '~/core/debates/matchmaking/hub-pill-button';
import { OutboundRequestCard } from '~/core/debates/matchmaking/outbound-request-card';
import { PersonRow } from '~/core/debates/matchmaking/people-tab';
import type { ClaimOpponents } from '~/core/debates/matchmaking/use-claim-opponents';
import { usePersonFacts } from '~/core/debates/matchmaking/use-person-facts';
import { speakerLabel } from '~/core/debates/playback-utils';
import { useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';

import { Calendar } from '~/design-system/icons/calendar';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { PeerAvailabilityBookingModal } from '~/partials/availability/peer-availability-booking-modal';

const SURFACE = 'claim-popup';
const EMPTY_SPACE_IDS: string[] = [];

type Screen = 'debate' | 'sent' | 'ended';

type Booking = { userId: string; name: string; disagreementCount: number | null };

/**
 * The claim page's debate popup (GEO-3244), opened by a filled Request debate.
 *
 * One screen, so debating now is two presses from the claim: First available — the claim request
 * geo-chat matches — then a row per person on the other side who is online, each asked directly,
 * and Schedule for later pinned under them when someone on the other side has free time.
 *
 * Once a request or an invite goes out, the popup shows it, with its Withdraw, until the viewer
 * moves on. If it ends without a debate, it says so and offers scheduling instead. A debate that
 * does start is the ready prompt's to announce, so the popup gets out of its way.
 */
export function ClaimDebatePopup({
  claimName,
  viewerPosition,
  opponents,
  liveMatch,
  blockedReason,
  isRequesting,
  requestError,
  switchesAvailability,
  onRequest,
  rowsDisabled,
  rowsDisabledReason,
  activity,
  outboundRequest,
  outboundChallenge,
  schedule,
  onClose,
}: {
  claimName: string | null;
  viewerPosition: boolean;
  opponents: ClaimOpponents;
  /** Someone on the other side is standing ready on this claim, so First available can be sent. */
  liveMatch: boolean;
  /** Why the claim request cannot be sent now, from `useClaimMatchup`. */
  blockedReason: string | null | undefined;
  isRequesting: boolean;
  requestError: string | null;
  /** First available will switch the viewer to available before sending. */
  switchesAvailability: boolean;
  onRequest: () => void;
  /** Whether the rows' Debate now is held back, and why: the People tab's rule. */
  rowsDisabled: boolean;
  rowsDisabledReason: string | null;
  activity: DebateActivity | undefined;
  /** The viewer's pending request on this claim, if any. */
  outboundRequest: DebateRequest | null;
  /** The viewer's pending invite to one person, if any. */
  outboundChallenge: DebateChallenge | null;
  /** The calendar filtered to this claim; absent when nobody on the other side has free time. */
  schedule?: { href: string; onNavigate: () => void };
  onClose: () => void;
}) {
  const [screen, setScreen] = React.useState<Screen>('debate');
  const [booking, setBooking] = React.useState<Booking | null>(null);
  const [sent, setSent] = React.useState<{ kind: 'request'; id: string } | { kind: 'challenge'; id: string } | null>(
    null
  );

  // What was already out when the popup opened, so only a send from here moves it to Sent.
  const [baseline] = React.useState(() => ({ request: outboundRequest?.id, challenge: outboundChallenge?.id }));
  React.useEffect(() => {
    if (screen !== 'debate') return;
    if (outboundRequest && outboundRequest.id !== baseline.request) {
      setSent({ kind: 'request', id: outboundRequest.id });
      setScreen('sent');
    } else if (outboundChallenge && outboundChallenge.id !== baseline.challenge) {
      setSent({ kind: 'challenge', id: outboundChallenge.id });
      setScreen('sent');
    }
  }, [baseline, outboundChallenge, outboundRequest, screen]);

  // The sent request is gone: a debate came of it, which the ready prompt takes from here, or it
  // ended without one.
  const pendingSent =
    sent?.kind === 'request'
      ? outboundRequest?.id === sent.id
        ? outboundRequest
        : null
      : sent?.kind === 'challenge' && outboundChallenge?.id === sent.id
        ? outboundChallenge
        : null;
  const debating = Boolean(activeDebate(activity));
  React.useEffect(() => {
    if (screen !== 'sent' || pendingSent) return;
    if (debating) onClose();
    else setScreen('ended');
  }, [debating, onClose, pendingSent, screen]);

  const opposing = viewerPosition ? 'disagree' : 'agree';
  const close = (
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      {...debateActionAnalyticsAttributes(SURFACE, 'close')}
      className={HUB_ICON_BUTTON_CLASS_NAME}
    >
      <Close />
    </button>
  );

  if (booking) {
    return (
      <PeerAvailabilityBookingModal
        open
        userId={booking.userId}
        peerName={booking.name}
        entry={'claim_popup' satisfies ScheduleEntry}
        disagreementCount={booking.disagreementCount}
        onClose={() => setBooking(null)}
      />
    );
  }

  if (screen === 'sent' && pendingSent) {
    const opponent = speakerLabel(pendingSent.recipient);
    return (
      <DebateDialogShell
        eyebrow={<Eyebrow>{sent?.kind === 'challenge' ? 'Invite sent' : 'Request sent'}</Eyebrow>}
        title={claimName ?? 'This claim'}
        headerEnd={close}
        onClose={onClose}
        footer={
          <div className="flex justify-center">
            <HubPillButton analyticsSurface={SURFACE} analyticsLabel="Claim popup keep browsing" onClick={onClose}>
              Keep browsing
            </HubPillButton>
          </div>
        }
      >
        <div className="grid gap-3">
          {sent?.kind === 'challenge' && outboundChallenge ? (
            <DebateChallengeCard challenge={outboundChallenge} role="requester" analyticsSurface={SURFACE} />
          ) : outboundRequest ? (
            <OutboundRequestCard request={outboundRequest} analyticsSurface={SURFACE} />
          ) : null}
          <Text as="p" variant="footnote" color="grey-04" className="text-center">
            {sent?.kind === 'challenge'
              ? `${opponent} picks the claim when they accept.`
              : `If ${opponent} passes, we'll try the next person on the other side until it expires.`}
          </Text>
        </div>
      </DebateDialogShell>
    );
  }

  if (screen === 'ended' || screen === 'sent') {
    return (
      <DebateDialogShell
        eyebrow={<Eyebrow>Debate this claim</Eyebrow>}
        title="No one took it this time"
        headerEnd={close}
        onClose={onClose}
        footer={
          <div className="flex justify-center gap-2">
            {schedule ? (
              <Link
                href={schedule.href}
                onClick={schedule.onNavigate}
                {...debateActionAnalyticsAttributes(SURFACE, 'schedule later', 'open_debate_calendar')}
                className={hubPillClassName('primary')}
              >
                Schedule for later
              </Link>
            ) : null}
            <HubPillButton analyticsSurface={SURFACE} analyticsLabel="Claim popup close" onClick={onClose}>
              Close
            </HubPillButton>
          </div>
        }
      >
        <Text as="p" variant="metadata" color="grey-04" className="text-center">
          {claimName}
        </Text>
      </DebateDialogShell>
    );
  }

  const firstAvailableReason = !liveMatch
    ? 'Nobody on the other side is ready on this claim right now.'
    : (blockedReason ?? null);

  return (
    <DebateDialogShell
      eyebrow={<Eyebrow>Debate this claim</Eyebrow>}
      title={claimName ?? 'This claim'}
      headerEnd={close}
      onClose={onClose}
      footer={
        // Pinned under the list, so the other way to debate never scrolls out of sight.
        <div className="grid gap-3">
          {schedule ? (
            <Link
              href={schedule.href}
              onClick={schedule.onNavigate}
              {...debateActionAnalyticsAttributes('claim', 'Schedule later', 'open_debate_calendar')}
              className={cx(
                'flex items-center gap-3 rounded-lg border border-grey-02 bg-white p-3 transition-colors hover:border-text',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple'
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-grey-01 text-text" aria-hidden>
                <Calendar />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <Text as="span" variant="metadataMedium">
                  Schedule for later
                </Text>
                <Text as="span" variant="footnote" color="grey-04">
                  {peopleCount(opponents.withFreeTime.size, opposing, ['has free time', 'have free time'])}
                </Text>
              </span>
              <span className="shrink-0 text-grey-04" aria-hidden>
                <ChevronRight />
              </span>
            </Link>
          ) : null}
          <Text as="p" variant="footnote" color="grey-04" className="text-center">
            {rowsDisabled && rowsDisabledReason
              ? `${rowsDisabledReason}${schedule ? ' Scheduling still works.' : ''}`
              : 'Asking one person sends a general invite. They pick the claim when they accept.'}
          </Text>
        </div>
      }
    >
      <section className="grid gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <Text as="h3" variant="metadataMedium">
            Debate now
          </Text>
          <Text as="span" variant="footnote" color="grey-04" className="truncate">
            {onlineSummary(opponents.online, opposing, liveMatch)}
          </Text>
        </div>

        <div
          className={cx(
            'flex items-center justify-between gap-3 rounded-lg border p-3',
            firstAvailableReason ? 'border-grey-02 bg-grey-01' : 'border-text bg-white'
          )}
        >
          <div className="grid min-w-0 gap-0.5">
            <Text as="p" variant="metadataMedium">
              First available
            </Text>
            <Text as="p" variant="footnote" color="grey-04">
              {firstAvailableReason ?? `Whoever ${opposing}s and is ready first`}
            </Text>
            {switchesAvailability && !firstAvailableReason ? (
              <Text as="p" variant="footnote" color="grey-04">
                You&rsquo;ll show as available to debate.
              </Text>
            ) : null}
            {requestError ? (
              <p role="alert" className="text-footnote text-red-01">
                {requestError}
              </p>
            ) : null}
          </div>
          <HubPillButton
            variant="primary"
            analyticsSurface={SURFACE}
            analyticsLabel="Claim First available"
            analyticsIntent="start_debate"
            disabled={Boolean(firstAvailableReason)}
            pending={isRequesting}
            onClick={onRequest}
          >
            {isRequesting ? 'Requesting…' : 'Request debate'}
          </HubPillButton>
        </div>

        <ClaimOpponentRows
          opponents={opponents}
          disabled={rowsDisabled}
          disabledReason={rowsDisabledReason}
          onSchedule={setBooking}
        />
      </section>
    </DebateDialogShell>
  );
}

/** "Or ask someone": the People tab's row for each person on the other side who is online. */
function ClaimOpponentRows({
  opponents,
  disabled,
  disabledReason,
  onSchedule,
}: {
  opponents: ClaimOpponents;
  disabled: boolean;
  disabledReason: string | null;
  onSchedule: (booking: Booking) => void;
}) {
  // Inside the dialog, so the rows' popovers clear its overlay and stay inside its focus trap.
  const [portal, setPortal] = React.useState<HTMLElement | null>(null);
  const {
    matchAnalysis,
    matchesKnown,
    matchingSpaceIds,
    matchingClaimNamesById,
    matchingClaimsLoading,
    records,
    debateSpacesByPerson,
  } = usePersonFacts(opponents.online, { authenticated: true, rosterUnavailable: false });
  const { labelsById } = useSpaceLabels(
    React.useMemo(
      () => [...new Set([...matchingSpaceIds, ...[...debateSpacesByPerson.values()].flat()])],
      [debateSpacesByPerson, matchingSpaceIds]
    )
  );

  if (opponents.online.length === 0) {
    return (
      <Text as="p" variant="metadata" color="grey-04" className="text-center">
        Nobody else on the other side is online right now.
      </Text>
    );
  }

  return (
    <div>
      <Text as="p" variant="footnote" color="grey-04">
        Or ask someone
      </Text>
      <ul>
        {opponents.online.map(person => {
          const profileKey = normId(person.profile_space_id);
          const matches = matchAnalysis.byProfile.get(profileKey) ?? [];
          return (
            <PersonRow
              key={person.user_id}
              analyticsSurface={SURFACE}
              entry="claim_popup"
              person={person}
              matches={matches}
              matchesBySpace={matchesKnown ? matchAnalysis.countsByProfileAndSpace.get(profileKey) : undefined}
              claimNamesById={matchingClaimNamesById}
              claimNamesLoading={matchingClaimsLoading}
              canScheduleAway={opponents.slotsByUser.has(normId(person.user_id))}
              record={records.get(person.profile_space_id) ?? null}
              spaceIds={debateSpacesByPerson.get(person.profile_space_id) ?? EMPTY_SPACE_IDS}
              labelsById={labelsById}
              popoverPortal={portal}
              hideSeeTimes
              disabled={disabled}
              disabledReason={disabledReason ?? 'You have a debate request awaiting a reply.'}
              onSeeTimes={() =>
                onSchedule({
                  userId: person.user_id,
                  name: speakerLabel(person),
                  disagreementCount: matchesKnown ? matches.length : null,
                })
              }
            />
          );
        })}
      </ul>
      <div ref={setPortal} />
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text as="div" variant="metadata" color="text">
      {children}
    </Text>
  );
}

/** "3 people who disagree are online", or one person by name. */
export function onlineSummary(online: DebatePerson[], opposing: 'agree' | 'disagree', liveMatch: boolean): string {
  if (online.length === 1) return `${speakerLabel(online[0])} ${opposing}s and is online`;
  // geo-chat's readiness can name a match before the graph has indexed their side.
  if (online.length === 0 && liveMatch) return `Someone who ${opposing}s is ready`;
  return peopleCount(online.length, opposing, ['is online', 'are online']);
}

function peopleCount(count: number, opposing: 'agree' | 'disagree', [one, many]: [string, string]): string {
  return count === 1 ? `1 person who ${opposing}s ${one}` : `${count} people who ${opposing} ${many}`;
}
