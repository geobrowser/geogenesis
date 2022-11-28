import styled from '@emotion/styled';

export const Chip = styled.a(props => ({
  ...props.theme.typography.metadataMedium,
  borderRadius: props.theme.radius,
  boxShadow: `inset 0 0 0 1px ${props.theme.colors.text}`,
  padding: `${props.theme.space}px ${props.theme.space * 2}px`,
  display: 'inline-block',
  backgroundColor: props.theme.colors.white,
  textDecoration: 'none',

  '&:hover, &:focus': {
    cursor: 'pointer',
    color: props.theme.colors.ctaPrimary,
    backgroundColor: props.theme.colors.ctaTertiary,
    boxShadow: `inset 0 0 0 1px ${props.theme.colors.ctaPrimary}`,
  },
}));
