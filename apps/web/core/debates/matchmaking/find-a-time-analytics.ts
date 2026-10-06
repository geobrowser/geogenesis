import { type AnalyticsEventName, type AnalyticsProperties, capture } from '~/core/analytics';

/**
 * Find a time's screen-level events (GEO-3152).
 *
 * Bookings are not here. They go through the booking modal's own scheduling events, with the
 * `entry` saying which part of this screen opened it (`find_a_time_slot` / `_hour` / `_card`), so a
 * booking is counted once, the same way wherever it came from. Debate now is the hub's existing
 * `start_debate` action, told apart by its page path.
 *
 * Each name has to be registered in `geobrowser/analytics` (`semantic/events.yaml`) before it lands:
 * the runtime and the collector drop names they do not know, silently. Until the registry with them
 * is vendored, `AnalyticsEventName` (generated from it) does not list them either, which is what the
 * one cast in {@link captureFindATime} is for. Re-vendoring makes it redundant; delete it then.
 *
 * `opened_from`, not `source`: the runtime lets a `source` property override its own shared field,
 * and the collector rejects values it does not expect there.
 */

type FindATimeEventName =
  | 'find_a_time_opened'
  | 'find_a_time_week_changed'
  | 'find_a_time_filter_changed'
  | 'find_a_time_hour_opened'
  | 'find_a_time_person_viewed';

function captureFindATime(name: FindATimeEventName, properties: AnalyticsProperties) {
  capture(name as AnalyticsEventName, properties);
}

/** Where the screen was reached from. */
export type FindATimeOpenedFrom = 'hub' | 'direct';

export function findATimeOpened({
  openedFrom,
  viewerHasSchedule,
}: {
  openedFrom: FindATimeOpenedFrom;
  /** `null` signed out, where there is no viewer to have one. */
  viewerHasSchedule: boolean | null;
}) {
  captureFindATime('find_a_time_opened', { opened_from: openedFrom, viewer_has_schedule: viewerHasSchedule });
}

export function findATimeWeekChanged(direction: 'previous' | 'next' | 'today') {
  captureFindATime('find_a_time_week_changed', { direction });
}

export type FindATimeFilter = 'space' | 'search' | 'only_viewer_free' | 'clear';

export function findATimeFilterChanged(filter: FindATimeFilter) {
  captureFindATime('find_a_time_filter_changed', { filter });
}

export function findATimeHourOpened(peopleCount: number) {
  captureFindATime('find_a_time_hour_opened', { people_count: peopleCount });
}

export function findATimePersonViewed() {
  captureFindATime('find_a_time_person_viewed', {});
}
