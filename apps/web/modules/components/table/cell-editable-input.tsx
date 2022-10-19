import { Text } from '../../design-system/text';
import { CellInput } from './cell-input';
import { CellTruncate } from './cell-truncate';

interface Props {
  isEditable: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
  disabled?: boolean;
  placeholder?: string;
  isEntity?: boolean;
  ellipsize?: boolean;
}

export function CellEditableInput({ isEditable, value, isEntity, ...rest }: Props) {
  return isEditable ? (
    <CellInput value={value} {...rest} />
  ) : (
    <CellTruncate>
      <Text color={isEntity ? 'ctaPrimary' : 'text'} variant="tableCell">
        {value}
      </Text>
    </CellTruncate>
  );
}
