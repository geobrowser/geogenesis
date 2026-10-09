export type DebateJoinState = {
  micOn: boolean;
  cameraOn: boolean;
};

type DebateJoinStateCopy = {
  summary: string;
  announcement: string;
};

export function describeJoinState({ micOn, cameraOn }: DebateJoinState): DebateJoinStateCopy {
  if (micOn && cameraOn) {
    return { summary: 'Joining with mic and camera on', announcement: 'You will join with mic and camera on.' };
  }
  if (micOn) {
    return {
      summary: 'Joining with mic on, camera off',
      announcement: 'You will join with your mic on and camera off.',
    };
  }
  if (cameraOn) {
    return { summary: 'Joining muted', announcement: 'You will join muted, with your camera on.' };
  }
  return { summary: 'Joining listening only', announcement: 'You will join listening only.' };
}

export type DebateMediaPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export function mayAutoStartPreview(permission: DebateMediaPermission): boolean {
  return permission === 'granted';
}

export function isMediaBlocked(permission: DebateMediaPermission): boolean {
  return permission === 'denied';
}

/**
 * The format, in one line, with the total speaking time it comes to.
 */
export function describeFormatLine({
  label,
  turnDurationsMs,
  isOpenRounds = false,
  openRounds,
}: {
  label: string | null;
  turnDurationsMs: readonly number[];
  isOpenRounds?: boolean;
  openRounds?: { maxRebuttalRounds: number; rebuttalTurnMs: number } | null;
}): string {
  const openingMs = turnDurationsMs.reduce((total, ms) => total + ms, 0);
  const withLabel = (time: string) => (label ? `${label} · ${time}` : time);

  if (!isOpenRounds) return withLabel(`${formatTotalSpeakingTime(openingMs)} total`);

  if (openRounds) {
    const rebuttalMs = openRounds.maxRebuttalRounds * openRounds.rebuttalTurnMs * 2;
    return withLabel(`up to ${formatTotalSpeakingTime(openingMs + rebuttalMs)} total`);
  }

  return withLabel(`at least ${formatTotalSpeakingTime(openingMs)}`);
}

/** Whole minutes where it divides, otherwise minutes and seconds — never a bare second count. */
export function formatTotalSpeakingTime(totalMs: number): string {
  const totalSeconds = Math.round(totalMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds}s`;
}

/**
 * How a room should start, read from the devices it inherited.
 */
export function inheritedJoinState(
  kinds: readonly string[],
  /**
   * Whether a card handed this room its devices — true when the session was already open under the
   * room's own key before the room claimed it.
   *
   * It is the only thing that tells the two meanings of "no tracks" apart. A card that chose to
   * join listening only holds nothing, and so does a room nobody passed through a card to reach;
   * without this, choosing "listening only" arrived unmuted with the camera on, which is the one
   * outcome the choice exists to prevent.
   */
  handedOver = false
): { audioMuted: boolean; videoEnabled: boolean } {
  if (kinds.length === 0)
    return handedOver ? { audioMuted: true, videoEnabled: false } : { audioMuted: false, videoEnabled: true };
  return { audioMuted: !kinds.includes('audio'), videoEnabled: kinds.includes('video') };
}

/**
 * What `ensurePreview` should be asked for to hold a given join state.
 *
 * Never less than what is already open: a kind that is live is always named, so the request cannot
 * close it. The ready room mutes rather than closes — unmuting has to be instant, and closing the
 * device would put the browser's permission prompt in the middle of a call.
 *
 * Never more than the state wants, either, which is what keeps a card's choice intact on arrival.
 * Asking for both kinds unconditionally there opened a camera the person had chosen to leave off,
 * prompted them for it, and — if they said no — left the preview in an error state where the ready
 * room hides its own toggles, so there was no way back.
 */
export function kindsForJoinState(
  next: { audioMuted: boolean; videoEnabled: boolean },
  liveKinds: readonly string[]
): { audio: boolean; video: boolean } {
  const kinds = new Set(liveKinds);
  return {
    audio: !next.audioMuted || kinds.has('audio'),
    video: next.videoEnabled || kinds.has('video'),
  };
}

export function joinStateNeedsOpening(
  next: { audioMuted: boolean; videoEnabled: boolean },
  liveKinds: readonly string[]
): boolean {
  const kinds = new Set(liveKinds);
  return (!next.audioMuted && !kinds.has('audio')) || (next.videoEnabled && !kinds.has('video'));
}
