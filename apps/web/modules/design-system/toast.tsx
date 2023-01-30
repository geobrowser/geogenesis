import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function Toast({ children }: Props) {
  return (
    <motion.div
      className="text-button text-white fixed flex justify-between items-center bottom-10 bg-text py-2 px-3 rounded"
      initial={{ y: 90 }}
      animate={{ y: 0 }}
      exit={{ y: 90 }}
      transition={{ duration: 0.1, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}
