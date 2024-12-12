import * as React from 'react';

type Props = {
  onChange: (v: string) => void;
  placeholder?: string;
  value?: string;
};

export function NumberField({ onChange, value, placeholder = 'Add value...' }: Props) {
  const [localValue, setLocalValue] = React.useState(value || '');

  React.useEffect(() => {
    // Update local value if value prop changes from outside the component
    setLocalValue(value || '');
  }, [value]);

  return (
    // @TODO: Use existing text field
    <input
      type="text"
      className="m-0 -mb-[1px] w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none"
      onBlur={e => onChangeWithValidation(e.currentTarget.value, onChange)}
      onChange={e => onChangeWithValidation(e.currentTarget.value, setLocalValue)}
      value={localValue}
      placeholder={placeholder}
    />
  );
}

const onChangeWithValidation = (value: string, onChange: (v: string) => void) => {
  const floatingRegex = /^-?\d*\.?\d*$/;
  const integerRegex = /^-?\d+$/;

  if (floatingRegex.test(value) || integerRegex.test(value)) {
    onChange(value);
  }
};
