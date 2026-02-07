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
    <div
      className={cx('relative inline-flex h-2.5 w-4 items-center rounded-full p-px', className)}
      style={{
        // @ts-expect-error idk
        backgroundColor: checked ? colors.light.text : colors.light['grey-03'],
        // @ts-expect-error idk
        justifyContent: checked ? 'flex-end' : 'flex-start',
      }}
      {...rest}
    >
      <motion.div
        layout
        transition={{ type: 'spring', duration: 0.2, bounce: 0 }}
        className="h-[8px] w-[8px] rounded-full bg-white"
      />
      <Mousecatch />
    </div>
  );
};

// Increases the target size of the tappable area
const Mousecatch = () => <div className="absolute -inset-2" />;
