import styled from '@emotion/styled';

export const Chip = styled.span(props => ({
  ...props.theme.typography.metadataMedium,
  borderRadius: props.theme.radius * 7,
  border: `1px solid ${props.theme.colors.text}`,
  padding: `${props.theme.space}px ${props.theme.space * 2}px`,
  display: 'inline-block',
}));
