import type { Debate, DebateMediaResponse, DebateTranscriptResponse } from '../api';
import {
  type DebatePublishInput,
  type DebatePublishParticipant,
  mergeTranscriptSegmentsIntoTurns,
} from '../debate-publish-draft';

function geoChatBaseUrl() {
  const base =
    process.env.GEO_CHAT_API_BASE_URL || process.env.NEXT_PUBLIC_GEO_CHAT_API_BASE_URL || 'http://localhost:8080';
  return base.replace(/\/+$/, '');
}

async function geoChatGet<T>(path: string): Promise<T> {
  const response = await fetch(`${geoChatBaseUrl()}${path}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`geo-chat ${path} failed (${response.status})`);
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
    throw new Error(`geo-chat ${path} failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export type DebateSource = {
  debate: Debate;
  media: DebateMediaResponse;
  input: DebatePublishInput;
};

export class DebateNotPublishableError extends Error {
  code: 'not_complete' | 'media_not_ready';
  constructor(code: 'not_complete' | 'media_not_ready', message: string) {
    super(message);
    this.name = 'DebateNotPublishableError';
    this.code = code;
  }
}

/**
 * Gather everything the KG publish needs for a finished debate straight from geo-chat, and
 * assemble the pure `DebatePublishInput`. Throws {@link DebateNotPublishableError} unless the
 * debate is complete and its media job has succeeded (the reliable "processing done" signal).
 */
export async function loadDebatePublishSource(debateId: string): Promise<DebateSource> {
  const debate = await geoChatGet<Debate>(`/debates/${debateId}`);
  if (debate.status !== 'complete') {
    throw new DebateNotPublishableError(
      'not_complete',
      `Debate ${debateId} is not complete (status ${debate.status}).`
    );
  }

  const media = await geoChatGet<DebateMediaResponse>(`/debates/${debateId}/media`);
  if (media.job?.status !== 'succeeded') {
    throw new DebateNotPublishableError(
      'media_not_ready',
      `Debate ${debateId} media is not ready (job ${media.job?.status ?? 'missing'}).`
    );
  }

  const videoUrl = await resolveFinalVideoUrl(debateId, media);
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
    transcriptTurns,
  };

  return { debate, media, input };
}

async function resolveFinalVideoUrl(debateId: string, media: DebateMediaResponse): Promise<string | null> {
  const hasFinalVideo = media.artifacts.some(artifact => artifact.kind === 'final_video');
  if (!hasFinalVideo) return null;
  // NOTE: this is a presigned (expiring) URL. Flagged in TICKET.md — production needs a stable
  // public/CDN URL for the final video before this is durable on-chain.
  const { upload } = await geoChatPost<{ upload: { url: string } }>(`/debates/${debateId}/media/artifacts/url`, {
    kind: 'final_video',
  });
  return upload.url;
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
