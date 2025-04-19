import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { EntityId } from '~/core/io/schema';
import type { RelationValueType } from '~/core/types';

import { SelectEntity } from './select-entity';

type SelectEntityAsPopoverProps = {
  trigger: React.ReactNode;
  spaceId: string;
  onDone: (result: { id: EntityId; name: string | null; space?: EntityId; verified?: boolean }) => void;
  onCreateEntity?: (result: { id: string; name: string | null; space?: string }) => void;
  relationValueTypes?: RelationValueType[];
};

export function SelectEntityAsPopover({
  trigger,
  onDone,
  onCreateEntity,
  spaceId,
  relationValueTypes,
}: SelectEntityAsPopoverProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content sideOffset={4} align="start">
          <SelectEntity
            key={JSON.stringify(relationValueTypes)}
            withSearchIcon={true}
            spaceId={spaceId}
            relationValueTypes={relationValueTypes}
            onDone={onDone}
            onCreateEntity={onCreateEntity}
            variant="floating"
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
