import styled from '@emotion/styled';
import { Create } from './icons/create';
import { Spacer } from './spacer';
import { colors } from './theme/colors';
import { typography } from './theme/typography';

const StyledButton = styled.button<Pick<Props, 'variant'>>(props => ({
  ...typography.button,
  boxSizing: 'border-box',
  backgroundColor: props.variant === 'primary' ? colors.ctaPrimary : colors.white,
  color: props.variant === 'primary' ? colors.white : colors.text,
  padding: '8.5px 12px', // TODO: Spacing tokens
  borderRadius: '6px', // TODO: Spacing tokens
  cursor: 'pointer',
  outline: 'none',

  display: 'flex',
  alignItems: 'center',

  // Using box-shadow instead of border to prevent layout shift going between 1px and 2px border sizes. There's
  // other things we can do like toggling padding but this seems simplest.
  boxShadow: props.variant === 'primary' ? '0 0 0 1px transparent' : `0 0 0 1px ${colors['grey-02']}`,

  // TODO: Placeholder until we do motion design
  transition: '100ms all ease-in',

  ':hover': {
    boxShadow: props.variant === 'primary' ? `none` : `0 0 0 1px ${colors.text}`,
    backgroundColor: props.variant === 'primary' ? colors.ctaHover : colors.white,
  },

  ':focus': {
    boxShadow: props.variant === 'primary' ? `0 0 0 2px ${colors.ctaHover}` : `0 0 0 2px ${colors.text}`,
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
