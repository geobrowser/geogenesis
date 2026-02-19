'use client';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { RemoveScroll } from 'react-remove-scroll';

import * as React from 'react';

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
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={transition}
          className={cx('fixed inset-0 z-100 h-full w-full bg-white', !isOpen && 'pointer-events-none')}
        >
          <RemoveScroll className="h-full w-full">{children}</RemoveScroll>
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
      delay: 0.5,
    },
  },
};

const transition = { type: 'spring' as const, duration: 0.5, bounce: 0 };
