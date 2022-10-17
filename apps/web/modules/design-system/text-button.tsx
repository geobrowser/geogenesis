import styled from '@emotion/styled';

export const TextButton = styled.button(props => ({
  display: 'flex',
  alignItems: 'center',

  border: 'none',
  backgroundColor: props.theme.colors.white,
  cursor: 'pointer',

  ':hover': {
    border: `inset 0 0 0 1px ${props.theme.colors.ctaPrimary}`,
  },

  ':focus': {
    boxShadow: `inset 0 0 0 2px ${props.theme.colors.ctaPrimary}`,
    outline: 'none',
  },
}));
