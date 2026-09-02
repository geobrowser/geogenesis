import {
  type DebateOgCardData,
  type DebateOgSpeaker,
  generateDebateOgImageResponse,
} from '~/core/debates/debate-og-image';
import { uploadGeoImage } from '~/core/sdk/geo-client';
import { getImagePath } from '~/core/utils/utils';

import type {
  Debate,
  DebateMediaArtifactKind,
  DebateMediaResponse,
  DebateTranscriptResponse,
  SpaceDebatesResponse,
} from '../api';
import {
  type DebateClaimInput,
  type DebatePublishInput,
  type DebatePublishParticipant,
  type DebatePublishTurn,
  mergeTranscriptSegmentsIntoTurns,
} from '../debate-publish-draft';
import { hasProcessedVideo } from '../playback-utils';

const debatePublishSettlementMs = 60_000;

function geoChatBaseUrl() {
  const base =
    process.env.GEO_CHAT_API_BASE_URL || process.env.NEXT_PUBLIC_GEO_CHAT_API_BASE_URL || 'http://localhost:8080';
  return base.replace(/\/+$/, '');
}

/**
 * The public host published media URLs are built from. Published URLs are written on-chain and
 * opened by browsers, so only `NEXT_PUBLIC_` variables are read; `GEO_CHAT_API_BASE_URL` may be a
 * cluster-internal host. `NEXT_PUBLIC_DEBATE_MEDIA_BASE_URL` allows media to move to its own
 * hostname later without touching published entities.
 */
function debateMediaBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_DEBATE_MEDIA_BASE_URL || process.env.NEXT_PUBLIC_GEO_CHAT_API_BASE_URL;
  // The localhost fallback is for development only.
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to publish debate media URLs: no public media host is configured. Set ' +
        'NEXT_PUBLIC_DEBATE_MEDIA_BASE_URL (or NEXT_PUBLIC_GEO_CHAT_API_BASE_URL) to the browser-reachable ' +
        'geo-chat host, because published URLs are written on-chain and cannot be changed afterwards.'
    );
  }
  const base = (configured || 'http://localhost:8080').replace(/\/+$/, '');
  // The `/geo-chat-proxy` dev setup in `next.config.ts` makes this a relative path, which cannot
  // be used as a published URL.
  const parsed = parseAbsoluteHttpUrl(base);
  if (!parsed) {
    throw new Error(
      `Refusing to publish debate media URLs built on ${base}: the media host must be an absolute ` +
        'http(s) URL, because it is written on-chain and cannot be changed afterwards. ' +
        'Set NEXT_PUBLIC_DEBATE_MEDIA_BASE_URL to a public host.'
    );
  }
  // A query or fragment on the base would take the artifact path into the query string.
  if (/[?#]/.test(base)) {
    throw new Error(
      `Refusing to publish debate media URLs built on ${base}: the media host must not carry a query string or fragment.`
    );
  }
  // Geo is served over https; http media would be blocked as mixed content.
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error(
      `Refusing to publish debate media URLs built on ${base}: the media host must use https in production.`
    );
  }
  return base;
}

function parseAbsoluteHttpUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Throws if the media host cannot produce a valid published URL. The sweep calls this once up front. */
export function assertDebateMediaHostConfigured(): void {
  debateMediaBaseUrl();
}

/**
 * The durable URL for a debate media artifact. geo-chat resolves it by (debate, kind) and
 * 302-redirects to a fresh presigned GET, so it survives reprocessing and 404s once deleted.
 */
function durableArtifactUrl(debateId: string, kind: DebateMediaArtifactKind): string {
  return `${debateMediaBaseUrl()}/debates/${debateId}/media/artifacts/${kind}/content`;
}

/**
 * Checks that geo-chat serves the durable URL before it is written on-chain. A non-2xx/3xx answer
 * is treated as not ready (typically geo-chat has not deployed the content route yet). The 302 is
 * the expected answer, so redirects are not followed.
 */
async function assertDurableArtifactUrlResolves(debateId: string, url: string): Promise<void> {
  const response = await fetch(url, { method: 'HEAD', redirect: 'manual', cache: 'no-store' });
  if (response.status >= 200 && response.status < 400) return;
  throw new DebateNotPublishableError(
    'media_not_ready',
    `Debate ${debateId} durable media URL ${url} does not resolve yet (${response.status}).`
  );
}

/** Carries geo-chat's HTTP status so the route can tell a permanent 4xx (bad id) from a transient 5xx. */
export class GeoChatRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GeoChatRequestError';
    this.status = status;
  }
}

