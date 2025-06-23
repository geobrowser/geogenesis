import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { SelectSpace } from './select-space';

type SelectEntityAsPopoverProps = {
  trigger: React.ReactNode;
  entityId: string;
  spaceId?: string;
  verified?: boolean;
  onDone: (result: { id: string; name: string | null; space?: string; verified?: boolean }) => void;
};

export function SelectSpaceAsPopover({ trigger, onDone, entityId, spaceId, verified }: SelectEntityAsPopoverProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          sideOffset={4}
          align="start"
          className="relative z-100 focus:outline-none"
          avoidCollisions={false}
        >
          <SelectSpace entityId={entityId} spaceId={spaceId} verified={verified} onDone={onDone} variant="floating" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
