'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';
import { useState } from 'react';

import { useKey } from '~/core/hooks/use-key';
import { Property, SwitchableRenderableType } from '~/core/types';

import { SelectEntity } from './select-entity';

type SelectEntityAsPopoverProps = {
  trigger: React.ReactNode;
  spaceId: string;
  onDone: (
    result: { id: string; name: string | null; space?: string; verified?: boolean },
    fromCreateFn?: boolean
  ) => void;
  onCreateEntity?: (result: {
    id: string;
    name: string | null;
    space?: string;
    verified?: boolean;
    renderableType?: SwitchableRenderableType;
  }) => void;
  relationValueTypes?: Property['relationValueTypes'];
  placeholder?: string;
  advanced?: boolean;
  showIDs?: boolean;
  initialQuery?: string;
  selectedEntityId?: string;
  clearQueryAfterPick?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSearchQueryChange?: (query: string) => void;
};

export function SelectEntityAsPopover({
  trigger,
  onDone,
  onCreateEntity,
  spaceId,
  relationValueTypes,
  placeholder,
  advanced = true,
  showIDs = true,
  initialQuery,
  selectedEntityId,
  clearQueryAfterPick = true,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  onSearchQueryChange,
}: SelectEntityAsPopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (isControlled) {
        onOpenChangeProp?.(next);
      } else {
        setUncontrolledOpen(next);
      }
    },
    [isControlled, onOpenChangeProp]
  );

  useKey('Escape', () => {
    if (!open) return;

    setOpen(false);
  });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="z-1001"
          collisionPadding={10}
          avoidCollisions={true}
          onPointerDownOutside={event => {
            if ((event.target as Element | null)?.closest?.('[data-select-entity-dropdown]')) {
              event.preventDefault();
            }
          }}
          onInteractOutside={event => {
            if ((event.target as Element | null)?.closest?.('[data-select-entity-dropdown]')) {
              event.preventDefault();
            }
          }}
        >
          <SelectEntity
            key={JSON.stringify(relationValueTypes)}
            withSearchIcon={true}
            spaceId={spaceId}
            relationValueTypes={relationValueTypes}
            placeholder={placeholder}
            onDone={onDone}
            onCreateEntity={onCreateEntity}
            variant="floating"
            advanced={advanced}
            showIDs={showIDs}
            initialQuery={initialQuery}
            selectedEntityId={selectedEntityId}
            clearQueryAfterPick={clearQueryAfterPick}
            onSearchQueryChange={onSearchQueryChange}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
