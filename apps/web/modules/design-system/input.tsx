import styled from '@emotion/styled';

export const Input = styled.input(props => ({
  ...props.theme.typography.input,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: props.theme.radius,

  // TODO: Figure out what's going on here. Design padding doesn't match the design system spacing increments.
  padding: `${props.theme.space * 2 + 0.5}px ${props.theme.space * 2.5}px`,

  transition: '100ms all ease-in-out',

  '::placeholder': {
    color: props.theme.colors['grey-03'],
  },

  ':hover': {
    outline: `1px solid ${props.theme.colors.ctaPrimary}`,
  },

  ':focus': {
    outline: `2px solid ${props.theme.colors.ctaPrimary}`,
  },

  ':disabled': {
    backgroundColor: props.theme.colors.divider,
    color: props.theme.colors['grey-03'],
    cursor: 'not-allowed',
  },
}));
