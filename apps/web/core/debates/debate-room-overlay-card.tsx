import * as React from 'react';

import cx from 'classnames';

/**
 * The white card the debate room floats over the middle of its video tiles: the Open rounds pick
 * card after a round (GEO-3178). It also carried the end-of-debate card until GEO-3301 hid the room
 * at the end instead. Each card sets its own width, padding and gap through `className`.
 */
export function DebateRoomOverlayCard({ className, ...props }: React.ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      {...props}
      className={cx(
        'absolute top-1/2 left-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-white text-text shadow-card',
        className
      )}
    />
  );
}
