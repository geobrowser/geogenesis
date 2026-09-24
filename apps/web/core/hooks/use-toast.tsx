'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';

import { Z_LAYER_CLASS } from '~/core/z-layers';

type ToastPlacement = 'bottom' | 'top';
type ToastState = { content: React.ReactElement<any>; placement: ToastPlacement } | null;

const toastStateAtom = atom<ToastState>(null);

function toastAtomFor(placement: ToastPlacement) {
  return atom(
    get => get(toastStateAtom)?.content ?? null,
    (_get, set, content: React.ReactElement<any> | null) => {
      set(toastStateAtom, content ? { content, placement } : null);
    }
  );
}

const toastAtoms = {
  bottom: toastAtomFor('bottom'),
  top: toastAtomFor('top'),
};

export function useToast({ placement = 'bottom' }: { placement?: ToastPlacement } = {}) {
  const [toast, setToast] = useAtom(toastAtoms[placement]);

  return [toast, setToast] as const;
}

export function Toast() {
  const toastState = useAtomValue(toastStateAtom);
  const clearToast = useSetAtom(toastAtoms.bottom);
  const toast = toastState?.content ?? null;
  const placement = toastState?.placement ?? 'bottom';

  React.useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => clearToast(null), 5000);
    return () => clearTimeout(timeout);
  }, [clearToast, toast]);

  return (
    // The live region stays mounted so screen readers reliably announce
    // toasts; only the toast content itself animates in and out.
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cx(
        'pointer-events-none fixed right-0 left-0 flex w-full justify-center',
        placement === 'top' ? 'top-0 px-4 pt-0.5' : 'bottom-0 p-4',
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
