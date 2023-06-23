import { cva } from 'class-variance-authority';
import * as React from 'react';

const webUrlFieldStyles = cva('w-full bg-transparent placeholder:text-grey-02 focus:outline-none', {
  variants: {
    variant: {
      body: 'text-body',
      tableCell: 'text-tableCell',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

interface Props {
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  variant?: 'body' | 'tableCell';
}

export function WebUrlField({ variant = 'body', ...props }: Props) {
  return <input {...props} className={webUrlFieldStyles({ variant: variant })} />;
}
