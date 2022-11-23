import styled from '@emotion/styled';
import Link from 'next/link';
import React from 'react';
import { Text } from '../../design-system/text';
import { CellInput } from './cell-input';
import { CellTruncate } from './cell-truncate';

const StyledLink = styled.a(({ theme }) => ({
  display: 'inline-block',

  ':hover': {
    textDecoration: 'underline',
    textDecorationColor: theme.colors.ctaPrimary,
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
      <StyledLink>
        <Text variant="tableCell" color="ctaPrimary">
          {value}
        </Text>
      </StyledLink>
    </Link>
  ) : (
    <Text variant="tableCell">{value}</Text>
  );

  return isEditable ? (
    <CellInput value={value} {...rest} />
  ) : (
    <CellTruncate maxLines={isEntity ? 1 : 3} shouldTruncate={!isExpanded}>
      {content}
    </CellTruncate>
  );
}
