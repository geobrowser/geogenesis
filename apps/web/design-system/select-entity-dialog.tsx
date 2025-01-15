import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { SelectEntity } from './select-entity';

interface Props {
  trigger: React.ReactNode;
  spaceId: string;
  onDone: (result: { id: string; name: string | null; space?: string }) => void;
  allowedTypes?: string[];
}

export function SelectEntityAsPopover({ trigger, onDone, spaceId, allowedTypes }: Props) {
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
            variant="floating"
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
