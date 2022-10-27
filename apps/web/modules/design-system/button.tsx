import styled from '@emotion/styled';
import { Create } from './icons/create';
import { Spacer } from './spacer';
import { Theme } from './theme';
import { ColorName } from './theme/colors';
import React, { ForwardedRef } from 'react';
import { Publish } from './icons/publish';
import { Eye } from './icons/eye';
import { Expand } from './icons/expand';
import { ExpandSmall } from './icons/expand-small';
import { ContractSmall } from './icons/contract-small';

type ButtonVariant = 'primary' | 'secondary';

function getButtonColors(variant: ButtonVariant, disabled: boolean, theme: Theme) {
  if (disabled) {
    return {
      color: theme.colors['grey-03'],
      backgroundColor: theme.colors.divider,
      backgroundColorHover: theme.colors.divider,
      borderColor: 'transparent',
      borderColorHover: 'transparent',
      borderColorFocus: 'transparent',
    };
  }

  switch (variant) {
    case 'primary':
      return {
        color: theme.colors.white,
        backgroundColor: theme.colors.ctaPrimary,
        backgroundColorHover: theme.colors.ctaHover,
        borderColor: 'transparent',
        borderColorHover: 'transparent',
        borderColorFocus: theme.colors.ctaHover,
      };
    case 'secondary':
      return {
        color: theme.colors.text,
        backgroundColor: theme.colors.white,
        backgroundColorHover: theme.colors.bg,
        borderColor: theme.colors['grey-02'],
        borderColorHover: theme.colors.text,
        borderColorFocus: theme.colors.text,
      };
  }
}

const StyledButton = styled.button<Required<Pick<Props, 'variant' | 'disabled'>>>(props => {
  const buttonColors = getButtonColors(props.variant, props.disabled, props.theme);

  return {
    ...props.theme.typography.button,

    boxSizing: 'border-box',
    backgroundColor: buttonColors.backgroundColor,
    color: buttonColors.color,
    padding: `${props.theme.space * 2}px ${props.theme.space * 2.5}px`,
    borderRadius: props.theme.radius,
    cursor: 'pointer',
    outline: 'none',
    position: 'relative',

    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',

    // Using box-shadow instead of border to prevent layout shift going between 1px and 2px border sizes. There's
    // other things we can do like toggling padding but this seems simplest.
    boxShadow: `inset 0 0 0 1px ${buttonColors.borderColor}`,

    // TODO: Placeholder until we do motion design
    transition: '200ms all ease-in-out',

    ':hover': {
      boxShadow: `inset 0 0 0 1px ${buttonColors.borderColorHover}`,
      backgroundColor: buttonColors.backgroundColorHover,
    },

    ':focus': {
      boxShadow: `inset 0 0 0 2px ${buttonColors.borderColorFocus}`,
      outline: 'none',
    },

    ':disabled': {
      boxShadow: 'none',
      cursor: 'not-allowed',
    },
  };
});

type Icon = 'create' | 'publish' | 'eye' | 'expand' | 'expandSmall' | 'contractSmall';

const icons: Record<Icon, (color: ColorName) => JSX.Element> = {
  create: (color: ColorName) => <Create color={color} />,
  publish: (color: ColorName) => <Publish color={color} />,
  eye: (color: ColorName) => <Eye color={color} />,
  expand: (color: ColorName) => <Expand color={color} />,
  expandSmall: (color: ColorName) => <ExpandSmall color={color} />,
  contractSmall: (color: ColorName) => <ContractSmall color={color} />,
};

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: Icon;
  variant?: ButtonVariant;
  disabled?: boolean;
}

function getIconColor(variant: ButtonVariant, disabled: boolean): ColorName {
  if (disabled) return 'grey-03';
  return variant === 'primary' ? 'white' : 'ctaPrimary';
}

export const Button = React.forwardRef(function Button(
  { children, onClick, icon, variant = 'primary', disabled = false }: Props,
  ref: ForwardedRef<HTMLButtonElement>
) {
  const iconColor = getIconColor(variant, disabled);

  return (
    <StyledButton ref={ref} disabled={disabled} variant={variant} onClick={onClick}>
      {icon ? (
        <>
          {icons[icon](iconColor)}
          <Spacer width={8} />
        </>
      ) : null}
      {children}
    </StyledButton>
  );
});

const StyledSmallButton = styled(StyledButton)<Props & { isActive?: boolean }>(props => {
  const colors = getButtonColors(props.variant, props.disabled, props.theme);

  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${props.theme.space}px`,
    height: props.theme.space * 5,
    width: props.theme.space * 5,

    backgroundColor: props.isActive ? colors.backgroundColorHover : colors.backgroundColor,
    fontFeatureSettings: '"tnum" 1',

    boxShadow: props.isActive ? `inset 0 0 0 1px ${colors.borderColorHover}` : `inset 0 0 0 1px ${colors.borderColor}`,
  };
});

type SmallButtonProps = Omit<Props, 'children'> & { isActive?: boolean; children?: React.ReactNode };

export const SmallButton = React.forwardRef(function SmallButton(
  { onClick, icon, children, isActive = false, variant = 'secondary', disabled = false }: SmallButtonProps,
  ref: ForwardedRef<HTMLButtonElement>
) {
  return (
    <StyledSmallButton ref={ref} isActive={isActive} variant={variant} disabled={disabled} onClick={onClick}>
      {icon ? <>{icons[icon]('grey-04')}</> : null}
      {icon && children && <Spacer width={8} />}
      {children ? <>{children}</> : null}
    </StyledSmallButton>
  );
});
