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
  outline: 'none',

  display: 'flex',
  alignItems: 'center',

  // TODO: Placeholder until we do motion design
  transition: '100ms all ease-in',

  ':hover': {
    backgroundColor: props.variant === 'primary' ? colors.ctaHover : colors.white,
    border: props.variant === 'primary' ? 'none' : `1px solid ${colors.text}`,
  },

  ':focus': {
    border: props.variant === 'primary' ? `2px solid ${colors.ctaHover}` : `2px solid ${colors.text}`,
    outline: 'none',
  },
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
          <Create color={variant === 'primary' ? 'white' : 'ctaPrimary'} />
          <Spacer width={8} />
        </>
      ) : null}
      {children}
    </StyledButton>
  );
}
