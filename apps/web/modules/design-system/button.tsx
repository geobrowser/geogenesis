import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import { Create } from './icons/create';
import { Spacer } from './spacer';
import { Theme } from './theme';
import { ColorValue } from './theme/colors';
import React from 'react';
import { Publish } from './icons/publish';
import { Eye } from './icons/eye';

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
        backgroundColorHover: theme.colors.white,
        borderColor: theme.colors['grey-02'],
        borderColorHover: theme.colors.text,
        borderColorFocus: theme.colors.text,
      };
  }
}

const StyledButton = styled.button<Required<Pick<Props, 'variant' | 'disabled' | 'square' | 'isActive'>>>(props => {
  const buttonColors = getButtonColors(props.variant, props.disabled, props.theme);
  console.log(props.square);

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

    ...(props.isActive && {
      boxShadow: `inset 0 0 0 2px ${buttonColors.borderColorFocus}`,
      outline: 'none',
    }),

    ...(props.square && {
      width: `${props.theme.space * 5}px`,
      height: `${props.theme.space * 5}px`,
    }),

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

type Icon = 'create' | 'publish' | 'eye';

const icons: Record<Icon, (color: ColorValue) => JSX.Element> = {
  create: (color: ColorValue) => <Create color={color} />,
  publish: (color: ColorValue) => <Publish color={color} />,
  eye: (color: ColorValue) => <Eye color={color} />,
};

interface Props {
  children: React.ReactNode;
  onClick: () => void;
  icon?: Icon;
  variant?: ButtonVariant;
  square?: boolean;
  isActive?: boolean;
  disabled?: boolean;
}

function getIconColor(variant: ButtonVariant, disabled: boolean, theme: Theme): ColorValue {
  if (disabled) return theme.colors['grey-03'];
  return variant === 'primary' ? theme.colors.white : theme.colors.ctaPrimary;
}

export function Button({
  children,
  onClick,
  icon,
  variant = 'primary',
  disabled = false,
  square = false,
  isActive = false,
}: Props) {
  const theme = useTheme();
  const iconColor = getIconColor(variant, disabled, theme);

  return (
    <StyledButton disabled={disabled} variant={variant} onClick={onClick} square={square} isActive={isActive}>
      {icon ? (
        <>
          {icons[icon](iconColor)}
          <Spacer width={8} />
        </>
      ) : null}
      {children}
    </StyledButton>
  );
}
