import { motion } from 'framer-motion';
import useMeasure from 'react-use-measure';

export function ResizableContainer({ children }: { children: React.ReactNode }) {
  const [ref, { height }] = useMeasure();
  return (
    <motion.div layout animate={{ height }} transition={{ duration: 0.1 }}>
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}
