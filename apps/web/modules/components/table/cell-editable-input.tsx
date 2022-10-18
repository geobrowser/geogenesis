import { Text } from '../../design-system/text';
import { CellInput } from './cell-input';
import { CellTruncate } from './cell-truncate';

interface Props {
  isEditable: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
}

export function CellEditableInput({ isEditable, value, onChange, onBlur }: Props) {
  return isEditable ? (
    <CellInput placeholder="Add text..." value={value} onChange={onChange} onBlur={onBlur} />
  ) : (
    <CellTruncate>
      <Text variant="tableCell">{value}</Text>
    </CellTruncate>
  );
}
