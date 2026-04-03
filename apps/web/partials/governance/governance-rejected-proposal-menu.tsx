'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { Ellipsis } from '~/design-system/icons/ellipsis';
import { MenuItem } from '~/design-system/menu';

import { useReopenRejectedProposalEdits } from './use-reopen-rejected-proposal-edits';

type Props = {
  proposalId: string;
  spaceId: string;
};

export function GovernanceRejectedProposalMenu({ proposalId, spaceId }: Props) {
  const { reopenEdit, busy } = useReopenRejectedProposalEdits(proposalId, spaceId);
  const [open, setOpen] = React.useState(false);

  const onReopenEdit = React.useCallback(async () => {
    setOpen(false);
    await reopenEdit();
  }, [reopenEdit]);

  return (
    <div
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
            align="end"
            sideOffset={4}
            className="z-1001 min-w-[180px] overflow-hidden rounded-lg border border-grey-02 bg-white py-1 shadow-lg"
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
