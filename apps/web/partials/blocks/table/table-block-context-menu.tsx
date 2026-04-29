'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import { useAtom } from 'jotai';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { NavUtils } from '~/core/utils/utils';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Cog } from '~/design-system/icons/cog';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Relation } from '~/design-system/icons/relation';
import { TableView } from '~/design-system/icons/table-view';
import { MenuItem } from '~/design-system/menu';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

import { DataBlockSourceMenu } from '~/partials/blocks/table/data-block-source-menu';

import { TableBlockEditPropertiesPanel } from './table-block-edit-properties-panel';
import { editingPropertiesAtom } from '~/atoms';

const TABLE_BLOCK_CONTEXT_MENU_SURFACE =
  'z-1001 block max-h-[180px] min-w-0 w-[200px] overscroll-contain overflow-y-auto rounded-lg border border-grey-02 bg-white shadow-lg';

export function TableBlockContextMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: isMenuOpen,
    preferredHeight: 180,
    gap: 8,
  });
  const { spaceId, entityId, relationId } = useDataBlock();
  const [isEditingDataSource, setIsEditingDataSource] = React.useState(false);
  const [isEditingProperties, setIsEditingProperties] = useAtom(editingPropertiesAtom);

  const isEditing = useUserIsEditing(spaceId);

  React.useEffect(() => {
    if (!isEditing) {
      setIsEditingProperties(false);
    }
  }, [isEditing, setIsEditingProperties]);

  const onCopyBlockId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
      setIsEditingDataSource(false);
      setIsEditingProperties(false);
    } catch (err) {
      console.error('Failed to copy table block entity ID for: ', entityId);
    }
  };

  const onOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
    if (!open) {
      setIsEditingDataSource(false);
      setIsEditingProperties(false);
    }
  };

  const onContentWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);

  const isInitialState = !isEditingDataSource && !isEditingProperties;

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      <Dropdown.Trigger ref={triggerRef}>
        {isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          side={side}
          align={align}
          sideOffset={8}
          avoidCollisions={true}
          collisionPadding={8}
          className={TABLE_BLOCK_CONTEXT_MENU_SURFACE}
          onWheel={onContentWheel}
        >
          {isInitialState && (
            <>
              {isEditing && (
                <>
                  <MenuItem onClick={() => setIsEditingDataSource(true)}>
                    <span>Change data source</span>
                    <ChevronRight />
                  </MenuItem>
                  <MenuItem onClick={() => setIsEditingProperties(true)}>
                    <TableBlockEditPropertiesPanel />
                    <span>Edit properties</span>
                    <ChevronRight />
                  </MenuItem>
                </>
              )}
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
            </>
          )}
          {isEditingDataSource && <DataBlockSourceMenu onBack={() => setIsEditingDataSource(false)} />}
          <TableBlockEditPropertiesPanel />
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
