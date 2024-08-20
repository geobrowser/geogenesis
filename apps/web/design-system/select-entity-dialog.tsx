import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { RelationValueType } from '~/core/types';

import { SelectEntity } from './select-entity';

interface Props {
  trigger: React.ReactNode;
  spaceId: string;
  onDone: (result: { id: string; name: string | null; space?: string }) => void;
  allowedTypes?: RelationValueType[];
}

export function SelectEntityAsPopover({ trigger, onDone, spaceId, allowedTypes }: Props) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content sideOffset={4} align="start" className="rounded-md border border-divider bg-white">
          <SelectEntity
            withSearchIcon={true}
            spaceId={spaceId}
            allowedTypes={allowedTypes}
            onDone={onDone}
            inputVariant="floating"
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
