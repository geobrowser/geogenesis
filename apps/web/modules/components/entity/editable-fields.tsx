import styled from '@emotion/styled';
import React, { useEffect, useRef, useState } from 'react';

const Textarea = styled.textarea<Required<Pick<StringFieldProps, 'color' | 'variant'>>>(props => ({
  ...props.theme.typography[props.variant],
  width: '100%',
  height: '100%',
  resize: 'none',
  backgroundColor: 'transparent',
  overflow: 'hidden',
  color: props.theme.colors[props.color],
  margin: 0,
  padding: 0,

  '&::placeholder': {
    color: props.theme.colors['grey-02'],
  },

  '&:focus': {
    outline: 'none',
  },
}));

interface StringFieldProps {
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body';
  color?: 'text' | 'grey-04';
  value?: string;
}

export function StringField({ variant = 'body', color = 'text', ...props }: StringFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Manually keep the height of the textarea in sync with its content.
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  });

  return (
    <Textarea
      {...props}
      ref={ref}
      rows={1}
      onChange={props.onChange}
      variant={variant}
      color={color}
      value={props.value}
    />
  );
}

const NumberInput = styled.input(props => ({
  ...props.theme.typography.body,
  width: '100%',
  backgroundColor: 'transparent',

  '&::placeholder': {
    color: props.theme.colors['grey-02'],
  },

  '&:focus': {
    outline: 'none',
  },
}));

interface NumberFieldProps {
  initialValue: string;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
}

export function NumberField(props: NumberFieldProps) {
  // We're using controlled state instead of refs in order to more easily validate the keypresses
  const [value, setValue] = useState('');

  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const numberRegex = /^[0-9]*$/;

    // TODO: Validation UI?
    if (!numberRegex.test(e.target.value)) {
      return;
    }

    props.onBlur(e);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numberRegex = /^[0-9]*$/;
    if (!numberRegex.test(e.target.value)) {
      return;
    }

    setValue(e.target.value);
  };

  // Mimicking the type="number" behavior so we don't show the weird arrows
  return (
    <NumberInput
      {...props}
      type="text"
      onBlur={onBlur}
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={onChange}
    />
  );
}
