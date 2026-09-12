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
 *
 * The red is `red-01` taken down to 30% lightness at the same hue, rather than `red-01` itself.
 * The chip is 60% white over whatever the camera is pointed at, so against dark video it settles
 * around mid-grey — where `red-01` measures about 1.1:1 and is effectively invisible. This clears
 * 3:1 even in that worst case and around 8:1 over a bright frame. It is a literal because the
 * palette has no dark red; if one is ever added, this is the value it wants.
 */
const recordingRed = '#991200';
export function DebateRecordingStatusPill({ recording }: { recording: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      style={recording ? { color: recordingRed } : undefined}
      className={cx(
        'inline-flex h-4 items-center gap-1 rounded-full bg-white/60 px-1.5 text-[0.75rem] leading-none whitespace-nowrap',
        !recording && 'text-text'
      )}
    >
      <span
        aria-hidden
        className={cx(
          'size-1.5 shrink-0 rounded-full border border-current',
          recording ? 'bg-current motion-safe:animate-pulse' : 'bg-transparent'
        )}
      />
      {recording ? 'Recording' : 'Not recording'}
    </span>
  );
}
