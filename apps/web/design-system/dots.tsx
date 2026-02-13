'use client';

import { motion, stagger } from 'framer-motion';

import * as React from 'react';

const loadingContainerVariants = {
  start: {
    transition: {
      delayChildren: stagger(0.2),
    },
  },
  end: {
    transition: {
      delayChildren: stagger(0.2),
    },
  },
};

const loadingCircleVariants = {
  start: {
    y: '-100%',
  },
  end: {
    y: '25%',
  },
};

interface Props {
  color?: 'bg-grey-03' | 'bg-grey-02';
}

export function Dots({ color = 'bg-grey-03' }: Props) {
  return (
    <motion.div
      className="flex items-center justify-center gap-0.5"
      variants={loadingContainerVariants}
      initial="start"
      animate="end"
    >
      {[0, 1, 2].map(index => (
        <motion.span
          key={index}
          className={`block h-1 w-1 rounded-full ${color}`}
          variants={loadingCircleVariants}
          transition={{
            duration: 0.225,
            repeat: Infinity,
            repeatType: 'reverse',
          }}
        />
      ))}
    </motion.div>
  );
}
