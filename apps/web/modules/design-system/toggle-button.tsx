import styled from '@emotion/styled';
import React, { Children, ForwardedRef, forwardRef, useState } from 'react';
import { text } from 'stream/consumers';
import { Button } from './button';
import { Copy } from './icons/copy';
import { Entity } from './icons/entity';
import { Facts } from './icons/facts';
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

  // TODO: Placeholder until we do motion design
  transition: '200ms all ease-in-out',

  ':hover': {
    boxShadow: `inset 0 0 0 1px ${theme.colors.text}`,
    backgroundColor: isActive ? theme.colors.text : theme.colors.white,
  },

  ':focus': {
    boxShadow: `inset 0 0 0 2px ${theme.colors.text}`,
    outline: 'none',
  },

  ':disabled': {
    backgroundColor: theme.colors.divider,
    color: theme.colors['grey-03'],
    boxShadow: 'none',
    cursor: 'not-allowed',
  },

  svg: {
    transition: '150ms all ease-in-out',
  },

  ...(isActive && {
    backgroundColor: theme.colors.text,
    color: theme.colors.white,
  }),
}));

type Icon = 'entity' | 'copy' | 'facts' | 'target';

const icons: Record<Icon, React.FunctionComponent<{ color: ColorName }>> = {
  copy: Copy,
  entity: Entity,
  facts: Facts,
  target: Target,
};

function getIconColor(isActive: boolean, isHovered: boolean, disabled: boolean): ColorName {
  if (disabled) return 'grey-03';
  if (isHovered && isActive) return 'white';
  if (isActive) return 'white';
  if (isHovered) return 'text';
  return 'grey-04';
}

interface Props {
  isActive: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  icon: Icon;
  disabled?: boolean;
}

export const ToggleButton = forwardRef(function OnboardingButton(
  { isActive, onClick, children, icon, disabled = false }: Props,
  ref: ForwardedRef<HTMLButtonElement>
) {
  const [isHovered, setIsHovered] = useState(false);
  const iconColor = getIconColor(isActive, isHovered, disabled);
  const IconComponent = icons[icon];

  return (
    <StyledButton
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      ref={ref}
      isActive={isActive}
      onClick={onClick}
    >
      <IconComponent color={iconColor} />
      <Spacer width={8} />
      {children}
    </StyledButton>
  );
});
