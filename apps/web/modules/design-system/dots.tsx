'use client';

import * as React from 'react';
import { motion } from 'framer-motion';

const loadingContainerVariants = {
  start: {
    transition: {
      staggerChildren: 0.2,
    },
  },
  end: {
    transition: {
      staggerChildren: 0.2,
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

export function Dots() {
  return (
    <motion.div
      className="flex items-center justify-between gap-0.5"
      variants={loadingContainerVariants}
      initial="start"
      animate="end"
    >
      <motion.span
        className="block h-1 w-1 rounded-full bg-grey-03"
        variants={loadingCircleVariants}
        transition={{
          duration: 0.225,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
      />
      <motion.span
        className="block h-1 w-1 rounded-full bg-grey-03"
        variants={loadingCircleVariants}
        transition={{
          duration: 0.225,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
      />
      <motion.span
        className="block h-1 w-1 rounded-full bg-grey-03"
        variants={loadingCircleVariants}
        transition={{
          duration: 0.225,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
      />
    </motion.div>
  );
}
