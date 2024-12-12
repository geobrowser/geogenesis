import * as React from 'react';

type Props = {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  value?: string;
};

export function NumberField({ onChange, value, placeholder = 'Add value...' }: Props) {
  const [localValue, setLocalValue] = React.useState(value || '');

  React.useEffect(() => {
    // Update local value if value prop changes from outside the component
    setLocalValue(value || '');
  }, [value]);

  // @TODO
  // 1. Render changeable number
  // 2. Validate value is a number either decimal or other. Alternatively only allow
  //    number inputs to begin with
  return (
    <input
      type="text"
      className="m-0 -mb-[1px] w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none"
      onBlur={onChange}
      onChange={e => setLocalValue(e.currentTarget.value)}
      value={localValue}
      placeholder={placeholder}
    />
  );
}
