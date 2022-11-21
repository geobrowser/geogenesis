import { ForwardedRef, forwardRef } from 'react';
import { Button } from './button';

interface Props {
  isActive: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}

export const ToggleButton = forwardRef(function OnboardingButton(
  { isActive, onClick, children }: Props,
  ref: ForwardedRef<HTMLButtonElement>
) {
  return isActive ? (
    <Button ref={ref} variant="tertiary" onClick={onClick}>
      {children}
    </Button>
  ) : (
    <Button ref={ref} variant="secondary" onClick={onClick}>
      {children}
    </Button>
  );
});
