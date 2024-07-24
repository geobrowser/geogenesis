import * as PopoverPrimitive from '@radix-ui/react-popover';

import { useState } from 'react';

import type { RelationValueType } from '~/core/types';

import { SquareButton } from '~/design-system/button';
import { CreateSmall } from '~/design-system/icons/create-small';

import { SelectEntity } from './select-entity';

type SelectEntityDialogProps = {
  onDone: (result: { id: string; name: string | null; space?: string }) => void;
  spaceId: string;
  allowedTypes?: RelationValueType[];
  placeholder?: string;
  className?: string;
};

export const SelectEntityDialog = ({ onDone, spaceId, allowedTypes }: SelectEntityDialogProps) => {
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <SquareButton icon={<CreateSmall />} />
      </PopoverPrimitive.Trigger>
      <div className="elevated-popover">
        <PopoverPrimitive.Content className="mt-1 flex flex-col overflow-hidden" align="start" avoidCollisions={false}>
          <SelectEntity
            onDone={result => {
              onDone(result);
              setOpen(false);
            }}
            spaceId={spaceId}
            allowedTypes={allowedTypes}
            wrapperClassName="relative w-[400px] rounded-md border border-divider bg-white"
            inputClassName="m-0 block w-full resize-none bg-transparent p-2 text-body placeholder:text-grey-02 focus:outline-none"
            resultsClassName="-mx-px -mb-px"
            withSearchIcon
          />
        </PopoverPrimitive.Content>
      </div>
    </PopoverPrimitive.Root>
  );
};
