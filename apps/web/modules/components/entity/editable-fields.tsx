// TODO
// Number field
// Date field
// Entity name autocomplete field

import styled from '@emotion/styled';
import { useEffect, useRef } from 'react';

// TODO: How do we handle attribute names editing. Attributes are entities, so we can't just use a string field.
// We'll need entity search and everything probably.

const Textarea = styled.textarea<Required<Pick<NameFieldProps, 'color' | 'variant'>>>(props => ({
  ...props.theme.typography[props.variant],
  width: '100%',
  resize: 'none',
  backgroundColor: 'transparent',
  overflow: 'hidden',
  color: props.theme.colors[props.color],

  '&::placeholder': {
    color: props.theme.colors['grey-02'],
  },

  '&:focus': {
    outline: 'none',
  },
}));

interface NameFieldProps {
  initialValue: string;
  onBlur: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body';
  color?: 'text' | 'grey-04';
}

export function StringField({ variant = 'body', color = 'text', ...props }: NameFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, []);

  const onChange = () => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  };

  return (
    <Textarea
      {...props}
      ref={ref}
      rows={1}
      defaultValue={props.initialValue}
      onChange={onChange}
      onBlur={props.onBlur}
      variant={variant}
      color={color}
    />
  );
}
