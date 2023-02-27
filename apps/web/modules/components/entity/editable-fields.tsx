import * as React from 'react';
import { useEffect, useRef } from 'react';
import { cva } from 'class-variance-authority';

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

interface TableStringFieldProps {
  onBlur: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  value?: string;
}

export function TableStringField({ ...props }: TableStringFieldProps) {
  const [localValue, setLocalValue] = React.useState(props.value || '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Update local value if value prop changes from outside the component
    setLocalValue(props.value || '');
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      onBlur={props.onBlur}
      onChange={e => setLocalValue(e.currentTarget.value)}
      value={localValue}
      className={textareaStyles({ variant: 'tableCell' })}
    />
  );
}

interface PageStringFieldProps {
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body' | 'smallTitle';
  value?: string;
}

export function PageStringField({ ...props }: PageStringFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Manually keep the height of the textarea in sync with its content.
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';

      if (props.variant === 'body') {
        // This aligns the bottom of the text area with the sum of line heights * number of lines
        // for body text.
        ref.current.style.height = ref.current.scrollHeight - 4 + 'px';
      }
    }
  });

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      onChange={props.onChange}
      value={props.value}
      className={textareaStyles({ variant: props.variant })}
    />
  );
}
