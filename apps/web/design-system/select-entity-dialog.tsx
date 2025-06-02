import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';
import { useState } from 'react';

import { useKey } from '~/core/hooks/use-key';
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
  const [open, setOpen] = useState<boolean>(false);

  useKey('Escape', () => {
    if (!open) return;

    setOpen(false);
  });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content sideOffset={4} align="start" className="z-30">
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
