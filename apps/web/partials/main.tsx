'use client';

import { motion } from 'framer-motion';

import * as React from 'react';

import { useDiff } from '~/core/state/diff-store';

type MainProps = {
  children: React.ReactNode;
};

export const Main = ({ children }: MainProps) => {
  const { isReviewOpen, isCompareOpen } = useDiff();
  const isHidden = isReviewOpen || isCompareOpen;

  return (
    <motion.main
      variants={variants}
      animate="animate"
      transition={transition}
      custom={isHidden}
      className="mx-auto max-w-[1200px] pb-16 pt-8 xl:px-[2ch]"
    >
      {children}
    </motion.main>
  );
};

const transition = { type: 'spring', duration: 0.5, bounce: 0 };

const variants = {
  animate: (open: boolean) => ({
    scale: open ? 0.95 : 1,
    opacity: open ? 0 : 1,
    transition: {
      type: 'spring',
      duration: 0.5,
      bounce: 0,
      delay: open ? 0.5 : 0,
    },
  }),
};
