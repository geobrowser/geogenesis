import { capture } from '~/core/analytics';

/**
 * The calendar's screen-level events (GEO-3152).
 *
 * Bookings are not here. They go through the booking modal's own scheduling events, with the
 * `entry` saying which part of this screen opened it (`calendar_hour` / `calendar_card`), so a
 * booking is counted once, the same way wherever it came from. Debate now is the hub's existing
 * `start_debate` action, told apart by its page path.
 *
 * Registered in `geobrowser/analytics` (`semantic/events.yaml`, analytics#99): the runtime and the
 * collector drop names they do not know, silently. A new one here needs registering there first.
 *
 * `opened_from`, not `source`: the runtime lets a `source` property override its own shared field,
 * and the collector rejects values it does not expect there.
 */

/** Where the screen was reached from. */
export type CalendarOpenedFrom = 'hub' | 'direct';

export function calendarOpened({
  openedFrom,
  viewerHasSchedule,
}: {
  openedFrom: CalendarOpenedFrom;
  /** `null` signed out, where there is no viewer to have one. */
  viewerHasSchedule: boolean | null;
}) {
  capture('debate_calendar_opened', { opened_from: openedFrom, viewer_has_schedule: viewerHasSchedule });
}

export function calendarWeekChanged(direction: 'previous' | 'next' | 'today') {
  capture('debate_calendar_week_changed', { direction });
}

export type CalendarFilter = 'space' | 'search' | 'clear';

export function calendarFilterChanged(filter: CalendarFilter) {
  capture('debate_calendar_filter_changed', { filter });
}

export function calendarHourOpened(peopleCount: number) {
  capture('debate_calendar_hour_opened', { people_count: peopleCount });
}
