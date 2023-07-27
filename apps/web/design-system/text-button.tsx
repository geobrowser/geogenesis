import { cva } from 'class-variance-authority';

import * as React from 'react';

const buttonStyles = cva(
  'flex items-center bg-transparent outline-none text-smallButton hover:outline-none focus:outline-none',
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
