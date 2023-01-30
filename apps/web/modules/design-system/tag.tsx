import styled from '@emotion/styled';

const StyledTag = styled.span(props => ({
  ...props.theme.typography.tag,
  borderRadius: props.theme.radius,
  padding: `0px ${props.theme.space}px`,
  display: 'inline-block',
  backgroundColor: props.theme.colors['grey-02'],
  textDecoration: 'none',
}));

interface Props {
  children: React.ReactNode;
}

export function Tag({ children }: Props) {
  return <StyledTag>{children}</StyledTag>;
}
