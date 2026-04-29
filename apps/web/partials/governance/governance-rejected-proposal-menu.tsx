'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { Ellipsis } from '~/design-system/icons/ellipsis';
import { MenuItem } from '~/design-system/menu';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

import { useReopenRejectedProposalEdits } from './use-reopen-rejected-proposal-edits';

const REJECTED_MENU_SURFACE =
  'z-1001 max-h-[180px] min-w-[180px] overscroll-contain overflow-y-auto rounded-lg border border-grey-02 bg-white py-1 shadow-lg';

type Props = {
  proposalId: string;
  spaceId: string;
};

export function GovernanceRejectedProposalMenu({ proposalId, spaceId }: Props) {
  const { reopenEdit, busy } = useReopenRejectedProposalEdits(proposalId, spaceId);
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const { align, side } = useAdaptiveDropdownPlacement(anchorRef, {
    isOpen: open,
    preferredHeight: 180,
    gap: 8,
  });

  const onReopenEdit = React.useCallback(async () => {
    setOpen(false);
    await reopenEdit();
  }, [reopenEdit]);

  const onContentWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);

  return (
    <div
      ref={anchorRef}
      className="flex shrink-0 items-center"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Dropdown.Root open={open} onOpenChange={setOpen}>
        <Dropdown.Trigger asChild>
          <SquareButton
            icon={<Ellipsis />}
            disabled={busy}
            className="border-none bg-transparent shadow-none hover:bg-bg"
            aria-label="Proposal actions"
          />
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align={align}
            side={side}
            sideOffset={8}
            avoidCollisions={true}
            collisionPadding={8}
            className={REJECTED_MENU_SURFACE}
            onWheel={onContentWheel}
          >
            <MenuItem onClick={onReopenEdit}>
              <p>Reopen edit</p>
            </MenuItem>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}
