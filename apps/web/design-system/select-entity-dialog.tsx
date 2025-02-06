import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { EntityId } from '~/core/io/schema';

import { SelectEntity } from './select-entity';

type SelectEntityAsPopoverProps = {
  trigger: React.ReactNode;
  spaceId: string;
  onDone: (result: { id: EntityId; name: string | null; space?: EntityId; verified?: boolean }) => void;
  onCreateEntity?: (result: { id: string; name: string | null; space?: string }) => void;
  allowedTypes?: string[];
};

export function SelectEntityAsPopover({
  trigger,
  onDone,
  onCreateEntity,
  spaceId,
  allowedTypes,
}: SelectEntityAsPopoverProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content sideOffset={4} align="start">
          <SelectEntity
            withSearchIcon={true}
            spaceId={spaceId}
            allowedTypes={allowedTypes}
            onDone={onDone}
            onCreateEntity={onCreateEntity}
            variant="floating"
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
