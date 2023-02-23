import { motion } from 'framer-motion';
import useMeasure from 'react-use-measure';

interface Props {
  children: React.ReactNode;
  duration?: number;
}

export function ResizableContainer({ children, duration = 0.1 }: Props) {
  const [ref, { height }] = useMeasure();

  return (
    <motion.div layout animate={{ height }} transition={{ duration }} className="overflow-hidden">
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}
