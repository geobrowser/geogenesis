'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { useAtom } from 'jotai';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { NavUtils } from '~/core/utils/utils';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Cog } from '~/design-system/icons/cog';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Relation } from '~/design-system/icons/relation';
import { MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { DataBlockSourceMenu } from '~/partials/blocks/table/data-block-source-menu';

import { TableBlockEditPropertiesPanel } from './table-block-edit-properties-panel';
import { editingPropertiesAtom } from '~/atoms';

export function TableBlockContextMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { spaceId, entityId, relationId } = useDataBlock();
  const [isEditingDataSource, setIsEditingDataSource] = React.useState(false);
  const [isEditingProperties, setIsEditingProperties] = useAtom(editingPropertiesAtom);

  const isEditing = useUserIsEditing(spaceId);

  if (!isEditing) {
    setIsEditingProperties(false);
  }

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

  const onOpenChange = () => {
    if (isMenuOpen) {
      setIsMenuOpen(false);
      setIsEditingDataSource(false);
      setIsEditingProperties(false);
    } else {
      setIsMenuOpen(true);
    }
  };

  const isInitialState = !isEditingDataSource && !isEditingProperties;

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      <Dropdown.Trigger>{isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          className="z-[1001] block !w-[200px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
          align="start"
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
              <MenuItem>
                <Link
                  href={NavUtils.toEntity(spaceId, entityId)}
                  className="flex w-full items-center justify-between gap-2"
                >
                  <span>View config</span>
                  <Cog />
                </Link>
              </MenuItem>
              <MenuItem>
                <Link
                  href={NavUtils.toEntity(spaceId, relationId)}
                  className="flex w-full items-center justify-between gap-2"
                >
                  <span>View block relation</span>
                  <Relation />
                </Link>
              </MenuItem>
              <MenuItem onClick={onCopyBlockId}>
                <span>Copy block ID</span>
                <Copy />
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
