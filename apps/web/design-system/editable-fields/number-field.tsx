import * as React from 'react';

import { GeoNumber } from '~/core/utils/utils';

type Props = {
  onChange: (v: string) => void;
  placeholder?: string;
  value?: string;
  format?: string;
};

export function NumberField({ onChange, value, format, placeholder = 'Add value...' }: Props) {
  const [localValue, setLocalValue] = React.useState(value || '');

  React.useEffect(() => {
    // Update local value if value prop changes from outside the component
    setLocalValue(value || '');
  }, [value]);

  return (
    <div>
      <input
        type="text"
        className="m-0 -mb-[1px] w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none"
        onBlur={e => onChangeWithValidation(e.currentTarget.value, onChange)}
        onChange={e => onChangeWithValidation(e.currentTarget.value, setLocalValue)}
        value={localValue}
        placeholder={placeholder}
      />
      {value && <p className="text-sm text-grey-04">Browse format · {GeoNumber.format(value, format)}</p>}
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
