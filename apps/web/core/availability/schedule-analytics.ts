import { capture } from '~/core/analytics';
import { geoChatErrorProperties } from '~/core/debates/api';

import { availabilityLinkSource } from './availability-deep-link';
import type { AvailabilityBlock } from './blocks';
import type { PeerSchedule } from './peer-schedule';

/**
 * Analytics for availability and scheduling (the `peerAvailability` flag).
 *
 * Two layers, because they reach the warehouse on different terms:
 *
 * - **Click attributes** (`debateActionAnalyticsAttributes` in `hub-analytics`, with the scheduling
 *   surfaces added there) ride the runtime's autocaptured `element_clicked`, which is registered
 *   already. They answer "who pressed what".
 * - **Outcome events** (everything else here) fire on the server's answer, not on the press, so a
 *   request that failed is never counted as one sent. Each name has to be registered in
 *   `geobrowser/analytics` (`semantic/events.yaml`): the runtime and the collector both drop a name
 *   they do not know, silently.
 *
 * No free text leaves here: no names, no provider messages. Ids and counts only.
 */

/**
 * Where someone's week was opened from, carried through to the request it ends in so a booking can
 * be traced back to the control that started it.
 */
export type ScheduleEntry =
  /** The People tab's "Schedule" pill on an offline person. */
  | 'people_schedule'
  /** A shared-time chip on a People tab row, which opens the week with that slot picked. */
  | 'people_time'
  /** "More times" on a People tab row. */
  | 'people_more_times'
  /** The clock icon on an online person. */
  | 'people_see_times'
  /** Someone's `?modal=availability` link. */
  | 'availability_link'
  /** A scheduling email's "Choose different time", which moves a request rather than making one. */
  | 'reschedule_link'
  /** "Reschedule" on an accepted debate in the Requests tab, which moves it the same way. */
  | 'requests_reschedule'
  /** "Choose different time" on an invite the viewer has yet to answer, which moves it the same way. */
  | 'requests_new_time'
  /** A row in one hour's list of everyone free then, on the calendar's week grid (GEO-3152). */
  | 'calendar_hour'
  /** The card a face on the calendar opens on hover, and the phone list's rows. */
  | 'calendar_card'
  /** A time beside someone who disagrees with the viewer, in the calendar's Claims panel (GEO-3220). */
  | 'calendar_claim_match'
  /** A row's chips or Schedule in the calendar's People panel (GEO-3220). */
  | 'calendar_people_panel'
  /** A time chip, More times, or type-a-time from a lobby person menu. */
  | 'lobby_time'
  | 'lobby_more_times'
  | 'lobby_schedule'
  /** Choose different time on an incoming scheduled request in the lobby. */
  | 'lobby_new_time'
  /** Can't make it's "Suggest another time instead" (GEO-3427). */
  | 'cant_make_it'
  /** Reschedule on the waiting room's running-late notice (GEO-3427, board 6b). */
  | 'room_late_notice';

/** Which control opened the viewer's own schedule editor. */
export type ScheduleEditorSurface =
  | 'navbar'
  /** The calendar button beside "I'm available" in the hub header: the standing entry point. */
  | 'hub_header'
  /** The set-schedule banner under that header, which only introduces it. */
  | 'hub_banner'
  | 'people_tab'
  /** An admin's request for more times, shown on the Requests tab (GEO-3228). */
  | 'requests_tab'
  | 'availability_link'
  /** The calendar's own prompt and its Edit my times (GEO-3152). */
  | 'calendar'
  /** Reopened on the way back from connecting Google Calendar. */
  | 'google_calendar'
  /** Reopened on the way back from connecting Outlook Calendar. */
  | 'microsoft_calendar';

/** Every event that knows how the week was opened says so the same way, `unknown` included. */
function entryProperty(entry: ScheduleEntry | null | undefined) {
  return entry ?? 'unknown';
}

/**
 * A saved schedule, described by its shape. `is_first_schedule` separates people setting one up
 * from people keeping one current, which are different questions about the same button.
 */
export function debateScheduleSaved(
  blocks: AvailabilityBlock[],
  { surface, isFirstSchedule }: { surface: ScheduleEditorSurface; isFirstSchedule: boolean }
) {
  const recurring = blocks.filter(block => block.kind === 'recurring');

  capture('debate_schedule_saved', {
    surface,
    is_first_schedule: isFirstSchedule,
    block_count: blocks.length,
    recurring_block_count: recurring.length,
    dated_block_count: blocks.filter(block => block.kind === 'dated').length,
    exception_block_count: blocks.filter(block => block.kind === 'exception').length,
    weekday_count: new Set(recurring.map(block => block.weekday)).size,
    // Overlapping blocks are counted twice. The editor merges most of those on the way in, and a
    // rough "how much of the week is offered" is what this is for.
    weekly_minutes: recurring.reduce((total, block) => total + (block.end - block.start), 0),
  });
}

