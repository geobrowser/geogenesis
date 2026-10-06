import { type AnalyticsEventName, type AnalyticsProperties, capture } from '~/core/analytics';

/**
 * The calendar's screen-level events (GEO-3152).
 *
 * Bookings are not here. They go through the booking modal's own scheduling events, with the
 * `entry` saying which part of this screen opened it (`calendar_slot` / `_hour` / `_card`), so a
 * booking is counted once, the same way wherever it came from. Debate now is the hub's existing
 * `start_debate` action, told apart by its page path.
 *
 * Each name has to be registered in `geobrowser/analytics` (`semantic/events.yaml`) before it lands:
 * the runtime and the collector drop names they do not know, silently. Until the registry with them
 * is vendored, `AnalyticsEventName` (generated from it) does not list them either, which is what the
 * one cast in {@link captureDebateCalendar} is for. Re-vendoring makes it redundant; delete it then.
 *
 * `opened_from`, not `source`: the runtime lets a `source` property override its own shared field,
 * and the collector rejects values it does not expect there.
 */

type CalendarEventName =
  | 'debate_calendar_opened'
  | 'debate_calendar_week_changed'
  | 'debate_calendar_filter_changed'
  | 'debate_calendar_hour_opened'
  | 'debate_calendar_person_viewed';

function captureDebateCalendar(name: CalendarEventName, properties: AnalyticsProperties) {
  capture(name as AnalyticsEventName, properties);
}

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
  captureDebateCalendar('debate_calendar_opened', { opened_from: openedFrom, viewer_has_schedule: viewerHasSchedule });
}

export function calendarWeekChanged(direction: 'previous' | 'next' | 'today') {
  captureDebateCalendar('debate_calendar_week_changed', { direction });
}

export type CalendarFilter = 'space' | 'search' | 'only_viewer_free' | 'clear';

export function calendarFilterChanged(filter: CalendarFilter) {
  captureDebateCalendar('debate_calendar_filter_changed', { filter });
}

export function calendarHourOpened(peopleCount: number) {
  captureDebateCalendar('debate_calendar_hour_opened', { people_count: peopleCount });
}

export function calendarPersonViewed() {
  captureDebateCalendar('debate_calendar_person_viewed', {});
}
