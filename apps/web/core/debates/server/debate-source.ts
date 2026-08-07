import { uploadGeoImage } from '~/core/sdk/geo-client';

import type {
  Debate,
  DebateMediaArtifactKind,
  DebateMediaResponse,
  DebateTranscriptResponse,
  SpaceDebatesResponse,
} from '../api';
import {
  type DebatePublishInput,
  type DebatePublishParticipant,
  mergeTranscriptSegmentsIntoTurns,
} from '../debate-publish-draft';
import { hasProcessedVideo } from '../playback-utils';

const debatePublishSettlementMs = 60_000;

function geoChatBaseUrl() {
  const base =
    process.env.GEO_CHAT_API_BASE_URL || process.env.NEXT_PUBLIC_GEO_CHAT_API_BASE_URL || 'http://localhost:8080';
  return base.replace(/\/+$/, '');
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

export class DebateNotPublishableError extends Error {
  code: 'not_complete' | 'recording_cancelled' | 'cancellation_window_open' | 'media_not_ready';
  constructor(
    code: 'not_complete' | 'recording_cancelled' | 'cancellation_window_open' | 'media_not_ready',
    message: string
  ) {
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
  if (media.job?.status !== 'succeeded') {
    throw new DebateNotPublishableError(
      'media_not_ready',
      `Debate ${debateId} media is not ready (job ${media.job?.status ?? 'missing'}).`
    );
  }

  // A job can succeed without composing a `final_video`; publishing then yields a videoless Debate.
  if (!hasProcessedVideo(media)) {
    throw new DebateNotPublishableError('media_not_ready', `Debate ${debateId} has no processed final_video artifact.`);
  }

  const videoUrl = await pinArtifactToIpfs(debateId, 'final_video');
  const keyframeUrl = media.artifacts.some(artifact => artifact.kind === 'preview_image')
    ? await pinKeyframeToIpfs(debateId)
    : null;
  const transcriptTurns = await loadTranscriptTurns(debateId, debate);

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
    transcriptTurns,
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

/**
 * Pin a geo-chat media artifact to IPFS and return its permanent `ipfs://` URI.
 *
 * geo-chat only hands out presigned object-store URLs, and those expire after 15 minutes, so a
 * published one is dead well before anyone opens the entity. Download the bytes while the URL is
 * still valid and pin those instead.
 *
 * Uploaded as a blob rather than by URL: the SDK's URL path rejects any body that isn't an image,
 * and the final video is a webm.
 */
async function pinArtifactToIpfs(debateId: string, kind: DebateMediaArtifactKind): Promise<string> {
  const { upload } = await geoChatPost<{ upload: { url: string } }>(`/debates/${debateId}/media/artifacts/url`, {
    kind,
  });
  const response = await fetch(upload.url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Downloading ${kind} for debate ${debateId} failed (${response.status}).`);
  }
  const { cid } = await uploadGeoImage({ blob: await response.blob() });
  return cid;
}

async function pinKeyframeToIpfs(debateId: string): Promise<string | null> {
  try {
    return await pinArtifactToIpfs(debateId, 'preview_image');
  } catch (error) {
    // A missing poster shouldn't hold back the Debate + Video entities.
    console.warn(`[debate-acceptor] could not pin keyframe for ${debateId}; publishing without one.`, error);
    return null;
  }
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
