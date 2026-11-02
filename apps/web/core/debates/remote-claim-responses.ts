import type { DebateResponseKind } from './api';

/**
 * A claim response as geo-chat heard it, which is before the graph indexes it (p50 ~10s).
 * Only ever a hint layered over the graph's answer.
 */
export type RemoteClaimResponse = {
  profileSpaceId: string;
  claimId: string;
  spaceId: string;
  responseKind: DebateResponseKind;
  /** `null` is a withdrawal. */
  position: boolean | null;
};

type Listener = (response: RemoteClaimResponse) => void;

const listeners = new Set<Listener>();

export function subscribeRemoteClaimResponses(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishRemoteClaimResponse(response: RemoteClaimResponse) {
  for (const listener of listeners) listener(response);
}

/** The `claim_response` on a `debate.claims_changed` event, which describes only the reporting voter; `null` without one. */
export function remoteClaimResponseFromEvent(payload: {
  space_id?: unknown;
  claim_response?: unknown;
}): RemoteClaimResponse | null {
  const { space_id, claim_response } = payload;
  if (typeof space_id !== 'string' || typeof claim_response !== 'object' || claim_response === null) return null;
  const { claim_entity_id, profile_space_id, response_kind, position } = claim_response as Record<string, unknown>;
  if (typeof claim_entity_id !== 'string' || typeof profile_space_id !== 'string') return null;
  if (response_kind !== 'stance') return null;
  if (position !== null && typeof position !== 'boolean') return null;
  return {
    profileSpaceId: profile_space_id,
    claimId: claim_entity_id,
    spaceId: space_id,
    responseKind: response_kind,
    position,
  };
}
