import * as React from 'react';
import { motion } from 'framer-motion';

import { useReview } from '~/modules/review';

type MainProps = {
  children: React.ReactNode;
};

export const Main = ({ children }: MainProps) => {
  const { isReviewOpen } = useReview();

  return (
    <motion.main
      variants={variants}
      animate="animate"
      transition={transition}
      custom={isReviewOpen}
      className="mx-auto max-w-[1200px] pt-8 pb-16  xl:px-[2ch]"
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
