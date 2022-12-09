// TODO
// String field
// Number field
// Date field
// Entity name autocomplete field

import styled from '@emotion/styled';

// TODO: How do we handle attribute names editing. Attributes are entities, so we can't just use a string field.
// We'll need entity search and everything probably.

export const StringField = styled.input(props => ({
  ...props.theme.typography.body,
  width: '100%',

  '&::placeholder': {
    color: props.theme.colors['grey-03'],
  },

  '&:focus': {
    outline: 'none',
  },
}));

// export function StringField(value: string, onChange: (value: string) => void) {}
