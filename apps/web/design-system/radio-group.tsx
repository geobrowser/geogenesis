import * as Component from '@radix-ui/react-radio-group';
import cx from 'classnames';

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
  <Component.Root value={value} onValueChange={onValueChange} className="flex flex-wrap justify-center gap-2" {...rest}>
    {options.map(({ label, image, value, disabled = false, ...rest }: Option) => (
      <Component.Item
        key={value}
        value={value}
        className={cx(
          'data-[state=checked]:to-ctaSecondary flex items-center justify-between rounded-lg bg-divider py-2 pr-3 text-grey-04 transition-all duration-300 hover:text-text data-[state=checked]:bg-gradient-to-tr data-[state=checked]:from-[#BAFEFF] data-[state=checked]:via-[#E5C4F6] data-[state=checked]:to-[#FFCBB4] data-[state=checked]:text-text',
          image === '' ? 'pl-3' : 'pl-2',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        disabled={disabled}
        {...rest}
      >
        <div className="inline-flex items-center gap-3">
          {image && (
            <div className="relative h-6 w-6 overflow-clip rounded-md">
              <img src={image} alt={label} className="absolute inset-0 h-full w-full" />
            </div>
          )}
          <p className="text-quoteMedium">{label}</p>
        </div>
      </Component.Item>
    ))}
  </Component.Root>
);
