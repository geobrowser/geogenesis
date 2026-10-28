import type { DebateRecording } from './api';

/**
 * Whether the feed may play a recording's feed rendition (GEO-3118). Off unless
 * `NEXT_PUBLIC_DEBATE_MOBILE_RENDITIONS` is `1`.
 *
 * The feed plays both debaters' recordings at once, and each one is the raw VP9 recording at the
 * debater's camera resolution, about 2.5 Mbps. That was too much twice over. On an iPhone, the
 * 1080p element of a 720p + 1080p pair dropped 412 of 2,207 frames while the 720p one dropped
 * none. And on a desktop, signed-out /explore left idle for 90 seconds downloaded 84 MB, 76.5 MB of
 * it the lead card's two recordings.
 *
 * geo-chat writes a 480p-capped H.264 copy of each recording (the variant is still called `mobile`
 * on the wire) at about 12x smaller than the recording, which phones decode in hardware, and
 * reports it as `mobile_content_type`. It is played on every device that says it can play it.
 *
 * Kept behind its own flag, separate from the worker's, because the last mobile playback change
 * (#2707) froze video within minutes of shipping and was reverted. Turn this on only after it has
 * been watched on a real iPhone, on a preview deployment. The flag keeps its original name so the
 * environment it is set in does not have to change.
 */
export const DEBATE_MOBILE_RENDITIONS_ENABLED = process.env.NEXT_PUBLIC_DEBATE_MOBILE_RENDITIONS === '1';

export type RecordingPlaybackVariant = 'mobile';

/** `canPlayType` on a throwaway element; `''` is the browser saying no. */
export function browserCanPlay(contentType: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.createElement('video').canPlayType(contentType) !== '';
  } catch {
    return false;
  }
}

/**
 * Which file of a recording the feed should sign for this viewer: the feed rendition when the flag
 * is on, geo-chat has written one, and the browser says it can play it, on any device. Otherwise
 * `undefined`, which asks for the recording exactly as before.
 */
export function recordingPlaybackVariant(
  recording: Pick<DebateRecording, 'mobile_content_type'> | null,
  {
    enabled = DEBATE_MOBILE_RENDITIONS_ENABLED,
    canPlay = browserCanPlay,
  }: {
    enabled?: boolean;
    canPlay?: (contentType: string) => boolean;
  } = {}
): RecordingPlaybackVariant | undefined {
  const contentType = recording?.mobile_content_type;
  if (!enabled || !contentType) return undefined;
  if (!canPlay(contentType)) return undefined;
  return 'mobile';
}
