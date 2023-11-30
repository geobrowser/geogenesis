import * as Component from '@radix-ui/react-radio-group';
import cx from 'classnames';

import { Check } from '~/design-system/icons/check';

type RadioGroupProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<Option>;
};

type Option = {
  value: string;
  label: string;
  image?: string;
  disabled?: boolean;
};

export const RadioGroup = ({ value, onValueChange, options, ...rest }: RadioGroupProps) => (
  <Component.Root value={value} onValueChange={onValueChange} className={cx('flex flex-col gap-3')} {...rest}>
    {options.map(({ label, image, value, disabled = false, ...rest }: Option) => (
      <Component.Item
        key={value}
        value={value}
        className={cx(
          'flex w-full items-center justify-between rounded-lg border border-grey-02 p-1.5 pr-3 text-grey-04 transition duration-300 hover:border-text hover:text-text data-[state=checked]:border-text data-[state=checked]:text-text',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        disabled={disabled}
        {...rest}
      >
        <div className="inline-flex items-center gap-4">
          {image && (
            <div className="relative h-12 w-12 overflow-clip rounded-md">
              <img src={image} alt={label} className="absolute inset-0 h-full w-full" />
            </div>
          )}
          <div className={cx('text-smallTitle')}>{label}</div>
        </div>
        <Component.Indicator>
          <Check />
        </Component.Indicator>
      </Component.Item>
    ))}
  </Component.Root>
);
