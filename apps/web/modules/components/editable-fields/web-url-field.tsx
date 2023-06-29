import { cva } from 'class-variance-authority';
import * as React from 'react';

const webUrlFieldStyles = cva('w-full bg-transparent placeholder:text-grey-02 focus:outline-none', {
  variants: {
    variant: {
      body: 'text-body',
      tableCell: 'text-tableCell',
    },
    editable: {
      false: 'text-ctaPrimary hover:text-ctaHover transition-colors duration-75 truncate no-underline hover:underline',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

interface Props {
  isEditing?: boolean;
  placeholder?: string;
  value: string;
  onBlur?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  variant?: 'body' | 'tableCell';
}

export function WebUrlField({ variant = 'body', isEditing = false, ...props }: Props) {
  // We use the local value and onBlur to improve performance when WebUrlField is rendered
  // in a large table. Our Actions model means that every keystroke triggers a re-render
  // of all fields deriving data from the ActionStore.
  const [localValue, setLocalValue] = React.useState(props.value);

  React.useEffect(() => {
    if (localValue !== props.value) setLocalValue(props.value);
  }, [props.value]);

  return isEditing ? (
    <input
      {...props}
      value={localValue}
      className={webUrlFieldStyles({ variant, editable: isEditing })}
      onChange={e => setLocalValue(e.currentTarget.value)}
    />
  ) : (
    <a
      href={props.value}
      target="_blank"
      rel="noreferrer"
      className={webUrlFieldStyles({ variant, editable: isEditing })}
    >
      {props.value}
    </a>
  );
}
