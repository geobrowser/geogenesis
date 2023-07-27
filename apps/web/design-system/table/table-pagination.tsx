import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { Spacer } from '~/design-system/spacer';
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
    <SquareButton isActive={isActive} onClick={onClick}>
      <Text variant="smallButton">{number}</Text>
    </SquareButton>
  );
}

interface PageButtonProps {
  onClick: () => void;
  isDisabled: boolean;
}

export function PreviousButton({ onClick, isDisabled }: PageButtonProps) {
  const color: ColorName = isDisabled ? 'grey-03' : 'ctaPrimary';

  return (
    <TextButton disabled={isDisabled} onClick={isDisabled ? undefined : onClick}>
      <LeftArrowLong color={color} />
      <Spacer width={8} />
      <Text color={color} variant="smallButton">
        Previous
      </Text>
    </TextButton>
  );
}

export function NextButton({ onClick, isDisabled }: PageButtonProps) {
  const color: ColorName = isDisabled ? 'grey-03' : 'ctaPrimary';

  return (
    <TextButton disabled={isDisabled} onClick={isDisabled ? undefined : onClick}>
      <Text color={color} variant="smallButton">
        Next
      </Text>
      <Spacer width={8} />
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
