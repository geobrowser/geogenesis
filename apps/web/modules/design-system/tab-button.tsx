import styled from '@emotion/styled';
import React, { ForwardedRef, forwardRef } from 'react';
import { HACKY_COPY_FILL_CLASS_NAME } from '../constants';
import { Entity } from './icons/entity';
import { Facts } from './icons/facts';
import { OrganizeData } from './icons/organize-data';
import { Target } from './icons/target';
import { Spacer } from './spacer';
import { ColorName } from './theme/colors';

const StyledButton = styled.button<{ isActive: boolean }>(({ theme, isActive }) => ({
  ...theme.typography.button,

  boxSizing: 'border-box',
  backgroundColor: theme.colors.bg,
  color: theme.colors.text,
  padding: `${theme.space * 2 + 0.5}px ${theme.space * 3}px`,
  borderRadius: theme.radius,
  cursor: 'pointer',
  outline: 'none',
  position: 'relative',

  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',

  // Using box-shadow instead of border to prevent layout shift going between 1px and 2px border sizes. There's
  // other things we can do like toggling padding but this seems simplest.
  boxShadow: `inset 0 0 0 1px ${theme.colors.text}`,

  transition: '150ms all ease-in-out',

  ['.' + HACKY_COPY_FILL_CLASS_NAME]: {
    fill: theme.colors.bg,
  },

  svg: {
    color: isActive ? theme.colors.white : theme.colors['grey-04'],
    transition: '200ms all ease-in-out',
  },

  ':hover': {
    backgroundColor: isActive ? theme.colors.text : theme.colors.white,

    svg: {
      color: isActive ? theme.colors.white : theme.colors.text,
    },
  },

  ':focus': {
    backgroundColor: isActive ? theme.colors.text : theme.colors.bg,
    color: isActive ? theme.colors.white : theme.colors.text,
    boxShadow: `inset 0 0 0 2px ${theme.colors.text}`,
    outline: 'none',
  },

  ':disabled': {
    backgroundColor: theme.colors.divider,
    color: theme.colors['grey-03'],
    boxShadow: 'none',
    cursor: 'not-allowed',
  },

  ...(isActive && {
    backgroundColor: theme.colors.text,
    color: theme.colors.white,

    // HACK: The way our copy icon is designed the top "page" in the icon expects a fill color in order
    // to correctly render. For now we can just set the background color match the button background color.
    ['.' + HACKY_COPY_FILL_CLASS_NAME]: {
      fill: theme.colors.text,
    },
  }),
}));

type Icon = 'entity' | 'organize-data' | 'facts' | 'target';

const icons: Record<Icon, React.FunctionComponent<{ color?: ColorName }>> = {
  'organize-data': OrganizeData,
  entity: Entity,
  facts: Facts,
  target: Target,
};

// function getIconColor(isActive: boolean, isHovered: boolean, disabled: boolean): ColorName {
//   if (disabled) return 'grey-03';
//   if (isHovered && isActive) return 'white';
//   if (isActive) return 'white';
//   if (isHovered) return 'text';
//   return 'grey-04';
// }

interface Props {
  isActive: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  icon: Icon;
  disabled?: boolean;
}

export const TabButton = forwardRef(function OnboardingButton(
  { isActive, onClick, children, icon, disabled = false }: Props,
  ref: ForwardedRef<HTMLButtonElement>
) {
  const IconComponent = icons[icon];

  return (
    <StyledButton disabled={disabled} ref={ref} isActive={isActive} onClick={onClick}>
      <IconComponent />
      <Spacer width={8} />
      {children}
    </StyledButton>
  );
});
