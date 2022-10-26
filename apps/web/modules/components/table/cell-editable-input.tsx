import React from 'react';
import { Text } from '../../design-system/text';
import { CellInput } from './cell-input';
import { CellTruncate } from './cell-truncate';

interface Props {
  isEditable: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
  isExpanded?: boolean;
  disabled?: boolean;
  placeholder?: string;
  isEntity?: boolean;
  ellipsize?: boolean;
}

export function CellEditableInput({ isEditable, isExpanded, value, isEntity, ...rest }: Props) {
  return isEditable ? (
    <CellInput value={value} {...rest} />
  ) : (
    <CellTruncate shouldTruncate={!isExpanded}>
      <Text color={isEntity ? 'ctaPrimary' : 'text'} variant="tableCell">
        {value}
      </Text>
    </CellTruncate>
  );
}
