'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { atom, useAtom } from 'jotai';

import { Z_LAYER_CLASS } from '~/core/z-layers';

const toastAtom = atom<React.ReactElement<any> | null>(null);

export function useToast() {
  const [toast, setToast] = useAtom(toastAtom);

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
    // The live region stays mounted so screen readers reliably announce
    // toasts; only the toast content itself animates in and out.
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cx(
        'pointer-events-none fixed right-0 bottom-0 left-0 flex w-full justify-center p-4',
        Z_LAYER_CLASS.toast
      )}
    >
      <AnimatePresence>
        {toast && (
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
        )}
      </AnimatePresence>
    </div>
  );
}

const flowVariants = {
  hidden: { opacity: 0, y: '4px' },
  visible: (custom: boolean) => ({
    opacity: custom ? 1 : 0,
    y: custom ? '0px' : '4px',
    transition: {
      type: 'spring' as const,
      duration: 0.5,
      bounce: 0,
      delay: custom ? 0.5 : 0,
    },
  }),
};

const transition = { type: 'spring' as const, duration: 0.5, bounce: 0 };