async function geoChatGet<T>(path: string): Promise<T> {
  const response = await fetch(`${geoChatBaseUrl()}${path}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new GeoChatRequestError(response.status, `geo-chat ${path} failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function geoChatPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${geoChatBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new GeoChatRequestError(response.status, `geo-chat ${path} failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export type DebateSource = {
  debate: Debate;
  media: DebateMediaResponse;
  input: DebatePublishInput;
};

/**
 * Why a debate can't be published yet — or, for `media_failed`, ever.
 *
 * The distinction between `media_not_ready` and `media_failed` is the whole point of having two
 * codes: one is a debate the next sweep will pick up, the other is a debate no sweep will ever
 * publish. Collapsing them is how twelve debates died unnoticed over a month — a permanently dead
 * job counted as "still processing" on every tick, forever, and looked exactly like a healthy
 * backlog.
 */
export type DebateNotPublishableCode =
  'not_complete' | 'recording_cancelled' | 'cancellation_window_open' | 'media_not_ready' | 'media_failed';

export class DebateNotPublishableError extends Error {
  code: DebateNotPublishableCode;
  constructor(code: DebateNotPublishableCode, message: string) {
    super(message);
    this.name = 'DebateNotPublishableError';
    this.code = code;
  }
}

/**
 * The finished debates in a space, as candidate ids for the publish sweep. Cancelled debates and
 * debates still inside their settlement window are excluded; media-readiness is re-checked per
 * debate by {@link loadDebatePublishSource}. Server-side (unauthenticated) read — the cron sweep
 * has no user session.
 */
export async function listSweepCandidateDebateIds(spaceId: string): Promise<string[]> {
  const response = await geoChatGet<SpaceDebatesResponse>(`/spaces/${spaceId}/debates`);
  const now = Date.now();
  return response.debates.filter(debate => isDebatePublishableNow(debate, now)).map(debate => debate.id);
}

/**
 * The space a debate publishes into (its claim's space). Lets the acceptor check editor rights
 * before {@link loadDebatePublishSource} renders and pins the share card.
 */
export async function loadDebateClaimSpaceId(debateId: string): Promise<string> {
  const debate = await geoChatGet<Debate>(`/debates/${debateId}`);
  return debate.claim.space_id;
}

/**
 * Gather everything the KG publish needs for a finished debate straight from geo-chat, and
 * assemble the pure `DebatePublishInput`. Throws {@link DebateNotPublishableError} unless the
 * debate is complete, its cancellation window has settled, and its media job has succeeded (the
 * reliable "processing done" signal).
 */
export async function loadDebatePublishSource(debateId: string): Promise<DebateSource> {
  const debate = await geoChatGet<Debate>(`/debates/${debateId}`);
  if (debate.status !== 'complete') {
    throw new DebateNotPublishableError(
      'not_complete',
      `Debate ${debateId} is not complete (status ${debate.status}).`
    );
  }
  assertDebateRecordingPublishable(debate, Date.now());

  const media = await geoChatGet<DebateMediaResponse>(`/debates/${debateId}/media`);
  // A failed job has already spent its retries in the worker; it is not coming back on its own.
  if (media.job?.status === 'failed') {
    throw new DebateNotPublishableError(
      'media_failed',
      `Debate ${debateId} media job failed permanently and will not be retried.`
    );
  }
  if (media.job?.status !== 'succeeded') {
    // Queued, running, or no job row yet — all of which the next tick may resolve. A missing job is
    // the weakest of the three: if the enqueue itself was lost there is nothing to wait for, but
    // that is indistinguishable from "about to be enqueued", so it stays a wait rather than risking
    // a false report of permanent death.
    throw new DebateNotPublishableError(
      'media_not_ready',
      `Debate ${debateId} media is not ready (job ${media.job?.status ?? 'missing'}).`
    );
  }

  // A job can succeed without composing a `final_video`; publishing then yields a videoless Debate.
  // Terminal, not a wait: the job that would have produced it has already finished.
  if (!hasProcessedVideo(media)) {
    throw new DebateNotPublishableError(
      'media_failed',
      `Debate ${debateId} media job succeeded without a processed final_video artifact.`
    );
  }

  // Build and check the durable URLs before the share card is pinned, so a refused publish does not
  // leave an orphaned IPFS pin.
  const videoUrl = durableArtifactUrl(debateId, 'final_video');
  const keyframeUrl = media.artifacts.some(artifact => artifact.kind === 'preview_image')
    ? durableArtifactUrl(debateId, 'preview_image')
    : null;
  await assertDurableArtifactUrlResolves(debateId, videoUrl);
  if (keyframeUrl) await assertDurableArtifactUrlResolves(debateId, keyframeUrl);

  const ogImageUrl = await buildDebateShareCard(debateId, debate, media);
  // Prefer geo-chat's canonical turns + pre-attributed claims (extracted in its media job, next to
  // transcription). geo-chat is the single authority on turn boundaries, so its `turn_index` lines
  // the published transcript blocks up with the claims exactly. Falls back to merging the raw
  // transcript ourselves (and publishing no claims) when claims aren't available yet.
  const extracted = await loadDebateClaims(debateId);
  const transcriptTurns = extracted?.transcriptTurns ?? (await loadTranscriptTurns(debateId, debate));
  const claims = extracted?.claims ?? [];

  const participants: DebatePublishParticipant[] = debate.participants.map(p => ({
    spaceEntityId: p.profile_space_id,
    displayName: p.display_name,
    position: p.position,
    participantSlot: p.participant_slot,
  }));

  const input: DebatePublishInput = {
    debateId: debate.id,
    spaceId: debate.claim.space_id,
    claimEntityId: debate.claim.claim_entity_id,
    claimText: debate.claim.claim,
    participants,
    videoUrl,
    keyframeUrl,
    ogImageUrl,
    transcriptTurns,
    claims,
  };

  return { debate, media, input };
}

export function isDebatePublishableNow(debate: Debate, now: number): boolean {
  if (debate.status !== 'complete' || debate.recording_cancelled_at !== null) return false;
  const deadline = debatePublicationDeadline(debate);
  return deadline !== null && now >= deadline + debatePublishSettlementMs;
}

function assertDebateRecordingPublishable(debate: Debate, now: number) {
  if (debate.recording_cancelled_at !== null) {
    throw new DebateNotPublishableError(
      'recording_cancelled',
      `Debate ${debate.id} recording was cancelled and must never be published.`
    );
  }
  const deadline = debatePublicationDeadline(debate);
  if (deadline === null || now < deadline + debatePublishSettlementMs) {
    throw new DebateNotPublishableError(
      'cancellation_window_open',
      `Debate ${debate.id} is still inside its recording cancellation settlement window.`
    );
  }
}

function debatePublicationDeadline(debate: Debate): number | null {
  const value = debate.turn_ends_at ?? debate.completed_at;
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** A presigned object-store URL for one media artifact. Expires in ~15 minutes. */
async function artifactUrl(debateId: string, kind: DebateMediaArtifactKind): Promise<string> {
  const { upload } = await geoChatPost<{ upload: { url: string } }>(`/debates/${debateId}/media/artifacts/url`, {
    kind,
  });
  return upload.url;
}

/**
 * Render the share card and pin it, or return null (GEO-2755).
 *
 * Null on any failure, deliberately. This sits in the path that writes the Debate and Video
 * entities on-chain, and a debate that fails to publish is a far worse outcome than one published
 * without a share card.
 *
 * **Both speaker stills are required.** The card is generated once at publish time and never
 * revisited, so falling back to the placeholder panels would bake them in permanently. A debate
 * whose stills are missing — anything rendered before geo-chat learned to produce them — is better
 * off with no card than with a wrong one that can never be corrected.
 */
type DebateSpeakerLike = Debate['participants'][number];

/** One speaker as the card wants them. Shared so the preview route cannot drift from the real card. */
function cardSpeaker(participant: DebateSpeakerLike, stillSrc: string): DebateOgSpeaker {
  return {
    name: participant.display_name ?? 'Anonymous',
    stance: participant.position_label,
    avatarSrc: participant.avatar_cid ? getImagePath(participant.avatar_cid) : null,
    stillSrc,
  };
}

/**
 * Everything the share card needs for one real debate, for the preview route (GEO-2755).
 *
 * The stills are presigned and expire in about fifteen minutes, which is fine here and is exactly
 * why the preview resolves them per request rather than handing anyone a URL with them baked in.
 * Throws `GeoChatRequestError` for an unknown id, and returns null when the debate is real but has
 * no stills — the same bar the published card holds to.
 */
export async function loadDebateOgPreview(debateId: string): Promise<DebateOgCardData | null> {
  const debate = await geoChatGet<Debate>(`/debates/${debateId}`);
  const media = await geoChatGet<DebateMediaResponse>(`/debates/${debateId}/media`);

  const bySlot = (slot: number) => debate.participants.find(participant => participant.participant_slot === slot);
  const [first, second] = [bySlot(1), bySlot(2)];
  if (!first || !second) return null;

  const hasStill = (kind: string) => media.artifacts.some(artifact => artifact.kind === kind);
  if (!hasStill('speaker_still_slot_1') || !hasStill('speaker_still_slot_2')) return null;

  const [stillOne, stillTwo] = await Promise.all([
    artifactUrl(debateId, 'speaker_still_slot_1' as DebateMediaArtifactKind),
    artifactUrl(debateId, 'speaker_still_slot_2' as DebateMediaArtifactKind),
  ]);

  return {
    claim: debate.claim.claim,
    speakers: [cardSpeaker(first, stillOne), cardSpeaker(second, stillTwo)],
  };
}

async function buildDebateShareCard(
  debateId: string,
  debate: Debate,
  media: DebateMediaResponse
): Promise<string | null> {
  try {
    const bySlot = (slot: number) => debate.participants.find(participant => participant.participant_slot === slot);
    const [first, second] = [bySlot(1), bySlot(2)];
    if (!first || !second) return null;

    const hasStill = (kind: string) => media.artifacts.some(artifact => artifact.kind === kind);
    if (!hasStill('speaker_still_slot_1') || !hasStill('speaker_still_slot_2')) {
      console.warn(`[debate-acceptor] debate ${debateId} has no speaker stills; publishing without a share card.`);
      return null;
    }

    const [stillOne, stillTwo] = await Promise.all([
      artifactUrl(debateId, 'speaker_still_slot_1' as DebateMediaArtifactKind),
      artifactUrl(debateId, 'speaker_still_slot_2' as DebateMediaArtifactKind),
    ]);

    const response = generateDebateOgImageResponse({
      claim: debate.claim.claim,
      speakers: [cardSpeaker(first, stillOne), cardSpeaker(second, stillTwo)],
    });
    const blob = new Blob([await response.arrayBuffer()], { type: 'image/png' });
    const { cid } = await uploadGeoImage({ blob });
    return cid;
  } catch (error) {
    console.warn(`[debate-acceptor] could not build a share card for ${debateId}; publishing without one.`, error);
    return null;
  }
}

type DebateExtractedClaimsTurn = {
  turn_index: number;
  participant_slot: number;
  /** The turn speaker's Geo personal-space entity id (the Authors relation target). */
  attributed_space_id: string;
  speaker_name: string | null;
  text: string;
};
type DebateExtractedClaimsClaim = { text: string; is_factual: boolean | null; turn_index: number };
type DebateExtractedClaimsResponse = { turns: DebateExtractedClaimsTurn[]; claims: DebateExtractedClaimsClaim[] };

/**
 * Load geo-chat's pre-computed, pre-attributed debate claims. geo-chat extracts them in its media
 * job (beside Whisper) and returns the canonical per-turn structure PLUS the claims keyed to it by
 * `turn_index`, so the transcript blocks we publish and the claims attach to the same turns.
 *
 * Returns null when claims are unavailable (older debate, extraction failed, or geo-chat does not
 * report claims for this debate) — the caller then falls back to the raw /transcript merge and
 * publishes with no claims. `turn_index` is expected 0-based and contiguous over non-empty turns.
 */
async function loadDebateClaims(
  debateId: string
): Promise<{ transcriptTurns: DebatePublishTurn[]; claims: DebateClaimInput[] } | null> {
  let response: DebateExtractedClaimsResponse;
  try {
    response = await geoChatGet<DebateExtractedClaimsResponse>(`/debates/${debateId}/claims`);
  } catch (error) {
    // A missing/failed claims read shouldn't block publishing the Debate + Transcript.
    console.warn(`[debate-acceptor] could not load extracted claims for ${debateId}; using raw transcript.`, error);
    return null;
  }
  if (!response || !Array.isArray(response.turns) || response.turns.length === 0) return null;

  const transcriptTurns: DebatePublishTurn[] = [...response.turns]
    .sort((a, b) => a.turn_index - b.turn_index)
    .map(turn => ({
      turnIndex: turn.turn_index,
      speakerSpaceEntityId: turn.attributed_space_id,
      speakerName: turn.speaker_name,
      text: turn.text,
    }));
  const claims: DebateClaimInput[] = (response.claims ?? []).map(claim => ({
    text: claim.text,
    isFactual: claim.is_factual ?? null,
    turnIndex: claim.turn_index,
  }));
  return { transcriptTurns, claims };
}

async function loadTranscriptTurns(debateId: string, debate: Debate) {
  const speakerBySlot = new Map(
    debate.participants.map(p => [
      p.participant_slot as number,
      { spaceEntityId: p.profile_space_id, displayName: p.display_name },
    ])
  );
  try {
    const transcript = await geoChatGet<DebateTranscriptResponse>(`/debates/${debateId}/transcript?format=json`);
    return mergeTranscriptSegmentsIntoTurns(
      transcript.segments.map(segment => ({ participantSlot: segment.participant_slot, text: segment.text })),
      speakerBySlot
    );
  } catch (error) {
    // A missing/failed transcript shouldn't block publishing the Debate + Video entities.
    console.warn(`[debate-acceptor] could not load transcript for ${debateId}; publishing without it.`, error);
    return [];
  }
}
