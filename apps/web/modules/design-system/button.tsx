import styled from '@emotion/styled';
import { colors } from './theme/colors';

const StyledButton = styled.button({
  padding: '12px 9.5px',
  backgroundColor: colors.ctaPrimary,
  color: colors.white,
  border: 'none',
  outline: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
});

interface Props {
  children: React.ReactNode;
  onClick: () => void;
}

export function Button({ children, onClick }: Props) {
  return <StyledButton onClick={onClick}>{children}</StyledButton>;
}
