'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { useDiff } from '~/core/state/diff-store';

type MainProps = {
  children: React.ReactNode;
};

export const Main = ({ children }: MainProps) => {
  const { isReviewOpen } = useDiff();
  const isHidden = isReviewOpen;

  return (
    <motion.main
      variants={variants}
      animate="animate"
      transition={transition}
      custom={isHidden}
      className="mx-auto min-w-0 max-w-[1200px] flex-1 pt-8 pb-16"
    >
      {children}
    </motion.main>
  );
};

const transition = { type: 'spring' as const, duration: 0.5, bounce: 0 };

const variants = {
  animate: (open: boolean) => ({
    scale: open ? 0.95 : 1,
    opacity: open ? 0 : 1,
    transition: {
      type: 'spring' as const,
      duration: 0.5,
      bounce: 0,
      delay: open ? 0.5 : 0,
    },
  }),
};
