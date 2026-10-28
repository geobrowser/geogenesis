'use client';

import cx from 'classnames';

import { Text } from '~/design-system/text';

type Speaker = { name: string; local: boolean };

/** The scheduled turn owns the floor, even while the previous microphone is still open. */
export function DebateTurnNotice({
  speaker,
  nextSpeaker,
  microphoneMuted = false,
  reconnecting = false,
}: {
  speaker: Speaker | null;
  nextSpeaker: (Speaker & { seconds: number }) | null;
  microphoneMuted?: boolean;
  reconnecting?: boolean;
}) {
  const visible = speaker !== null || nextSpeaker !== null;
  const title = speaker ? (speaker.local ? 'Your turn' : `${speaker.name}’s turn`) : 'Get ready';
  const nextLabel = nextSpeaker ? (nextSpeaker.local ? 'You’re next' : `Up next: ${nextSpeaker.name}`) : '';
  const instruction = reconnecting
    ? 'Reconnecting — the debate clock is still running.'
    : speaker?.local
      ? microphoneMuted
        ? 'Your microphone is off.'
        : 'Speak now — the floor is yours.'
      : speaker
        ? 'Listen — the floor is theirs.'
        : 'Wait for your turn to start.';

  return (
    <>
      {/* Mount before a turn/count-in starts. Updating an existing live region announces the
          handoff reliably; mounting it with its message already filled can be silent. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {visible ? `${title}. ${instruction}${nextLabel ? ` ${nextLabel}.` : ''}` : ''}
      </p>
      {visible && (
        <div
          data-debate-turn-notice
          className={cx(
            'sticky top-2 z-50 mb-3 overflow-hidden rounded-xl break-words text-white',
            speaker?.local ? 'bg-purple' : 'bg-text'
          )}
        >
          <div aria-hidden="true" className="px-4 py-3">
            <Text as="p" variant="mediumTitle" color="white">
              {title}
            </Text>
            <Text as="p" variant="metadata" color="white" className="mt-1">
              {instruction}
            </Text>
          </div>
          {nextSpeaker && (
            <div className="bg-ctaTertiary px-4 py-2 text-text">
              <Text variant="metadataMedium" color="current">
                {nextLabel}
              </Text>
              {/* Readable on demand, without announcing each ticking second. */}
              <Text variant="metadata" color="current">
                {' '}
                · Starts in {nextSpeaker.seconds}s
              </Text>
            </div>
          )}
        </div>
      )}
    </>
  );
}
