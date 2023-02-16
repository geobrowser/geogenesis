import { cva } from 'class-variance-authority';
import React, { useEffect, useRef } from 'react';

const textareaStyles = cva(
  'w-full h-full resize-none bg-transparent overflow-hidden m-0 p-0 placeholder:text-grey-02 focus:outline-none',
  {
    variants: {
      variant: {
        mainPage: 'text-mainPage',
        body: 'text-body',
        tableCell: 'text-tableCell',
        smallTitle: 'text-smallTitle',
      },
    },
    defaultVariants: {
      variant: 'body',
    },
  }
);

interface StringFieldProps {
  onBlur: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body' | 'tableCell' | 'smallTitle';
  value?: string;
}

export function StringField({ variant = 'body', ...props }: StringFieldProps) {
  const [localValue, setLocalValue] = React.useState(props.value || '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalValue(props.value || '');
  }, [props.value]);

  // Manually keep the height of the textarea in sync with its content.
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';

      if (variant === 'body' || variant === 'tableCell' || variant === 'smallTitle') return;

      // This aligns the bottom of the text area with the sum of line heights * number of lines
      // for body text.
      ref.current.style.height = ref.current.scrollHeight - 4 + 'px';
    }
  });

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      onBlur={props.onBlur}
      onChange={e => setLocalValue(e.currentTarget.value)}
      value={localValue}
      className={textareaStyles({ variant })}
    />
  );
}
