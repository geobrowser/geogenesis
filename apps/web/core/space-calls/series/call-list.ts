import { type DebateLobbyPerson, dashlessId } from '~/core/debates/api';
import { sameId } from '~/core/debates/rooms/room-presence';

import type { SpaceCallSummary, SpaceCallsResponse, SpaceCallsViewer } from '../api';

/**
 * One row on a space's Calls tab (GEO-3420), whatever geo-chat read it came from. Ids dashless,
 * instants as geo-chat sends them: the client never re-expands a schedule for display.
 */
export type CallListItem = {
  callId: string;
  name: string;
  seriesId: string | null;
  seriesName: string | null;
  /** The series Remind me can follow: `null` for a one-off, as on the call's page. */
  remindSeriesId: string | null;
  startsAt: string;
  endsAt: string | null;
  status: 'live' | 'scheduled';
  headcount: number;
  avatars: DebateLobbyPerson[];
};

/** A list row as the Calls tab draws it; `null` for a status it does not show. */
export function callListItem(call: SpaceCallSummary): CallListItem | null {
  const status = call.status === 'scheduled' ? 'scheduled' : (call.status ?? 'live') === 'live' ? 'live' : null;
  if (!status) return null;
  return {
    callId: dashlessId(call.call_id),
    name: call.name,
    seriesId: call.series ? dashlessId(call.series.series_id) : null,
    seriesName: call.series?.name ?? null,
    remindSeriesId: call.series ? dashlessId(call.series.series_id) : null,
    startsAt: call.starts_at,
    endsAt: call.ends_at ?? null,
    status,
    headcount: call.headcount,
    avatars: call.avatars,
  };
}

/** The Calls tab's live and upcoming rows, in geo-chat's order. Rows read `one_off` from `list.series`. */
export function splitCallList(list: Pick<SpaceCallsResponse, 'calls' | 'series'> | undefined) {
  const oneOff = (list?.series ?? []).filter(series => series.one_off).map(series => series.series_id);
  const items = (list?.calls ?? [])
    .map(callListItem)
    .filter((item): item is CallListItem => item !== null)
    .map(item =>
      item.seriesId && oneOff.some(id => sameId(id, item.seriesId!)) ? { ...item, remindSeriesId: null } : item
    );
  return {
    live: items.filter(item => item.status === 'live'),
    upcoming: items.filter(item => item.status === 'scheduled').sort(byStart),
  };
}

/** The viewer's reminders for a row, from the list's viewer block; `null` signed out. */
export function rowReminders(viewer: SpaceCallsViewer | null | undefined, item: CallListItem) {
  return {
    call: viewer?.reminded_call_ids.some(id => sameId(id, item.callId)) ?? false,
    series: item.seriesId !== null && (viewer?.reminded_series_ids.some(id => sameId(id, item.seriesId!)) ?? false),
  };
}

/** Soonest first; a row without a readable start goes last. */
export function byStart(a: CallListItem, b: CallListItem) {
  const at = Date.parse(a.startsAt);
  const bt = Date.parse(b.startsAt);
  if (Number.isNaN(at)) return Number.isNaN(bt) ? 0 : 1;
  if (Number.isNaN(bt)) return -1;
  return at - bt;
}
