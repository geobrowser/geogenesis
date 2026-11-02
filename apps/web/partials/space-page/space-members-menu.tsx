'use client';

import * as React from 'react';

import { Menu, MenuItem } from '~/design-system/menu';

import { SpaceMembersManageDialog } from './space-members-manage-dialog';

interface Props {
  trigger: React.ReactNode;
  label: string;
  content: React.ReactNode;
}

export function SpaceMembersMenu({ trigger, label, content }: Props) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  return (
    <>
      <Menu
        open={isOpen}
        onOpenChange={setIsOpen}
        trigger={trigger}
        triggerRef={triggerRef}
        className="max-w-40 bg-white"
        sideOffset={16}
        onCloseAutoFocus={event => {
          if (dialogOpen) event.preventDefault();
        }}
      >
        <MenuItem
          onClick={() => {
            setIsOpen(false);
            setDialogOpen(true);
          }}
        >
          {label}
        </MenuItem>
      </Menu>
      {/* Closing the menu must not unmount the dialog it opened. */}
      <SpaceMembersManageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        openerRef={triggerRef}
        header={<h1 className="text-smallTitle">{label}</h1>}
        content={content}
      />
    </>
  );
}
