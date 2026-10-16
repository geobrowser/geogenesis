import { type DebateMediaArtifact, getGeoChatApiBaseUrl } from './api';

/**
 * The still frame geo-chat's media job cuts from each debater's own recording, ten seconds into
 * their first turn (`speaker_still_slot_1` / `speaker_still_slot_2`).
 *
 * It is the one image that exists per tile before any video bytes have arrived, so the explore card
 * paints it as the tile's poster instead of a grey box. It is absent on a debate rendered before
 * geo-chat learned to cut stills, and the tile then simply has no poster.
 */
export function speakerStillUrl(
  debateId: string,
  slot: number | null | undefined,
  artifacts: Pick<DebateMediaArtifact, 'kind'>[] | undefined
): string | null {
  if (slot !== 1 && slot !== 2) return null;
  const kind = `speaker_still_slot_${slot}` as const;
  if (!artifacts?.some(artifact => artifact.kind === kind)) return null;
  // The durable content route, not a presigned URL: it is unauthenticated and 302s to a fresh
  // presigned GET, so a poster painted late in a long session does not 403 on an expired signature.
  return `${getGeoChatApiBaseUrl()}/debates/${encodeURIComponent(debateId)}/media/artifacts/${kind}/content`;
}
