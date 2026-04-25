'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { NavUtils } from '~/core/utils/utils';

import { Close } from '~/design-system/icons/close';
import { Cog } from '~/design-system/icons/cog';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Relation } from '~/design-system/icons/relation';
import { TableView } from '~/design-system/icons/table-view';
import { MenuItem } from '~/design-system/menu';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

export function TableBlockContextMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { spaceId, entityId, relationId } = useDataBlockInstance();

  const onCopyBlockId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
    } catch {
      console.error('Failed to copy table block entity ID for: ', entityId);
    }
  };

  const onOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
  };

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      <Dropdown.Trigger>
        {isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          avoidCollisions={true}
          collisionPadding={8}
        >
          <MenuItem href={`/space/${spaceId}/${entityId}/power-tools?relationId=${relationId}`}>
            <div className="flex w-full items-center justify-between gap-2">
              <span>Open fullscreen</span>
              <TableView />
            </div>
          </MenuItem>
          <MenuItem href={NavUtils.toEntity(spaceId, entityId)}>
            <div className="flex w-full items-center justify-between gap-2">
              <span>View config</span>
              <Cog />
            </div>
          </MenuItem>
          <MenuItem href={NavUtils.toEntity(spaceId, relationId)}>
            <div className="flex w-full items-center justify-between gap-2">
              <span>View block relation</span>
              <Relation />
            </div>
          </MenuItem>
          <MenuItem onClick={onCopyBlockId}>
            <div className="flex w-full items-center justify-between gap-2">
              <span>Copy block ID</span>
              <Copy />
            </div>
          </MenuItem>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
