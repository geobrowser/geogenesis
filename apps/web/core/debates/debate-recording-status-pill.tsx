'use client';

import * as React from 'react';

import cx from 'classnames';

/**
 * GEO-2819. Says whether the camera is being written to disk, in the same place on the intro
 * screen and in the debate room.
 *
 * Both states are shown deliberately: an absent indicator is ambiguous between "not recording"
 * and "failed to render", so the neutral state is the assurance.
 *
 * Wears the position label's chip — same height, same translucent white, same type — because it
 * sits at the other end of the same row in the local tile's `status` slot, and two chips on one
 * line reading as two different components is worse than either. Colour carries the state: black
 * for the resting one, red once the recorder is running. It used to be `fixed` to the top of the
 * viewport, which put it nowhere near the thing it describes and, because both screens centre
 * their content vertically, left it floating alone above the layout.
 *
 * The dot is hollow when idle and filled when live, so the state does not rest on colour alone.
 */
export function DebateRecordingStatusPill({ recording }: { recording: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cx(
        'inline-flex h-4 items-center gap-1 rounded-full bg-white/60 px-1.5 text-[0.75rem] leading-none whitespace-nowrap',
        recording ? 'text-red-01' : 'text-text'
      )}
    >
      <span
        aria-hidden
        className={cx(
          'size-1.5 shrink-0 rounded-full border',
          recording ? 'border-red-01 bg-red-01 motion-safe:animate-pulse' : 'border-text bg-transparent'
        )}
      />
      {recording ? 'Recording' : 'Not recording'}
    </span>
  );
}
