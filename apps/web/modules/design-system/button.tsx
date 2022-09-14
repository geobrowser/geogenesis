import styled from '@emotion/styled';
import { colors } from './theme/colors';
import { typography } from './theme/typography';

const StyledButton = styled.button<Pick<Props, 'variant'>>(props => ({
  ...typography.button,
  backgroundColor: props.variant === 'primary' ? colors.ctaPrimary : colors.white,
  color: props.variant === 'primary' ? colors.white : colors.text,
  border: props.variant === 'primary' ? 'none' : `1px solid ${colors['grey-02']}`,
  padding: '8.5px 12px', // TODO: Spacing tokens
  borderRadius: '6px', // TODO: Spacing tokens
  cursor: 'pointer',
}));

interface Props {
  children: React.ReactNode;
  onClick: () => void;
  icon?: string; // TODO: Icons
  variant?: 'primary' | 'secondary';
}

export function Button({ children, onClick, icon, variant = 'primary' }: Props) {
  return (
    <StyledButton variant={variant} onClick={onClick}>
      {icon ? <p>Icon goes here</p> : null}
      {children}
    </StyledButton>
  );
}
