import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';

interface ContentProps {
  children: React.ReactNode;
}

interface Props {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOpen?: boolean;
  trigger?: JSX.Element;
}

export function Dialog({ children, open, onOpenChange, trigger, defaultOpen = false }: Props) {
  const { space } = useTheme();

  return (
    <PopoverPrimitive.Root onOpenChange={onOpenChange} open={open} defaultOpen={defaultOpen}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={space * 3}
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
