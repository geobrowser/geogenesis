import {
  type DebateCallSeries,
  type DebateLobbyPerson,
  type DebateLobbyView,
  type GetPrivyIdentityToken,
  type SpaceCallStatus,
  dashlessId,
  geoChatRequest,
} from '~/core/debates/api';

/** One call on a space's list (GEO-3419). Ids are dashless. */
export type SpaceCallSummary = {
  call_id: string;
  /** Absent from a geo-chat that lists live calls only. `scheduled` before the room opens (GEO-3420). */
  status?: SpaceCallStatus;
  name: string;
  /** The scheduled start; for a call started on the spot, when it started. */
  starts_at: string;
  /** The room opens 10 minutes before a scheduled start. GEO-3420. */
  opens_at?: string;
  /** `null` for a call started on the spot. GEO-3420. */
  ends_at?: string | null;
  /** `null` for a call started on the spot. GEO-3420. */
  series?: { series_id: string; name: string } | null;
  started_by: DebateLobbyPerson | null;
  /** Effective hosts who have been in it or started it, starter first, acting host last. */
  hosts: DebateLobbyPerson[];
  /** Signed-in people on the roster now; guests are not counted. */
  headcount: number;
  /** Up to five, longest present first. */
  avatars: DebateLobbyPerson[];
  /** Orders `debate.space_calls_changed` patches; `null` on a scheduled row never broadcast. */
  as_of: string | null;
};

/** A series on the space's list (GEO-3420). */
export type SpaceCallSeriesSummary = Omit<DebateCallSeries, 'description'> & { description: string | null };

/** The viewer's reminders among the listed calls and series. */
export type SpaceCallsViewer = { reminded_call_ids: string[]; reminded_series_ids: string[] };

export type SpaceCallsResponse = {
  space_id: string;
  /** False for a space geo-chat does not track as a public DAO space; nothing can start there. */
  supported: boolean;
  /** The viewer edits the space; `null` signed out. */
  viewer_can_start: boolean | null;
  /** Live first, newest first, then scheduled, soonest first; see `liveSpaceCall` for the one on now. */
  calls: SpaceCallSummary[];
  /** GEO-3420; absent from older geo-chat. */
  series?: SpaceCallSeriesSummary[];
  /** `null` signed out; absent from older geo-chat. */
  viewer?: SpaceCallsViewer | null;
};

/** The call on now, skipping any row that is not live. */
export function liveSpaceCall(list: Pick<SpaceCallsResponse, 'calls'> | undefined): SpaceCallSummary | null {
  return list?.calls.find(call => (call.status ?? 'live') === 'live') ?? null;
}

/** Signed in or out. Signed out it is rate limited per IP, like the lobby list. */
export async function listSpaceCalls(
  spaceId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<SpaceCallsResponse>(`/spaces/${dashlessId(spaceId)}/calls`, {
    auth: accountKey ? true : 'optional',
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

/**
 * Editors only. Does not join: the call page joins as a lobby page does. `409 call_already_live`
 * names the live call in `details.call_id`; `403 call_editor_required`; `400 call_space_unsupported`.
 */
export async function startSpaceCall(
  spaceId: string,
  body: { name?: string },
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateLobbyView>(`/spaces/${dashlessId(spaceId)}/calls`, {
    method: 'POST',
    body,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

/**
 * Hosts only. A stale `base_updated_at` is `409 agenda_conflict`; a blank body clears it. GEO-3420.
 */
export async function saveCallAgenda(
  callId: string,
  body: { body: string; base_updated_at: string | null },
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateLobbyView>(`/calls/${dashlessId(callId)}/agenda`, {
    method: 'PUT',
    body,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

/** Remind me about this call. Setting it needs a call not yet open; clearing always works. GEO-3420. */
export async function setCallReminder(
  callId: string,
  remind: boolean,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateLobbyView>(`/calls/${dashlessId(callId)}/reminder`, {
    method: 'PUT',
    body: { remind },
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export type CallSeriesReminderResponse = { space_id: string; series_id: string; reminded: boolean };

/** Remind me about every call in a series, including ones made later. GEO-3420. */
export async function setCallSeriesReminder(
  spaceId: string,
  seriesId: string,
  remind: boolean,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<CallSeriesReminderResponse>(
    `/spaces/${dashlessId(spaceId)}/call-series/${dashlessId(seriesId)}/reminder`,
    { method: 'PUT', body: { remind }, auth: true, getPrivyIdentityToken, accountKey }
  );
}

export type CallSeriesRefreshResponse = {
  space_id: string;
  /** The graph does not show the publish yet; geo-chat keeps re-reading and broadcasts when it does. */
  pending: boolean;
  series: SpaceCallSeriesSummary[];
};

/**
 * Editors, after a series publish: geo-chat re-reads the space. `pending` means the graph is behind
 * what `series_id` and `schedule` say was written. GEO-3420.
 */
export async function refreshCallSeries(
  spaceId: string,
  body: { series_id?: string; schedule?: string; removed?: boolean },
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<CallSeriesRefreshResponse>(`/spaces/${dashlessId(spaceId)}/call-series/refresh`, {
    method: 'POST',
    body,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}
