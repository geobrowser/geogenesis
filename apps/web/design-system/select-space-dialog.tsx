import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { SelectSpace } from './select-space';

type SelectEntityAsPopoverBaseProps = {
  trigger: React.ReactNode;
  entityId: string;
  spaceId?: string;
  verified?: boolean;
  onDone: (result: { id: string; name: string | null; space?: string; verified?: boolean }) => void;
};

// Either both `open` and `onOpenChange` are provided (controlled) or neither is
// (uncontrolled). Passing `open` without `onOpenChange` would leave Radix unable
// to dismiss the popover.
type SelectEntityAsPopoverProps = SelectEntityAsPopoverBaseProps &
  ({ open?: undefined; onOpenChange?: undefined } | { open: boolean; onOpenChange: (open: boolean) => void });

export function SelectSpaceAsPopover({
  trigger,
  onDone,
  entityId,
  spaceId,
  verified,
  open,
  onOpenChange,
}: SelectEntityAsPopoverProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          sideOffset={4}
          align="start"
          className="relative z-100 focus:outline-hidden"
          avoidCollisions={false}
        >
          <SelectSpace entityId={entityId} spaceId={spaceId} verified={verified} onDone={onDone} variant="floating" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
