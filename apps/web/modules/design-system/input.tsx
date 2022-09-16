import styled from '@emotion/styled';

export const Input = styled.input(props => ({
  ...props.theme.typography.input,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: '6px',
  padding: '9px 12px',

  transition: 'all 200ms ease-in-out',

  '::placeholder': {
    color: props.theme.colors['grey-03'],
  },

  // ':active': {
  //   outline: `1px solid ${props.theme.colors.ctaPrimary}`,
  // },

  ':focus': {
    outline: `2px solid ${props.theme.colors.ctaPrimary}`,
  },

  ':disabled': {
    backgroundColor: props.theme.colors.divider,
    color: props.theme.colors['grey-03'],
    cursor: 'not-allowed',
  },
}));
