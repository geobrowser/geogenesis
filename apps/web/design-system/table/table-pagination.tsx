import * as React from 'react';

import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { Text } from '~/design-system/text';
import { TextButton } from '~/design-system/text-button';
import { ColorName } from '~/design-system/theme/colors';

export function PageNumber({
  number,
  onClick,
  isActive,
}: {
  number: number;
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <button onClick={onClick}>
      <Text variant="metadataMedium" color={isActive ? 'text' : 'grey-03'}>
        {number}
      </Text>
    </button>
  );
}

interface PageButtonProps {
  onClick: () => void;
  isDisabled: boolean;
}

export function PreviousButton({ onClick, isDisabled }: PageButtonProps) {
  const color: ColorName = isDisabled ? 'grey-03' : 'text';

  return (
    <TextButton disabled={isDisabled} onClick={isDisabled ? undefined : onClick}>
      <LeftArrowLong color={color} />
    </TextButton>
  );
}

export function NextButton({ onClick, isDisabled }: PageButtonProps) {
  const color: ColorName = isDisabled ? 'grey-03' : 'text';

  return (
    <TextButton disabled={isDisabled} onClick={isDisabled ? undefined : onClick}>
      <span
        style={{
          transform: 'rotate(180deg)',
        }}
      >
        <LeftArrowLong color={color} />
      </span>
    </TextButton>
  );
}
