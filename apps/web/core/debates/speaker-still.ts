import type { DebateMediaArtifact, DebateMediaArtifactKind } from './api';
import { getGeoChatApiBaseUrl } from './geo-chat-public-base-url';

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
  return speakerStillContentUrl(debateId, slot);
}

/**
 * The durable content route for a debate's media artifact, whether or not the artifact list is in
 * hand: unauthenticated, and it 302s to a fresh presigned GET, so an image painted late in a long
 * session does not 403 on an expired signature. One spelling of the id whoever builds it: geo-chat
 * returns `debate.id` without hyphens, the feed derives it hyphenated from the entity id, and two
 * spellings are two images to the browser.
 */
export function debateArtifactContentUrl(debateId: string, kind: DebateMediaArtifactKind): string {
  const id = debateId.replace(/-/g, '').toLowerCase();
  return `${getGeoChatApiBaseUrl()}/debates/${encodeURIComponent(id)}/media/artifacts/${kind}/content`;
}

/**
 * A slot's still by its durable route. The explore feed may hand the card a presigned storage URL
 * instead (it saves a redirect); this is what the card falls back to when that one has lapsed.
 */
export function speakerStillContentUrl(debateId: string, slot: 1 | 2): string {
  return debateArtifactContentUrl(debateId, `speaker_still_slot_${slot}`);
}

/**
 * An `onError` for a still painted from a presigned storage URL: once it has lapsed (a tab left open
 * for hours) it is swapped, once, for the durable route, which signs afresh.
 */
export function fallBackToDurableStill(fallback: string) {
  return (event: { currentTarget: HTMLImageElement }) => {
    if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
  };
}
