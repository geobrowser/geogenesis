import styled from '@emotion/styled';
import Link from 'next/link';
import React from 'react';

const StyledLink = styled.a<{ isActive: boolean }>(({ theme, isActive }) => ({
  ...theme.typography.mediumTitle,
  color: isActive ? theme.colors.text : theme.colors['grey-04'],
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

export const TabLink = ({ isActive, href, children }: Props) => {
  return (
    <Link href={href}>
      <StyledLink isActive={isActive}>{children}</StyledLink>
    </Link>
  );
};
