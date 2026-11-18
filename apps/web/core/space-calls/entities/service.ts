import { readEnv } from '~/core/debates/server/acceptor-config';
import { geoChatBaseUrl } from '~/core/debates/server/geo-chat-base-url';
import { ID } from '~/core/id';

/**
 * geo-chat's call entity service routes (docs/space-calls.md, "Call entities (GEO-3593)"). Server
 * only: the bearer token is `GEO_CHAT_CALL_ENTITIES_SERVICE_TOKEN`. Ids in responses are dashless.
 */

export type CallEntityRecording = {
  status: 'processing' | 'ready' | 'failed';
  published: boolean;
  /** `published && status === 'ready'`: the entity links the recording. */
  linked: boolean;
  duration_seconds: number | null;
};

export type CallEntity = {
  space_id: string;
  status: 'scheduled' | 'ended' | 'not_held';
  name: string;
  /** `null` for a call started on the spot. */
  series_id: string | null;
  /** The schedule slot, curator's match key with `series_id`; `null` on the spot. */
  original_start: string | null;
  scheduled_starts_at: string | null;
  scheduled_ends_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  /** What to write: scheduled times until it ended, real times after. */
  starts_at: string;
  ends_at: string;
  attendees: string[];
  recording: CallEntityRecording | null;
};

export type CallEntityClaim = {
  call_id: string;
  claim_id: string;
  claimed_until: string;
  action: 'create' | 'update' | 'remove';
  entity_id: string | null;
  entity: CallEntity;
  previous: CallEntity | null;
  attempts: number;
  last_error: string | null;
};

export type CallEntityRecord =
  | { claim_id: string; outcome: 'written'; entity_id: string }
  | { claim_id: string; outcome: 'failed'; error: string; retry_after_seconds?: number };

export type CallEntityRecordResult =
  | { status: 'recorded'; current: boolean }
  | { status: 'id_conflict'; entityId: string | null }
  /** The entity id is already recorded for another call. */
  | { status: 'id_taken' }
  | { status: 'claim_lost' };

export class CallEntityServiceError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function callEntitiesServiceToken(): string | null {
  return readEnv('GEO_CHAT_CALL_ENTITIES_SERVICE_TOKEN') || null;
}

/** geo-chat's error envelope: `{ error: { code, message, details } }`. */
async function errorCode(response: Response): Promise<{ code: string | null; details: Record<string, unknown> }> {
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string; details?: Record<string, unknown> | null };
  } | null;
  return { code: body?.error?.code ?? null, details: body?.error?.details ?? {} };
}

/**
 * Leases up to `limit` due calls in `spaceIds` for 15 minutes. `null` when there is nothing to do
 * by design: no token on this side, the switch off (`403 call_entities_disabled`), or a geo-chat
 * without the route (`404`). Any other failure throws.
 */
export async function claimCallEntities(
  spaceIds: string[],
  limit: number,
  { token = callEntitiesServiceToken(), fetcher = fetch }: { token?: string | null; fetcher?: typeof fetch } = {}
): Promise<CallEntityClaim[] | null> {
  if (!token || spaceIds.length === 0) return null;
  const response = await fetcher(`${geoChatBaseUrl()}/service/call-entities/claim`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ space_ids: spaceIds.map(id => ID.uuidToHex(id)), limit }),
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (response.status === 403 && (await errorCode(response)).code === 'call_entities_disabled') return null;
  if (!response.ok) {
    throw new CallEntityServiceError(response.status, `geo-chat call entity claim failed (${response.status})`);
  }
  const body = (await response.json()) as { calls?: CallEntityClaim[] };
  return body.calls ?? [];
}

/** Records what was written (or that it failed) for a claimed call. */
export async function recordCallEntity(
  callId: string,
  record: CallEntityRecord,
  { token = callEntitiesServiceToken(), fetcher = fetch }: { token?: string | null; fetcher?: typeof fetch } = {}
): Promise<CallEntityRecordResult> {
  if (!token) throw new CallEntityServiceError(503, 'GEO_CHAT_CALL_ENTITIES_SERVICE_TOKEN is not set');
  const body =
    record.outcome === 'written'
      ? { ...record, claim_id: ID.uuidToHex(record.claim_id), entity_id: ID.uuidToHex(record.entity_id) }
      : { ...record, claim_id: ID.uuidToHex(record.claim_id), error: record.error.slice(0, 500) };
  const response = await fetcher(`${geoChatBaseUrl()}/service/call-entities/${ID.uuidToHex(callId)}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (response.status === 409) {
    const { code, details } = await errorCode(response);
    if (code === 'call_entity_id_conflict') {
      const entityId = typeof details.entity_id === 'string' ? ID.uuidToHex(details.entity_id) : null;
      return { status: 'id_conflict', entityId };
    }
    if (code === 'call_entity_claim_lost') return { status: 'claim_lost' };
    if (code === 'call_entity_id_taken') return { status: 'id_taken' };
  }
  if (!response.ok) {
    throw new CallEntityServiceError(response.status, `geo-chat call entity record failed (${response.status})`);
  }
  const result = (await response.json()) as { current?: boolean };
  return { status: 'recorded', current: result.current !== false };
}
