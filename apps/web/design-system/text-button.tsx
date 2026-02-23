import { cva } from 'class-variance-authority';

import * as React from 'react';

const buttonStyles = cva(
  'flex items-center bg-transparent text-smallButton outline-hidden hover:outline-hidden focus:outline-hidden',
  {
    variants: {
      disabled: {
        true: 'cursor-not-allowed text-grey-04',
      },
      color: {
        'grey-04': 'text-grey-04 hover:text-text',
        ctaPrimary: 'text-ctaPrimary hover:text-ctaHover',
      },
    },
    defaultVariants: {
      color: 'grey-04',
    },
  }
);

interface Props extends React.ComponentPropsWithoutRef<'button'> {
  color?: 'grey-04' | 'ctaPrimary';
}

export function TextButton({ children, color = 'grey-04', disabled = false, ...props }: Props) {
  return (
    <button {...props} className={buttonStyles({ disabled, color })}>
      {children}
    </button>
  );
}
