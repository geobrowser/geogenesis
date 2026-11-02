'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateLobbySummary } from '../api';
import { type DebateAnalyticsSurface, debateAnalyticsLabel } from '../matchmaking/hub-analytics';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { localDaysFrom, rsvpLabel } from './lobby-format';
import { LobbyReminderError, useLobbyReminderPress } from './lobby-reminder-press';

/** "Today", "Tomorrow", "Wed", then "Oct 21" past a week. Local time. */
export function lobbyDayLabel(iso: string, now: number = Date.now()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const days = localDaysFrom(now, at.getTime());
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) return at.toLocaleDateString(undefined, { weekday: 'short' });
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "4 PM", or "4:30 PM" off the hour. Local time. */
export function lobbyBadgeTime(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.getMinutes() === 0
    ? at.toLocaleTimeString(undefined, { hour: 'numeric' })
    : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Today 4 PM", or "Today · 4 PM" with `separator`. Either part drops out when unreadable. */
export function lobbyWhenLabel(iso: string, separator = ' ') {
  return [lobbyDayLabel(iso), lobbyBadgeTime(iso)].filter(Boolean).join(separator);
}

/**
 * RSVP, or Going once set: black, so a lobby the viewer is going to stands out in a row of them. The
 * pill alone, for a host that holds the press itself (the side panel's lobby strip, which draws it
 * twice and says a failure under the strip); {@link LobbyRsvpButton} is the pill with its error.
 */
export function LobbyRsvpPill({
  remind,
  analyticsLabel,
  analyticsSurface = 'hub',
  className,
}: {
  remind: Pick<ReturnType<typeof useLobbyReminderPress>, 'reminded' | 'pending' | 'press'>;
  /** As given: HubPillButton does not prefix an explicit label with the surface. */
  analyticsLabel: string;
  analyticsSurface?: DebateAnalyticsSurface;
  className?: string;
}) {
  return (
    <HubPillButton
      variant={remind.reminded ? 'primary' : 'secondary'}
      analyticsSurface={analyticsSurface}
      analyticsLabel={analyticsLabel}
      aria-pressed={remind.reminded}
      pending={remind.pending}
      onClick={remind.press}
      className={className}
    >
      {rsvpLabel(remind.reminded)}
    </HubPillButton>
  );
}

/** {@link LobbyRsvpPill} with its own press, and the failure under it. */
export function LobbyRsvpButton({
  lobby,
  analyticsSurface = 'hub',
  analyticsLabelPrefix,
  className,
}: {
  lobby: Pick<DebateLobbySummary, 'lobby_id' | 'viewer_reminded' | 'open'>;
  analyticsSurface?: DebateAnalyticsSurface;
  /** Names the click for analytics, after the surface's prefix, e.g. "Upcoming lobby". */
  analyticsLabelPrefix: string;
  className?: string;
}) {
  const remind = useLobbyReminderPress(lobby);
  return (
    <div className={cx('flex flex-col items-end gap-1', className)}>
      <LobbyRsvpPill
        remind={remind}
        analyticsSurface={analyticsSurface}
        analyticsLabel={debateAnalyticsLabel(
          analyticsSurface,
          `${analyticsLabelPrefix} ${remind.reminded ? 'Going' : 'RSVP'}`
        )}
        className="w-full"
      />
      <LobbyReminderError error={remind.error} className="text-right" />
    </div>
  );
}
