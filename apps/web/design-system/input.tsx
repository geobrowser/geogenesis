import { VariantProps, cva } from 'class-variance-authority';

import * as React from 'react';
import { ForwardedRef } from 'react';

import { Search } from './icons/search';

// appearance-none fixes iOS specific shadow issues.
const inputStyles = cva(
  'appearance-none text-input w-full rounded outline-none px-[10px] py-[9px] text-text shadow-inner shadow-grey-02 placeholder:text-grey-03 hover:shadow-text focus:shadow-inner-lg focus:shadow-text disabled:bg-divider disabled:text-grey-03 disabled:hover:shadow-grey-02 transition-all duration-150 disabled:cursor-not-allowed',
  {
    variants: {
      withSearchIcon: {
        true: `pl-9`,
      },
      withExternalSearchIcon: {
        true: `pl-9`,
      },
      withFilterIcon: {
        true: `rounded-r-none`,
      },
    },
  }
);

interface Props
  extends React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>,
    VariantProps<typeof inputStyles> {
  value?: string;
}

export const Input = React.forwardRef(function Input(
  { withSearchIcon = false, withExternalSearchIcon = false, withFilterIcon = false, ...props }: Props,
  ref: ForwardedRef<HTMLInputElement>
) {
  return (
    <div ref={ref} className="relative w-full">
      {withSearchIcon && (
        <div className="absolute left-3 top-2.5 z-10">
          <Search />
        </div>
      )}
      <input className={inputStyles({ withSearchIcon, withExternalSearchIcon, withFilterIcon })} {...props} />
    </div>
  );
});
