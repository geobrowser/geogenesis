import styled from '@emotion/styled';
import { Create } from './icons/create';
import { Spacer } from './spacer';
import { colors, ColorValue } from './theme/colors';
import { typography } from './theme/typography';

const StyledButton = styled.button<Pick<Props, 'variant'>>(props => {
  console.log(props);

  return {
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
    transition: '200ms all ease-in-out',

    ':hover': {
      boxShadow: props.variant === 'primary' ? `none` : `0 0 0 1px ${colors.text}`,
      backgroundColor: props.variant === 'primary' ? colors.ctaHover : colors.white,
    },

    ':focus': {
      boxShadow: props.variant === 'primary' ? `0 0 0 2px ${colors.ctaHover}` : `0 0 0 2px ${colors.text}`,
      outline: 'none',
    },

    ':disabled': {
      color: colors['grey-03'],
      backgroundColor: colors.divider,
      boxShadow: 'none',
    },
  };
});

type ButtonVariant = 'primary' | 'secondary';

interface Props {
  children: React.ReactNode;
  onClick: () => void;
  icon?: 'create'; // TODO: Icons
  variant?: ButtonVariant;
  disabled?: boolean;
}

function getIconColor(variant: ButtonVariant, disabled: boolean): ColorValue {
  if (disabled) return colors['grey-03'];
  return variant === 'primary' ? colors.white : colors.ctaPrimary;
}

export function Button({ children, onClick, icon, variant = 'primary', disabled = false }: Props) {
  const iconColor = getIconColor(variant, disabled);

  return (
    <StyledButton disabled={disabled} variant={variant} onClick={onClick}>
      {icon ? (
        <>
          <Create color={iconColor} />
          <Spacer width={8} />
        </>
      ) : null}
      {children}
    </StyledButton>
  );
}
