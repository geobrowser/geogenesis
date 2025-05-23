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
    <button onClick={onClick} className="flex h-5 w-5 items-center justify-center rounded-sm border border-grey-02">
      <Text className="text-xs" color={isActive ? 'text' : 'grey-03'}>
        {number}
      </Text>
    </button>
  );
}

interface PageButtonProps {
  onClick: () => void;
  isDisabled: boolean;
  showText?: boolean;
}

export function PreviousButton({ onClick, isDisabled, showText }: PageButtonProps) {
  const color: ColorName = isDisabled ? 'grey-03' : 'text';

  return (
    <TextButton disabled={isDisabled} onClick={isDisabled ? undefined : onClick}>
      <LeftArrowLong color={color} />
      {showText && <span className={`pl-2 text-${color}`}>Previous</span>}
    </TextButton>
  );
}

export function NextButton({ onClick, isDisabled, showText }: PageButtonProps) {
  const color: ColorName = isDisabled ? 'grey-03' : 'text';

  return (
    <TextButton className="bg-red-01" disabled={isDisabled} onClick={isDisabled ? undefined : onClick}>
      {showText && <span className={`pr-2 text-${color}`}>Next</span>}
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
