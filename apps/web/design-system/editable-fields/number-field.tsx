import { SystemIds } from '@graphprotocol/grc-20';
import { cva } from 'class-variance-authority';

import * as React from 'react';

import { useQueryEntity } from '~/core/sync/use-store';
import { GeoNumber } from '~/core/utils/utils';

type Props = {
  onChange?: (v: string) => void;
  placeholder?: string;
  value?: string;
  format?: string;
  unitId?: string;
  isEditing?: boolean;
  variant?: 'body' | 'tableCell' | 'tableProperty';
  className?: string;
};

const numberFieldStyles = cva('', {
  variants: {
    variant: {
      body: 'text-body text-text',
      tableCell: 'text-tableCell text-text',
      tableProperty: '!text-tableProperty !text-grey-04',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

export function NumberField({
  onChange,
  value,
  unitId,
  placeholder = 'Add value...',
  isEditing = false,
  variant,
  className = '',
  format,
}: Props) {
  const [localValue, setLocalValue] = React.useState(value || '');

  React.useEffect(() => {
    // Update local value if value prop changes from outside the component
    setLocalValue(value || '');
  }, [value]);

  const { entity } = useQueryEntity({ id: unitId });

  const currencySign = React.useMemo(
    () => unitId && entity?.values.find(t => t.property.id === SystemIds.CURRENCY_SIGN_PROPERTY)?.value,
    [unitId, entity]
  );

  if (!isEditing) {
    return (
      <span className={numberFieldStyles({ variant, className })}>{GeoNumber.format(value, format, currencySign)}</span>
    );
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
      {value && (
        <span className="text-sm text-grey-04">Browse format · {GeoNumber.format(value, format, currencySign)}</span>
      )}
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
