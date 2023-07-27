import { motion } from 'framer-motion';

import * as React from 'react';

export function Spinner() {
  return (
    <motion.svg
      initial={{ rotate: '0deg' }}
      animate={{ rotate: '360deg' }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      width="16"
      height="17"
      viewBox="0 0 16 17"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="8" cy="8.5" r="7.5" stroke="url(#paint0_angular_1066_25328)" />
      <defs>
        <radialGradient id="paint0_angular_1066_25328" cx="0" cy="0" r="1">
          <stop stopColor="#3963FE" />
          <stop offset="1" stopColor="#FE31C5" />
        </radialGradient>
      </defs>
    </motion.svg>
  );
}
