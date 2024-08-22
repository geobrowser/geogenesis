'use client';

import { cva } from 'class-variance-authority';

import * as React from 'react';
import { forwardRef } from 'react';

import { ZERO_WIDTH_SPACE } from '~/core/constants';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'ghost'
  | 'transparent'
  | 'done'
  | 'success'
  | 'error';

type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  small?: boolean;
};

const buttonClassNames = (className = '') =>
  cva(
    `relative inline-flex items-center justify-center rounded-sm border font-medium tracking-[-0.17px] shadow-light transition duration-200 ease-in-out focus:outline-none ${className}`,

    {
      variants: {
        variant: {
          primary:
            'border-transparent bg-ctaPrimary text-white hover:bg-ctaHover focus:border-ctaHover focus:shadow-inner-ctaHover',
          secondary:
            'border-grey-02 bg-white !text-grey-04 shadow-button hover:border-text hover:bg-bg hover:!text-text focus:border-text focus:shadow-inner-text',
          tertiary: 'border-white bg-text text-white shadow-none',
          ghost:
            'border-transparent bg-white !text-grey-04 shadow-none hover:border-text hover:bg-bg hover:!text-text hover:shadow-button focus:border-text focus:shadow-inner-text',
          transparent:
            'border-text bg-transparent !text-text shadow-none hover:border-text hover:!text-text focus:border-text focus:shadow-inner-text',
          success: 'border-white bg-green text-white shadow-none',
          error: 'border-white bg-red-01 text-white shadow-none',
          done: 'border-green bg-green text-text',
          // using a variant for disabled to overwrite the background/text styles
          disabled: 'border-transparent bg-divider text-grey-03 hover:bg-divider',
        },
        small: {
          false: 'gap-2 px-3 py-2 text-[1.0625rem] text-button leading-[1.125rem]',
          true: 'gap-1.5 px-1.5 py-1 text-smallButton leading-none',
        },
        disabled: {
          true: 'cursor-not-allowed',
          false: 'cursor-pointer',
        },
      },

      defaultVariants: {
        variant: 'primary',
        small: false,
        disabled: false,
      },
    }
  );

export const Button = forwardRef(function Button(
  { variant = 'primary', icon, small = false, className = '', disabled = false, children, ...rest }: ButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  return (
    <button
      ref={ref}
      className={buttonClassNames(className)({ variant: !disabled ? variant : 'disabled', disabled, small })}
      disabled={disabled}
      {...rest}
    >
      {icon ?? null}
      {children ?? ZERO_WIDTH_SPACE}
    </button>
  );
});

type SquareButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  icon?: React.ReactNode;
  isActive?: boolean;
};

export const SquareButton = forwardRef(function SquareButton(
  { icon, isActive = false, className = '', style = {}, disabled = false, children, ...rest }: SquareButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  const squareButtonClassNames = cva([
    'relative box-border flex h-6 w-6 items-center justify-center rounded border bg-white text-text transition duration-200 ease-in-out hover:border-text hover:bg-bg hover:!text-text focus:border-text focus:shadow-inner-text focus:outline-none',
    !isActive ? 'border-grey-02' : 'border-text !bg-bg !text-text',
    !disabled
      ? 'cursor-pointer'
      : '!hover:border-divider !hover:bg-divider cursor-not-allowed !border-divider !bg-divider',
  ]);

  return (
    <button
      ref={ref}
      className={squareButtonClassNames({ className })}
      style={{ fontFeatureSettings: '"tnum" 1', ...style }}
      {...rest}
    >
      {icon ? icon : <>{children}</>}
    </button>
  );
});

type IconButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  icon: React.ReactNode;
};

const iconButtonClassNames = cva('background-transparent cursor-pointer border-none', {
  variants: {
    disabled: {
      true: 'cursor-not-allowed',
    },
  },
  defaultVariants: {
    disabled: false,
  },
});

export const IconButton = forwardRef(function IconButton(
  { icon, disabled = false, ...rest }: IconButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  return (
    <button ref={ref} className={iconButtonClassNames({ disabled })} {...rest}>
      {icon}
    </button>
  );
});

type SmallButtonProps = Omit<ButtonProps, 'small'>;

export const SmallButton = forwardRef(function SmallButton(
  { variant = 'secondary', ...rest }: SmallButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  return <Button ref={ref} variant={variant} small={true} {...rest} />;
});
