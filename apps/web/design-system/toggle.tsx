import cx from 'classnames';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';

import * as React from 'react';

import { colors } from './theme/colors';

type ToggleProps = {
  checked: boolean;
} & HTMLMotionProps<'div'>;

export const Toggle = ({ checked, className = '', ...rest }: ToggleProps) => {
  return (
    <motion.div
      className={cx('relative inline-flex h-[10px] w-[16px] items-center rounded-full p-[1px]', className)}
      style={{
        justifyContent: checked ? 'flex-end' : 'flex-start',
        backgroundColor: checked ? colors.light.text : '#B6B6B6',
      }}
      transition={{ type: 'spring', duration: 1, bounce: 0 }}
      layout
      {...rest}
    >
      <div className="h-[8px] w-[8px] rounded-full bg-white" />
      <Mousecatch />
    </motion.div>
  );
};

// Increases the target size of the tappable area
const Mousecatch = () => <div className="absolute -inset-2" />;
