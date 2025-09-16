'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { useAtom } from 'jotai';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { NavUtils } from '~/core/utils/utils';
import { useRouter } from 'next/navigation';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Cog } from '~/design-system/icons/cog';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Relation } from '~/design-system/icons/relation';
import { Tool } from '~/design-system/icons/tool';
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
  const router = useRouter();

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
          align="end"
        >
          {isInitialState && (
            <>
              {isEditing && (
                <>
                  <MenuItem>
                    <button
                      onClick={() => setIsEditingDataSource(true)}
                      className="flex w-full items-center justify-between gap-2"
                    >
                      <span>Change data source</span>
                      <ChevronRight />
                    </button>
                  </MenuItem>
                  <MenuItem>
                    <button
                      onClick={() => setIsEditingProperties(true)}
                      className="flex w-full items-center justify-between gap-2"
                    >
                      <TableBlockEditPropertiesPanel />
                      <span>Edit properties</span>
                      <ChevronRight />
                    </button>
                  </MenuItem>
                </>
              )}
              {isEditing && (
                <MenuItem>
                  <button
                    onClick={() => {
                      router.push(`/space/${spaceId}/${entityId}/power-tools?relationId=${relationId}`);
                      setIsMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2"
                  >
                    <span>Open in Power Tools</span>
                    <Tool />
                  </button>
                </MenuItem>
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
              <MenuItem>
                <button onClick={onCopyBlockId} className="flex w-full items-center justify-between gap-2">
                  <span>Copy block ID</span>
                  <Copy />
                </button>
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
