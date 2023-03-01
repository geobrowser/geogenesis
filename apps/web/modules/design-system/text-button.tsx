import { cva } from 'class-variance-authority';
import * as React from 'react';

const buttonStyles = cva(
  'flex items-center text-grey-04 bg-transparent outline-none text-smallButton hover:text-text hover:outline-none focus:outline-none',
  {
    variants: {
      disabled: {
        true: 'cursor-not-allowed text-grey-04',
      },
    },
  }
);

interface Props extends React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> {}

export function TextButton({ children, disabled = false }: Props) {
  return <button className={buttonStyles({ disabled })}>{children}</button>;
}
