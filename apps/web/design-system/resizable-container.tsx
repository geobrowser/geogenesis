import * as React from 'react';

import { type Transition, motion } from 'framer-motion';
import useMeasure from 'react-use-measure';

type ResizableContainerProps = {
  duration?: number;
  /** Replaces `duration` when the motion needs more than a duration, e.g. an ease. */
  transition?: Transition;
  /**
   * Whether the first measurement grows the container from nothing, as a popover opening does. Off
   * for a region that should simply be there at its size and only animate later changes.
   */
  growOnMount?: boolean;
} & React.ComponentPropsWithoutRef<'div'>;

export function ResizableContainer({
  duration = 0.1,
  transition,
  growOnMount = true,
  ...rest
}: ResizableContainerProps) {
  const [ref, { height }] = useMeasure();

  return (
    <motion.div
      animate={{ height: growOnMount ? height : height || 'auto' }}
      transition={transition ?? { duration }}
      className="overflow-hidden"
    >
      <div ref={ref} {...rest} />
    </motion.div>
  );
}
