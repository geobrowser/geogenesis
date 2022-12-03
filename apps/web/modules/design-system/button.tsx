import styled from '@emotion/styled';
import React, { ForwardedRef } from 'react';
import { HACKY_COPY_FILL_CLASS_NAME, ZERO_WIDTH_SPACE } from '../constants';
import { ContractSmall } from './icons/contract-small';
import { Copy } from './icons/copy';
import { Create } from './icons/create';
import { Expand } from './icons/expand';
import { ExpandSmall } from './icons/expand-small';
import { Eye } from './icons/eye';
import { Facts } from './icons/facts';
import { Filter } from './icons/filter';
import { Preset } from './icons/preset';
import { Publish } from './icons/publish';
import { Tick } from './icons/tick';
import { Trash } from './icons/trash';
import { Spacer } from './spacer';
import { Theme } from './theme';
import { ColorName } from './theme/colors';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'done';

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
    case 'tertiary':
      return {
        color: theme.colors.white,
        backgroundColor: theme.colors.text,
        backgroundColorHover: theme.colors.text,
        borderColor: theme.colors.text,
        borderColorHover: theme.colors.text,
        borderColorFocus: theme.colors.text,
      };
    case 'done':
      return {
        color: theme.colors.text,
        backgroundColor: theme.colors.green,
        backgroundColorHover: theme.colors.green,
        borderColor: theme.colors.green,
        borderColorHover: theme.colors.green,
        borderColorFocus: theme.colors.green,
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
    padding: `${props.theme.space * 2 + 0.5}px ${props.theme.space * 3}px`,
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

    transition: '200ms all ease-in-out',

    // HACK: The way our copy icon is designed the top "page" in the icon expects a fill color in order
    // to correctly render. For now we can just set the background color match the button background color.
    ['.' + HACKY_COPY_FILL_CLASS_NAME]: {
      fill: buttonColors.backgroundColor,
    },

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

type Icon =
  | 'create'
  | 'publish'
  | 'eye'
  | 'expand'
  | 'expandSmall'
  | 'contractSmall'
  | 'filter'
  | 'trash'
  | 'tick'
  | 'facts'
  | 'copy'
  | 'preset';

const icons: Record<Icon, (color?: ColorName) => JSX.Element> = {
  create: (color?: ColorName) => <Create color={color} />,
  publish: (color?: ColorName) => <Publish color={color} />,
  eye: (color?: ColorName) => <Eye color={color} />,
  expand: (color?: ColorName) => <Expand color={color} />,
  expandSmall: (color?: ColorName) => <ExpandSmall color={color} />,
  contractSmall: (color?: ColorName) => <ContractSmall color={color} />,
  filter: (color?: ColorName) => <Filter color={color} />,
  trash: (color?: ColorName) => <Trash color={color} />,
  tick: (color?: ColorName) => <Tick color={color} />,
  facts: (color?: ColorName) => <Facts color={color} />,
  copy: (color?: ColorName) => <Copy color={color} />,
  preset: (color?: ColorName) => <Preset color={color} />,
};

interface Props {
  children?: React.ReactNode;
  onClick?: ((event: React.MouseEvent<HTMLButtonElement>) => void) | (() => void);
  icon?: Icon;
  variant?: ButtonVariant;
  disabled?: boolean;
}

function getIconColor(variant: ButtonVariant, disabled: boolean, icon?: Icon): ColorName {
  if (disabled) return 'grey-03';
  switch (variant) {
    case 'primary':
      return 'white';
    case 'secondary':
      return 'ctaPrimary';
    case 'tertiary':
      return 'white';
    case 'done':
      return 'text';
  }
}

export const Button = React.forwardRef(function Button(
  { children, onClick, icon, variant = 'primary', disabled = false, ...props }: Props,
  ref: ForwardedRef<HTMLButtonElement>
) {
  const iconColor = getIconColor(variant, disabled, icon);

  return (
    <StyledButton ref={ref} disabled={disabled} variant={variant} onClick={onClick} {...props}>
      {icon && icons[icon](iconColor)}
      {icon && children && <Spacer width={8} />}
      {/* Use zero-width space to enforce min line height */}
      {children ?? ZERO_WIDTH_SPACE}
    </StyledButton>
  );
});

const StyledSquareButton = styled(StyledButton)<Props & { isActive?: boolean }>(props => {
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

type SquareButtonProps = Omit<Props, 'children'> & { isActive?: boolean; children?: React.ReactNode };

export const SquareButton = React.forwardRef(function SquareButton(
  { onClick, icon, children, isActive = false, variant = 'secondary', disabled = false, ...props }: SquareButtonProps,
  ref: ForwardedRef<HTMLButtonElement>
) {
  return (
    <StyledSquareButton
      ref={ref}
      isActive={isActive}
      variant={variant}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {icon ? <>{icons[icon]('grey-04')}</> : null}
      {icon && children && <Spacer width={8} />}
      {children ? <>{children}</> : null}
    </StyledSquareButton>
  );
});

interface IconButtonProps {
  icon: Icon;
  color?: ColorName;
  onClick?: () => void;
}

const UnstyledButton = styled.button({
  border: 'none',
  backgroundColor: 'transparent',

  '&:hover': {
    cursor: 'pointer',
  },
});

export const IconButton = React.forwardRef(function IconButton(
  { onClick, icon, color, ...props }: IconButtonProps,
  ref: ForwardedRef<HTMLButtonElement>
) {
  return (
    <UnstyledButton ref={ref} onClick={onClick} {...props}>
      {icons[icon](color)}
    </UnstyledButton>
  );
});

export const StyledLabel = styled(StyledButton)(props => ({
  minWidth: '67px',
  color: props.theme.colors.text,
  background: props.theme.colors['grey-01'],
  boxShadow: 'none',
}));

const StyledSmallButton = styled(StyledButton)<{ borderColor?: string }>(({ variant, theme, borderColor }) => {
  const colors = getButtonColors(variant, false, theme);

  return {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    padding: theme.space,
    backgroundColor: colors.backgroundColor,
    borderRadius: 4,
    boxShadow: `inset 0 0 0 1px ${borderColor || colors.borderColor}`,
    ...theme.typography.smallButton,
    color: colors.color,

    ':hover': {
      boxShadow: `inset 0 0 0 1px ${borderColor || colors.borderColor}`,
    },

    ':focus': {
      boxShadow: `inset 0 0 0 2px ${borderColor || colors.borderColor}`,
      outline: 'none',
    },
  };
});

export const SmallButton = React.forwardRef(function SmallButton(
  {
    onClick,
    children,
    icon,
    variant = 'secondary',
    disabled = false,
    borderColor,
    ...props
  }: Props & { borderColor?: string },
  ref: ForwardedRef<HTMLButtonElement>
) {
  const iconColor = getIconColor(variant, disabled, icon);

  return (
    <StyledSmallButton
      disabled={disabled}
      variant={variant}
      ref={ref}
      onClick={onClick}
      borderColor={borderColor}
      {...props}
    >
      {icon ? <>{icons[icon](variant === 'secondary' ? 'grey-04' : iconColor)}</> : null}
      {icon ? <Spacer width={6} /> : null}
      {children}
    </StyledSmallButton>
  );
});
