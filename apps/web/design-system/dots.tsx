'use client';

import { motion } from 'framer-motion';

import * as React from 'react';

interface Props {
  color?: 'bg-grey-03' | 'bg-grey-02';
}

export function Dots({ color = 'bg-grey-03' }: Props) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      {[0, 1, 2].map(index => (
        <motion.span
          key={index}
          className={`block h-1 w-1 rounded-full ${color}`}
          animate={{ y: ['-100%', '25%'] }}
          transition={{
            duration: 0.225,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'easeInOut',
            delay: index * 0.2,
          }}
        />
      ))}
    </div>
  );
}
