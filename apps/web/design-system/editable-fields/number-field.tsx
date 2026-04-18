'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { cva, cx } from 'class-variance-authority';

import { useQueryEntity } from '~/core/sync/use-store';
import type { DataType } from '~/core/types';
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
  dataType?: DataType;
};

const numberFieldStyles = cva('', {
  variants: {
    variant: {
      body: 'text-body text-text',
      tableCell: 'text-tableCell text-text',
      tableProperty: 'text-tableProperty! text-grey-04!',
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
  unitId,
  placeholder = 'Add value...',
  isEditing = false,
  variant,
  className = '',
  dataType,
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
    <div className={variant === 'tableCell' ? 'min-w-0 w-full max-w-full' : undefined}>
      <input
        type="text"
        className={cx(
          'm-0 -mb-px w-full min-w-0 resize-none bg-transparent p-0 placeholder:text-grey-02 focus:outline-hidden',
          numberFieldStyles({ variant }),
          variant === 'tableCell' && 'truncate'
        )}
        onBlur={e => onChangeWithValidation(e.currentTarget.value, onChange!, dataType)}
        onChange={e => onChangeWithValidation(e.currentTarget.value, setLocalValue, dataType)}
        value={localValue}
        placeholder={placeholder}
      />
      {value && (
        <span className="text-sm text-grey-04">Browse format · {GeoNumber.format(value, format, currencySign)}</span>
      )}
    </div>
  );
}

const onChangeWithValidation = (value: string, onChange: (v: string) => void, dataType?: DataType) => {
  if (dataType === 'INTEGER') {
    const integerRegex = /^-?\d*$/;
    if (integerRegex.test(value)) {
      onChange(value);
    }
  } else {
    const floatingRegex = /^-?\d*\.?\d*$/;
    if (floatingRegex.test(value)) {
      onChange(value);
    }
  }
};
