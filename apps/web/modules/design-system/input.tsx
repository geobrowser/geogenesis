import { cva, VariantProps } from 'class-variance-authority';
import styled from '@emotion/styled';
import { HTMLAttributes } from 'react';
import { Search } from './icons/search';

const StyledInput = styled.input(props => ({
  ...props.theme.typography.input,
  boxShadow: `inset 0 0 0 1px ${props.theme.colors['grey-02']}`,
  borderRadius: props.theme.radius,
  width: '100%',
  padding: `${9}px ${props.theme.space * 2.5}px`,
  outline: 'none',
  WebkitAppearance: 'none',

  '::placeholder': {
    color: props.theme.colors['grey-03'],
  },

  ':hover:enabled': {
    boxShadow: `inset 0 0 0 1px ${props.theme.colors.ctaPrimary}`,
  },

  ':focus': {
    boxShadow: `inset 0 0 0 2px ${props.theme.colors.ctaPrimary}`,
  },

  ':disabled': {
    backgroundColor: props.theme.colors.divider,
    color: props.theme.colors['grey-03'],
    cursor: 'not-allowed',
  },
}));

const inputStyles = cva(
  `text-input w-full rounded outline-none px-10px py-9px text-text shadow-inner shadow-grey-02 placeholder:text-grey-03
 hover:shadow-ctaPrimary focus:shadow-inner-lg focus:shadow-ctaPrimary disabled:bg-divider disabled:text-grey-03 disabled:hover:shadow-grey-02
  disabled:cursor-not-allowed`,
  {
    variants: {
      withIcon: {
        true: `pl-9`,
      },
    },
  }
);

const inputContainerStyles = cva(`relative, w-full`);
const iconContainerStyles = cva(`absolute left-5 top-4.5 z-10`);

interface Props extends HTMLAttributes<HTMLInputElement>, VariantProps<typeof inputStyles> {
  value?: string;
}

export function Input({ withIcon = false, ...props }: Props) {
  return (
    <div className={inputContainerStyles()}>
      {withIcon && (
        <div className={iconContainerStyles()}>
          <Search />
        </div>
      )}
      <input className={inputStyles({ withIcon: withIcon })} {...props} />
    </div>
  );
}
