import { motion } from 'framer-motion';

import * as React from 'react';

interface Props {
  children: React.ReactNode;
}

export function Toast({ children }: Props) {
  return (
    <motion.div
      className="fixed bottom-10 flex items-center justify-between rounded bg-text px-3 py-2 text-button text-white"
      initial={{ y: 90 }}
      animate={{ y: 0 }}
      exit={{ y: 90 }}
      transition={{ duration: 0.1, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}
