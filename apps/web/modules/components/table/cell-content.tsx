import styled from '@emotion/styled';
import Link from 'next/link';
import { Text } from '../../design-system/text';
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
  value: string;
  isExpanded?: boolean;
  isEntity?: boolean;
  href?: string;
}

export function CellContent({ isExpanded, value, isEntity, href }: Props) {
  const content = href ? (
    <Link href={href} passHref>
      <StyledLink>{value}</StyledLink>
    </Link>
  ) : (
    <Text variant="tableCell">{value}</Text>
  );

  return (
    <Truncate maxLines={isEntity ? 1 : 3} shouldTruncate={!isExpanded}>
      {content}
    </Truncate>
  );
}
