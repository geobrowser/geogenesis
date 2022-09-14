import styled from '@emotion/styled';
import { Create } from './icons/create';
import { Spacer } from './spacer';
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

  display: 'flex',
  alignItems: 'center',
}));

interface Props {
  children: React.ReactNode;
  onClick: () => void;
  icon?: 'create'; // TODO: Icons
  variant?: 'primary' | 'secondary';
}

export function Button({ children, onClick, icon, variant = 'primary' }: Props) {
  return (
    <StyledButton variant={variant} onClick={onClick}>
      {icon ? (
        <>
          <Create color="white" />
          <Spacer width={8} />
        </>
      ) : null}
      {children}
    </StyledButton>
  );
}
