import { SquareButton } from '~/design-system/button';
import { Blank } from '~/design-system/icons/blank';
import { Check } from '~/design-system/icons/check';
import { Minus } from '~/design-system/icons/minus';

type CheckboxProps = {
  checked: boolean | null;
  onChange?: () => void;
};

export const Checkbox = ({ checked, onChange = () => null, ...rest }: CheckboxProps) => {
  const icon = getIcon(checked);

  return <SquareButton onClick={onChange} icon={icon} {...rest} />;
};

export const getChecked = (value: string | null | undefined) => {
  switch (value) {
    case '1':
      return true;
    case '0':
      return false;
    default:
      return null;
  }
};

const getIcon = (checked: boolean | null) => {
  switch (checked) {
    case true:
      return <Check />;
    case false:
      return <Blank />;
    default:
      return <Minus />;
  }
};
