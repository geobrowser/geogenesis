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
 * Sized and coloured to sit inside a video tile — it is rendered in the local tile's
 * `recordingStatus` slot on both screens, the one corner neither screen spends on something else.
 * It used to be `fixed` to the top of the viewport, which put it nowhere near the thing it
 * describes and, because both screens centre their content vertically, left it floating alone
 * above the layout. On the tile it also reads as a statement about *your* camera, which is exactly
 * what it is: this is driven by the local `MediaRecorder`, not by the debate's status.
 *
 * Opaque backgrounds rather than the position label's `bg-white/60`: this indicator of all things
 * should not depend on what is behind it.
 */
export function DebateRecordingStatusPill({ recording }: { recording: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-tag leading-none whitespace-nowrap',
        // Dark text on the red, matching the Ready badge's dark-on-green: white on red-01 is
        // 3.2:1, under the 4.5:1 this indicator of all things should clear.
        recording ? 'border-red-01 bg-red-01 text-text' : 'border-grey-02 bg-white text-grey-04'
      )}
    >
      <span
        aria-hidden
        className={cx(
          'size-1.5 shrink-0 rounded-full',
          recording ? 'bg-text motion-safe:animate-pulse' : 'border border-grey-03 bg-transparent'
        )}
      />
      {recording ? 'Recording' : 'Not recording'}
    </span>
  );
}
