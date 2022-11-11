import { useTheme } from '@emotion/react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

interface Props {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOpen?: boolean;
  alignOffset?: number;
}

export function OnboardingDialog({ children, open, onOpenChange, defaultOpen = false }: Props) {
  const { space } = useTheme();

  return (
    <PopoverPrimitive.Root onOpenChange={onOpenChange} open={open} defaultOpen={defaultOpen}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          onOpenAutoFocus={event => event.preventDefault()}
          onInteractOutside={event => event.preventDefault()}
        >
          {children}
          <PopoverPrimitive.Arrow />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
