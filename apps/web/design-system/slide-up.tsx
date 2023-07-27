import * as Dialog from '@radix-ui/react-dialog';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';
import { useCallback } from 'react';

type SlideUpProps = {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void | React.Dispatch<React.SetStateAction<boolean>>;
  children: React.ReactNode;
};

export const SlideUp = ({ isOpen, setIsOpen, children }: SlideUpProps) => {
  const onClose = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose} modal={true}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {isOpen && (
            <Dialog.Content forceMount>
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
            </Dialog.Content>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
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
