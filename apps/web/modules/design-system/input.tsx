import { cva, VariantProps } from 'class-variance-authority';
import { HTMLAttributes } from 'react';
import { Search } from './icons/search';

const inputStyles = cva(
  `text-input w-full rounded outline-none outline-0 px-10px py-9px text-text shadow-inner shadow-grey-02 placeholder:text-grey-03
 hover:shadow-ctaPrimary focus:shadow-inner-lg focus:shadow-ctaPrimary disabled:bg-divider disabled:text-grey-03 disabled:hover:shadow-grey-02
  disabled:cursor-not-allowed`,
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

const inputContainerStyles = cva(`relative w-full`);
const iconContainerStyles = cva(`absolute left-3 top-2.5 z-10`);

interface Props extends HTMLAttributes<HTMLInputElement>, VariantProps<typeof inputStyles> {
  value?: string;
}

export function Input({
  withSearchIcon = false,
  withExternalSearchIcon = false,
  withFilterIcon = false,
  ...props
}: Props) {
  return (
    <div className={inputContainerStyles()}>
      {withSearchIcon && (
        <div className={iconContainerStyles()}>
          <Search />
        </div>
      )}
      <input className={inputStyles({ withSearchIcon, withExternalSearchIcon, withFilterIcon })} {...props} />
    </div>
  );
}
