'use client';

import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';

const toast$ = observable<React.ReactNode | null>(null);

export function useToast() {
  const toast = useSelector(toast$);

  const setToast = React.useCallback((newToast: React.ReactNode | null) => {
    toast$.set(newToast);
  }, []);

  React.useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [toast, setToast]);

  return [toast, setToast] as const;
}

export function Toast() {
  const [toast] = useToast();

  return (
    <AnimatePresence>
      {toast && (
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 flex w-full justify-center p-4">
          <motion.div
            variants={flowVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={transition}
            custom={Boolean(toast)}
            className="pointer-events-auto inline-flex items-center gap-4 rounded bg-text p-2 pl-3 text-white shadow-card"
          >
            {toast}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const flowVariants = {
  hidden: { opacity: 0, y: '4px' },
  visible: (custom: boolean) => ({
    opacity: custom ? 1 : 0,
    y: custom ? '0px' : '4px',
    transition: {
      type: 'spring',
      duration: 0.5,
      bounce: 0,
      delay: custom ? 0.5 : 0,
    },
  }),
};

const transition = { type: 'spring', duration: 0.5, bounce: 0 };
