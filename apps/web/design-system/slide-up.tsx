import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

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
          className={cx('fixed inset-0 z-100 h-full w-full bg-grey-02', !isOpen && 'pointer-events-none')}
        >
          {children}
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
      type: 'spring',
      duration: 0.5,
      bounce: 0,
      delay: 0.5,
    },
  },
};

const transition = { type: 'spring', duration: 0.5, bounce: 0 };
