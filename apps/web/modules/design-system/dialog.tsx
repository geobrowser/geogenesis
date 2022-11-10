import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';

interface ContentProps {
  children: React.ReactNode;
}

const StyledContent = styled(PopoverPrimitive.Content)<ContentProps>(props => ({
  borderRadius: props.theme.radius,
  padding: props.theme.space * 3,
  backgroundColor: props.theme.colors.white,
  border: `1px solid ${props.theme.colors.text}`,
}));

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
        <StyledContent
          align="start"
          sideOffset={space * 3}
          onOpenAutoFocus={event => event.preventDefault()}
          onInteractOutside={event => event.preventDefault()}
        >
          {children}
          <PopoverPrimitive.Arrow />
        </StyledContent>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
