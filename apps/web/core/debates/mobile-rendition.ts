import type { DebateRecording } from './api';

/**
 * Whether the feed may play a recording's mobile rendition (GEO-3118). Off unless
 * `NEXT_PUBLIC_DEBATE_MOBILE_RENDITIONS` is `1`.
 *
 * The feed plays both debaters' recordings at once, and each one is VP9 at the debater's camera
 * resolution. On an iPhone, the 1080p element of a 720p + 1080p pair dropped 412 of 2,207 frames
 * while the 720p one dropped none, and the crackle heard on both speakers fits a software decode
 * that starves audio output. geo-chat can write a 720p H.264 copy of each recording, which phones
 * decode in hardware, and reports it as `mobile_content_type`.
 *
 * Kept behind its own flag, separate from the worker's, because the last mobile playback change
 * (#2707) froze video within minutes of shipping and was reverted. Turn this on only after it has
 * been watched on a real iPhone, on a preview deployment.
 */
export const DEBATE_MOBILE_RENDITIONS_ENABLED = process.env.NEXT_PUBLIC_DEBATE_MOBILE_RENDITIONS === '1';

export type RecordingPlaybackVariant = 'mobile';

type NavigatorLike = Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & {
  platform?: string;
  userAgentData?: { mobile?: boolean };
};

/**
 * A phone or tablet: the devices whose decoders the pair overloads. iPadOS reports a desktop
 * Safari user agent, so it is told apart by its touch points.
 */
export function isMobilePlaybackDevice(nav: NavigatorLike | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  if (nav.userAgentData?.mobile) return true;
  const userAgent = nav.userAgent ?? '';
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

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
 * Which file of a recording the feed should sign for this viewer: the mobile rendition when the
 * flag is on, the device is a phone or tablet, geo-chat has written one, and the browser says it
 * can play it. Otherwise `undefined`, which asks for the recording exactly as before.
 */
export function recordingPlaybackVariant(
  recording: Pick<DebateRecording, 'mobile_content_type'> | null,
  {
    enabled = DEBATE_MOBILE_RENDITIONS_ENABLED,
    isMobile = isMobilePlaybackDevice,
    canPlay = browserCanPlay,
  }: {
    enabled?: boolean;
    isMobile?: () => boolean;
    canPlay?: (contentType: string) => boolean;
  } = {}
): RecordingPlaybackVariant | undefined {
  const contentType = recording?.mobile_content_type;
  if (!enabled || !contentType) return undefined;
  if (!isMobile() || !canPlay(contentType)) return undefined;
  return 'mobile';
}
