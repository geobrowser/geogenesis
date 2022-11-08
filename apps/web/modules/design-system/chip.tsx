import styled from '@emotion/styled';
import Link from 'next/link';

export const Chip = styled(Link)(props => ({
  ...props.theme.typography.metadataMedium,
  borderRadius: props.theme.radius,
  boxShadow: `inset 0 0 0 1px ${props.theme.colors.text}`,
  padding: `${props.theme.space}px ${props.theme.space * 2}px`,
  display: 'inline-block',
  textDecoration: 'none',
}));
