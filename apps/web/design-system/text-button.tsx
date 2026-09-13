import * as React from 'react';

import { cva } from 'class-variance-authority';

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
  // `disabled` reaches the element, not only the styling. It was destructured for
  // the variant and never passed on, so a button that looked disabled still fired
  // its onClick — `table-pagination` works around it by nulling the handler, and
  // the query-setup popover's Done committed while greyed out.
  return (
    <button {...props} disabled={disabled} className={buttonStyles({ disabled, color })}>
      {children}
    </button>
  );
}
