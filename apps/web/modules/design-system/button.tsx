import { cva } from 'class-variance-authority';
import * as React from 'react';
import { forwardRef } from 'react';

import { ZERO_WIDTH_SPACE } from '~/modules/constants';
import type { IconName } from '~/modules/design-system/icon';
import { Icon } from '~/modules/design-system/icon';
import type { ColorName } from '~/modules/design-system/theme/colors';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'done';

type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  icon?: IconName;
  small?: boolean;
};

export const Button = forwardRef(function Button(
  { variant = 'primary', icon, small = false, className = '', disabled = false, children, ...rest }: ButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  const buttonClassNames = cva(
    [
      'relative inline-flex justify-center items-center border rounded focus:outline-none transition ease-in-out duration-200 tracking-[-0.17px] font-medium',
      !small ? 'px-3 py-2 gap-2 text-[1.0625rem] leading-[1.125rem]' : 'px-1 py-1 gap-1.5 text-sm leading-none',
      icon && small ? 'px-2' : '',
      !disabled ? 'cursor-pointer' : 'cursor-not-allowed',
    ],
    {
      variants: {
        variant: {
          primary:
            'text-white bg-ctaPrimary hover:bg-ctaHover border-transparent focus:border-ctaHover focus:shadow-inner-ctaHover',
          secondary:
            '!text-grey-04 hover:!text-text bg-white hover:bg-bg border-grey-02 hover:border-text focus:border-text focus:shadow-inner-text',
          tertiary: 'text-white bg-text border-text',
          done: 'text-text bg-green border-green',
          disabled: 'text-grey-03 bg-divider hover:bg-divider border-transparent',
        },
      },
    }
  );

  const iconColor = !small && variant === 'secondary' ? 'ctaPrimary' : undefined;

  return (
    <button
      ref={ref}
      className={buttonClassNames({ className, variant: !disabled ? variant : 'disabled' })}
      disabled={disabled}
      {...rest}
    >
      {icon && <Icon icon={icon} color={iconColor} />}
      {children ?? ZERO_WIDTH_SPACE}
    </button>
  );
});

type SquareButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  icon?: IconName;
  isActive?: boolean;
};

export const SquareButton = forwardRef(function SquareButton(
  { icon, isActive = false, style = {}, disabled = false, children, ...rest }: SquareButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  const squareButtonClassNames = cva([
    'box-border relative flex justify-center items-center w-6 h-6 p-1 border rounded focus:outline-none transition ease-in-out duration-200 text-text bg-white hover:bg-bg hover:border-text focus:border-text !text-grey-04 hover:!text-text focus:shadow-inner-text',
    !isActive ? 'border-grey-02' : 'border-text !text-text !bg-bg',
    !disabled ? 'cursor-pointer' : 'cursor-not-allowed',
  ]);

  return (
    <button
      ref={ref}
      className={squareButtonClassNames()}
      style={{ fontFeatureSettings: '"tnum" 1', ...style }}
      {...rest}
    >
      {icon ? <Icon icon={icon} /> : <>{children}</>}
    </button>
  );
});

type IconButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  icon: IconName;
  color?: ColorName;
};

export const IconButton = forwardRef(function IconButton(
  { icon, color, disabled = false, ...rest }: IconButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  const iconButtonClassNames = cva([
    'border-none background-transparent',
    !disabled ? 'cursor-pointer' : 'cursor-not-allowed',
  ]);

  return (
    <button ref={ref} className={iconButtonClassNames()} {...rest}>
      <Icon icon={icon} color={color} />
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
