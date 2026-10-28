'use client';

import cx from 'classnames';

type Speaker = { name: string; local: boolean };

/** The scheduled turn owns the floor, even while the previous microphone is still open. */
export function DebateTurnNotice({
  speaker,
  nextSpeaker,
}: {
  speaker: Speaker | null;
  nextSpeaker: (Speaker & { seconds: number }) | null;
}) {
  if (!speaker && !nextSpeaker) return null;

  return (
    <div
      data-debate-turn-notice
      className={cx(
        'sticky top-2 z-50 mb-3 overflow-hidden rounded-xl break-words text-white',
        speaker?.local ? 'bg-[#185C37]' : 'bg-[#171717]'
      )}
    >
      <div role="status" aria-live="polite" aria-atomic="true" className="px-4 py-3">
        <p className="text-xl leading-6 font-semibold break-words">
          {speaker ? (speaker.local ? 'Your turn' : `${speaker.name}’s turn`) : 'Get ready'}
        </p>
        <p className="mt-1 text-sm leading-5">
          {speaker
            ? speaker.local
              ? 'Speak now — the floor is yours.'
              : 'Listen — the floor is theirs.'
            : 'Wait for your turn to start.'}
        </p>
      </div>
      {nextSpeaker && (
        // Keep the ticking number out of the live region; announce who is next once.
        <div className="bg-[#FFF0BF] px-4 py-2 text-[#332600]">
          <span role="status" aria-live="polite" className="font-semibold">
            {nextSpeaker.local ? 'You’re next' : `Up next: ${nextSpeaker.name}`}
          </span>
          <span className="text-sm"> · Starts in {nextSpeaker.seconds}s</span>
        </div>
      )}
    </div>
  );
}
