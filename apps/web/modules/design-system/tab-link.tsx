import styled from '@emotion/styled';
import Link from 'next/link';
import React, { ForwardedRef, forwardRef } from 'react';

const StyledLink = styled.a<{ isActive: boolean }>(({ theme, isActive }) => ({
  ...theme.typography.largeTitle,
  color: isActive ? theme.colors.text : theme.colors['grey-04'],
  paddingRight: `${theme.space * 4}px`,
  cursor: 'pointer',
  outline: 'none',
  ':hover': {
    color: theme.colors.text,
  },
}));

interface Props {
  isActive: boolean;
  href: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export const TabLink = forwardRef(function OnboardingButton(
  { isActive, href, children, disabled = false }: Props,
  ref: ForwardedRef<HTMLButtonElement>
) {
  return (
    <Link href={href}>
      <StyledLink disabled={disabled} ref={ref} isActive={isActive}>
        {children}
      </StyledLink>
    </Link>
  );
});
