'use client';

import * as React from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { RemoveScroll } from 'react-remove-scroll';

type SlideUpProps = {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void | React.Dispatch<React.SetStateAction<boolean>>;
  children: React.ReactNode;
};

export const SlideUp = ({ isOpen, setIsOpen, children }: SlideUpProps) => {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="slide-up-root"
          className="fixed inset-0 z-[10000]"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Opaque layer so underlying route (e.g. space governance) never flashes before the sheet animates */}
          <div className="absolute inset-0 bg-white" aria-hidden />
          <motion.div
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={transition}
            className="absolute inset-0 flex h-full w-full flex-col overflow-hidden"
          >
            <RemoveScroll className="h-full w-full">
              <div className="h-full overflow-y-auto overscroll-contain bg-white">{children}</div>
            </RemoveScroll>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const variants = {
  hidden: { y: '100%' },
  visible: {
    y: '0%',
    transition: {
      type: 'spring' as const,
      duration: 0.5,
      bounce: 0,
    },
  },
};

const transition = { type: 'spring' as const, duration: 0.5, bounce: 0 };
