import { motion } from 'framer-motion';
import useMeasure from 'react-use-measure';

import * as React from 'react';

type ResizableContainerProps = {
  duration?: number;
} & React.ComponentPropsWithoutRef<'div'>;

export function ResizableContainer({ duration = 0.1, ...rest }: ResizableContainerProps) {
  const [ref, { height }] = useMeasure();

  return (
    <motion.div layout animate={{ height }} transition={{ duration }} className="overflow-hidden">
      <div ref={ref} {...rest} />
    </motion.div>
  );
}
