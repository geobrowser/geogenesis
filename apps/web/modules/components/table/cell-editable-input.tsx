import styled from '@emotion/styled';
import Link from 'next/link';
import React from 'react';
import { Text } from '../../design-system/text';
import { CellInput } from './cell-input';
import { Truncate } from '../../design-system/truncate';

const StyledLink = styled.a(({ theme }) => ({
  ...theme.typography.tableCell,
  display: 'inline-block',
  color: theme.colors.ctaPrimary,
  transition: 'color 0.15s ease-in-out',

  ':hover': {
    textDecoration: 'underline',
    textDecorationColor: theme.colors.ctaHover,
    color: theme.colors.ctaHover,
  },
}));

interface Props {
  isEditable: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
  isExpanded?: boolean;
  disabled?: boolean;
  placeholder?: string;
  isEntity?: boolean;
  ellipsize?: boolean;
  href?: string;
}

export function CellEditableInput({ isEditable, isExpanded, value, isEntity, href, ...rest }: Props) {
  const content = href ? (
    <Link href={href} passHref>
      <StyledLink>{value}</StyledLink>
    </Link>
  ) : (
    <Text variant="tableCell">{value}</Text>
  );

  return isEditable ? (
    <CellInput value={value} {...rest} />
  ) : (
    <Truncate maxLines={isEntity ? 1 : 3} shouldTruncate={!isExpanded}>
      {content}
    </Truncate>
  );
}
