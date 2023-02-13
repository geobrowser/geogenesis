import * as React from 'react';
import { cva } from 'class-variance-authority';

import { Icon } from '~/modules/design-system/icon';
import { ZERO_WIDTH_SPACE } from '~/modules/constants';
import type { IconName } from '~/modules/design-system/icon';
import type { ColorName } from '~/modules/design-system/theme/colors';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'done';

type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  icon?: IconName;
  small?: boolean;
};

export const Button = ({
  variant = 'primary',
  icon,
  small = false,
  className = '',
  disabled = false,
  children,
  ...rest
}: ButtonProps) => {
  const buttonClassNames = cva(
    [
      'relative inline-flex justify-center items-center border rounded focus:outline-none transition ease-in-out duration-200  tracking-[-0.17px] font-medium',
      !small ? 'px-3 py-2 gap-2 text-[1.0625rem] leading-[1.125rem]' : 'px-1.5 py-1 gap-1 text-xs leading-none',
      !disabled ? 'cursor-pointer' : 'cursor-not-allowed',
    ],
    {
      variants: {
        variant: {
          primary: 'text-white bg-ctaPrimary hover:bg-ctaHover border-transparent',
          secondary:
            'text-text bg-white hover:bg-bg border-grey-02 hover:border-text focus:border-text focus:shadow-inner-text',
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
      className={buttonClassNames({ className, variant: !disabled ? variant : 'disabled' })}
      disabled={disabled}
      {...rest}
    >
      {icon && <Icon icon={icon} color={iconColor} />}
      {children ?? ZERO_WIDTH_SPACE}
    </button>
  );
};

type SquareButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  icon?: IconName;
  isActive?: boolean;
};

export const SquareButton = ({
  icon,
  isActive = false,
  style = {},
  disabled = false,
  children,
  ...rest
}: SquareButtonProps) => {
  const squareButtonClassNames = cva([
    'box-border relative flex justify-center items-center w-5 h-5 p-1 border rounded focus:outline-none transition ease-in-out duration-200 text-text bg-white hover:bg-bg hover:border-text focus:border-text focus:shadow-inner-text',
    !isActive ? 'border-grey-02' : 'border-text',
    !disabled ? 'cursor-pointer' : 'cursor-not-allowed',
  ]);

  return (
    <button className={squareButtonClassNames()} style={{ fontFeatureSettings: '"tnum" 1', ...style }} {...rest}>
      {icon ? <Icon icon={icon} color="grey-04" /> : <>{children}</>}
    </button>
  );
};

type IconButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  icon: IconName;
  color?: ColorName;
};

export const IconButton = ({ icon, color, disabled = false, ...rest }: IconButtonProps) => {
  const iconButtonClassNames = cva([
    'border-none background-transparent',
    !disabled ? 'cursor-pointer' : 'cursor-not-allowed',
  ]);

  return (
    <button className={iconButtonClassNames()} {...rest}>
      <Icon icon={icon} color={color} />
    </button>
  );
};

type SmallButtonProps = Omit<ButtonProps, 'small'>;

export const SmallButton = ({ variant = 'secondary', ...rest }: SmallButtonProps) => {
  return <Button variant={variant} small={true} {...rest} />;
};
