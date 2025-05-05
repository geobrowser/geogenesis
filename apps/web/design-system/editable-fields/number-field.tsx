import { cva } from 'class-variance-authority';

import * as React from 'react';

import { GeoNumber } from '~/core/utils/utils';

type Props = {
  onChange?: (v: string) => void;
  placeholder?: string;
  value?: string;
  format?: string;
  isEditing?: boolean;
  variant?: 'body' | 'tableCell';
};

const numberFieldStyles = cva('text-text', {
  variants: {
    variant: {
      body: 'text-body',
      tableCell: 'text-tableCell',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

export function NumberField({
  onChange,
  value,
  format,
  placeholder = 'Add value...',
  isEditing = false,
  variant,
}: Props) {
  const [localValue, setLocalValue] = React.useState(value || '');

  React.useEffect(() => {
    // Update local value if value prop changes from outside the component
    setLocalValue(value || '');
  }, [value]);

  if (!isEditing) {
    return <span className={numberFieldStyles({ variant })}>{GeoNumber.format(value, format)}</span>;
  }

  if (isEditing && !onChange) {
    throw new Error('onChange is required when isEditing is true');
  }

  return (
    <div>
      <input
        type="text"
        className="m-0 -mb-[1px] w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none"
        onBlur={e => onChangeWithValidation(e.currentTarget.value, onChange!)}
        onChange={e => onChangeWithValidation(e.currentTarget.value, setLocalValue)}
        value={localValue}
        placeholder={placeholder}
      />
      {value && <span className="text-sm text-grey-04">Browse format · {GeoNumber.format(value, format)}</span>}
    </div>
  );
}

const onChangeWithValidation = (value: string, onChange: (v: string) => void) => {
  const floatingRegex = /^-?\d*\.?\d*$/;
  const integerRegex = /^-?\d+$/;

  if (floatingRegex.test(value) || integerRegex.test(value)) {
    onChange(value);
  }
};
