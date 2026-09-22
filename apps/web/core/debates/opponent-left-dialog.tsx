'use client';

import * as React from 'react';

import cx from 'classnames';

import { useFocusTrap } from '~/core/debates/matchmaking/use-focus-trap';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

/** Explains that the opponent left; shown after the viewer has left the dead debate screen. */
export function OpponentLeftDialog({
  recordingDiscarded = false,
  onClose,
  onFindDebate,
}: {
  recordingDiscarded?: boolean;
  onClose: () => void;
  onFindDebate: () => void;
}) {
  const dialogRef = useFocusTrap(true);

  return (
    <div className="fixed inset-0 z-[1350] grid place-items-center bg-black/60 px-4">
      <div
        ref={dialogRef as React.RefObject<HTMLDivElement>}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Opponent left"
        className="relative w-full max-w-[370px] rounded-lg bg-white p-5 text-center text-text outline-none"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 grid size-7 place-items-center rounded-full text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
        >
          <Close />
        </button>
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
            onClick={onFindDebate}
            className={cx(
              'inline-flex min-h-7 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-metadata',
              'bg-text text-white transition-colors hover:bg-text/90'
            )}
          >
            Find debate
          </button>
        </div>
      </div>
    </div>
  );
}
