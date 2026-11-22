'use client';

type Speaker = { name: string; local: boolean };

/** The scheduled turn owns the floor, even while the previous microphone is still open. */
export function DebateTurnAnnouncement({
  speaker,
  nextSpeaker,
  microphoneMuted = false,
  connectionState = 'connected',
}: {
  speaker: Speaker | null;
  nextSpeaker: (Speaker & { seconds: number }) | null;
  microphoneMuted?: boolean;
  connectionState?: 'connecting' | 'reconnecting' | 'connected';
}) {
  const hasAnnouncement = speaker !== null || nextSpeaker !== null;
  const title = speaker ? (speaker.local ? 'Your turn' : `${speaker.name}’s turn`) : 'Get ready';
  const nextLabel = nextSpeaker ? (nextSpeaker.local ? 'You’re next' : `Up next: ${nextSpeaker.name}`) : '';
  const instruction =
    connectionState === 'connecting'
      ? 'Connecting to call audio…'
      : connectionState === 'reconnecting'
        ? 'Reconnecting — the debate clock is still running.'
        : speaker?.local
          ? microphoneMuted
            ? 'Your microphone is off.'
            : 'Speak now — the floor is yours.'
          : speaker
            ? 'Listen — the floor is theirs.'
            : 'Wait for your turn to start.';

  // Keep one live region mounted through turns and round breaks, without reading each tick.
  return (
    <p role="status" aria-label="Debate turn" aria-live="polite" aria-atomic="true" className="sr-only">
      {hasAnnouncement ? `${title}. ${instruction}${nextLabel ? ` ${nextLabel}.` : ''}` : ''}
    </p>
  );
}
