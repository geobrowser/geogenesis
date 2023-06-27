import { cva } from 'class-variance-authority';
import * as React from 'react';

const webUrlFieldStyles = cva('w-full bg-transparent placeholder:text-grey-02 focus:outline-none', {
  variants: {
    variant: {
      body: 'text-body',
      tableCell: 'text-tableCell',
    },
    editable: {
      false: 'text-ctaPrimary hover:text-ctaHover underline transition-colors duration-75 truncate',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

interface Props {
  isEditing?: boolean;
  placeholder?: string;
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  variant?: 'body' | 'tableCell';
}

export function WebUrlField({ variant = 'body', isEditing = false, ...props }: Props) {
  return isEditing ? (
    <input {...props} className={webUrlFieldStyles({ variant, editable: isEditing })} />
  ) : (
    <a
      href={props.value}
      target="_blank"
      rel="noreferrer"
      className={webUrlFieldStyles({ variant, editable: isEditing })}
    >
      {props.value}
    </a>
  );
}
