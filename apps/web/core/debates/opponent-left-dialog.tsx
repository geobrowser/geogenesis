'use client';

import * as React from 'react';

import cx from 'classnames';

import { useFocusTrap } from '~/core/debates/matchmaking/use-focus-trap';

import { Text } from '~/design-system/text';

/**
 * Shown when the other participant ends the session under you — Ready, live recording, or
 * Debate again — so the silent return those stages used to do is explained first.
 */
export function OpponentLeftDialog({
  recordingDiscarded = false,
  onAcknowledge,
}: {
  recordingDiscarded?: boolean;
  onAcknowledge: () => void;
}) {
  const dialogRef = useFocusTrap(true);

  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/60 px-4">
      <div
        ref={dialogRef as React.RefObject<HTMLDivElement>}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Opponent left"
        className="w-full max-w-[370px] rounded-lg bg-white p-5 text-center text-text outline-none"
      >
        <Text as="h2" variant="cardEntityTitle" color="text" className="leading-none">
          Opponent left
        </Text>
        <Text as="p" variant="metadata" color="text" className="mt-2">
          {recordingDiscarded
            ? 'Your opponent left the debate. Your recording was discarded.'
            : 'Your opponent left the debate.'}
        </Text>
        <Text as="p" variant="metadata" color="grey-04" className="mt-2">
          Find another match from Debates.
        </Text>
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onAcknowledge}
            className={cx(
              'inline-flex min-h-7 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-metadata',
              'bg-text text-white transition-colors hover:bg-text/90'
            )}
          >
            Find a match
          </button>
        </div>
      </div>
    </div>
  );
}