/**
 * Someone's week, loaded and on screen. The step between "opened" and "requested": whether there
 * was anything to pick, and whether any of it suited both of them.
 *
 * `requestId` is the scheduled debate being moved, when this week is a reschedule. It joins the
 * opening to geo-chat's record of that debate, so a reschedule started and then abandoned shows up
 * (GEO-3432). A link's id is already checked by `rescheduleRequestIdFromTarget`.
 */
export function debateAvailabilityViewed(
  schedule: PeerSchedule,
  { entry, bookable, requestId }: { entry: ScheduleEntry | null; bookable: boolean; requestId?: string | null }
) {
  // Minutes rather than slot counts: a wire slot is a range of any length, so counting them would
  // rank one free afternoon below two free half-hours.
  const minutes = (slots: PeerSchedule['slots']) =>
    slots.reduce((total, slot) => total + Math.max(0, (Date.parse(slot.end) - Date.parse(slot.start)) / 60_000), 0);

  capture('debate_availability_viewed', {
    entry: entryProperty(entry),
    bookable,
    peer_user_id: schedule.userId,
    peer_has_schedule: schedule.peerHasSchedule,
    viewer_has_schedule: schedule.viewerHasSchedule,
    free_minutes: minutes(schedule.slots) || 0,
    mutual_free_minutes: minutes(schedule.slots.filter(slot => slot.viewerIsFree)) || 0,
    request_id: requestId ?? null,
  });
}

/** What a scheduling mutation needs to say where it came from. Optional: analytics never gates it. */
export type ScheduledRequestAnalytics = {
  entry: ScheduleEntry | null;
  /** Whether the picked time is one the viewer marked free; `null` for a time typed in by hand. */
  viewerIsFree: boolean | null;
};

type RequestMode = 'request' | 'reschedule';

/** The server accepted a proposed (or moved) time. */
export function debateScheduledRequestSent({
  mode,
  requestId,
  startsAt,
  analytics,
  now = Date.now(),
}: {
  mode: RequestMode;
  requestId: string;
  startsAt: Date;
  analytics?: ScheduledRequestAnalytics;
  now?: number;
}) {
  capture('debate_scheduled_request_sent', {
    mode,
    entry: entryProperty(analytics?.entry),
    request_id: requestId,
    viewer_is_free: analytics?.viewerIsFree ?? null,
    lead_time_minutes: Math.max(0, Math.round((startsAt.getTime() - now) / 60_000)),
  });
}

/** The server refused it. */
export function debateScheduledRequestFailed({
  mode,
  error,
  analytics,
}: {
  mode: RequestMode;
  error: unknown;
  analytics?: ScheduledRequestAnalytics;
}) {
  capture('debate_scheduled_request_failed', {
    mode,
    entry: entryProperty(analytics?.entry),
    ...geoChatErrorProperties(error),
  });
}

/**
 * An answer to a scheduled request. `conflict` is geo-chat refusing an acceptance that clashes with
 * another booked debate, so it is not an answer the viewer meant to give.
 */
export function debateScheduledRequestAnswered({
  requestId,
  accepted,
  outcome,
  surface,
}: {
  requestId: string;
  accepted: boolean;
  surface?: 'lobby';
  outcome: 'recorded' | 'conflict';
}) {
  capture('debate_scheduled_request_answered', {
    request_id: requestId,
    accepted,
    outcome,
    ...(surface ? { surface } : {}),
  });
}

/**
 * An availability link, landed on and resolved. `viewer` is who opened it, which is the whole
 * story of a shared link: a signed-out stranger is the case it exists for, and the owner opening
 * their own link is them checking what it shows.
 */
export function debateAvailabilityLinkOpened({
  viewer,
  peer,
  rescheduleRequestId,
  via,
}: {
  viewer: 'signed_out' | 'self' | 'other';
  /** `bookable` when the week can be shown; otherwise why not. */
  peer: 'bookable' | 'no_debate_profile' | 'error' | null;
  /**
   * The request a scheduling email's link moves, or null for a booking link. Sent here as well as
   * on `debate_availability_viewed`, because this fires even when the week never loads (signed out,
   * an error), so a reschedule abandoned there is still seen (GEO-3432).
   */
  rescheduleRequestId: string | null;
  via: string | null;
}) {
  capture('debate_availability_link_opened', {
    viewer,
    peer: peer ?? 'unknown',
    rescheduling: rescheduleRequestId !== null,
    request_id: rescheduleRequestId,
    link_source: availabilityLinkSource(via),
  });
}
