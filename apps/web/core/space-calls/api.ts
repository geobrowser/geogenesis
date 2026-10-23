import {
  type DebateLobbyPerson,
  type DebateLobbyView,
  type GetPrivyIdentityToken,
  dashlessId,
  geoChatRequest,
} from '~/core/debates/api';

/** One call on a space's list (GEO-3419). Ids are dashless. */
export type SpaceCallSummary = {
  call_id: string;
  /** Absent from a geo-chat that lists live calls only; later tickets add scheduled rows. */
  status?: 'live' | (string & {});
  name: string;
  started_at: string;
  started_by: DebateLobbyPerson | null;
  /** Effective hosts who have been in it or started it, starter first, acting host last. */
  hosts: DebateLobbyPerson[];
  /** Signed-in people on the roster now; guests are not counted. */
  headcount: number;
  /** Up to five, longest present first. */
  avatars: DebateLobbyPerson[];
  /** Orders `debate.space_calls_changed` patches. */
  as_of: string;
};

export type SpaceCallsResponse = {
  space_id: string;
  /** False for a space geo-chat does not track as a public DAO space; nothing can start there. */
  supported: boolean;
  /** The viewer edits the space; `null` signed out. */
  viewer_can_start: boolean | null;
  /** Newest first; see `liveSpaceCall` for the one on now. */
  calls: SpaceCallSummary[];
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
