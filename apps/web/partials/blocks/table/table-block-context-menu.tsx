'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';
import { useAtom } from 'jotai';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useView } from '~/core/blocks/data/use-view';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { NavUtils } from '~/core/utils/utils';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Cog } from '~/design-system/icons/cog';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Eye } from '~/design-system/icons/eye';
import { EyeHide } from '~/design-system/icons/eye-hide';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { Relation } from '~/design-system/icons/relation';
import { MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { DataBlockSourceMenu } from '~/partials/blocks/table/data-block-source-menu';

import { editingColumnsAtom } from '~/atoms';

type Column = {
  id: string;
  name: string | null;
};

type TableBlockContextMenuProps = {
  allColumns: Array<Column>;
};

export function TableBlockContextMenu({ allColumns }: TableBlockContextMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { spaceId, entityId, relationId } = useDataBlock();
  const [isEditingDataSource, setIsEditingDataSource] = React.useState(false);
  const [isEditingColumns, setIsEditingColumns] = useAtom(editingColumnsAtom);

  const isEditing = useUserIsEditing(spaceId);

  if (!isEditing) {
    setIsEditingColumns(false);
  }

  const onCopyBlockId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
      setIsEditingDataSource(false);
      setIsEditingColumns(false);
    } catch (err) {
      console.error('Failed to copy table block entity ID for: ', entityId);
    }
  };

  const onOpenChange = () => {
    if (isMenuOpen) {
      setIsMenuOpen(false);
      setIsEditingDataSource(false);
      setIsEditingColumns(false);
    } else {
      setIsMenuOpen(true);
    }
  };

  const isInitialState = !isEditingDataSource && !isEditingColumns;

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
                      onClick={() => setIsEditingColumns(true)}
                      className="flex w-full items-center justify-between gap-2"
                    >
                      <span>Edit columns</span>
                      <ChevronRight />
                    </button>
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
                  <span>View relation</span>
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
          {isEditingColumns && (
            <>
              <MenuItem className="border-b border-grey-02">
                <button
                  onClick={() => setIsEditingColumns(false)}
                  className="flex w-full items-center gap-2 text-smallButton"
                >
                  <LeftArrowLong />
                  <span>Back</span>
                </button>
              </MenuItem>
              {allColumns.map((column: Column, index: number) => {
                // do not show name column
                if (index === 0) return null;

                return <ToggleColumn key={column.id} column={column} />;
              })}
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

type ToggleColumnProps = {
  column: Column;
};

const ToggleColumn = ({ column }: ToggleColumnProps) => {
  const { setColumn, shownColumnIds } = useView();
  const isShown = shownColumnIds.includes(column.id);

  const onToggleColumn = React.useCallback(async () => {
    setColumn(column);
  }, [column, setColumn]);

  return (
    <MenuItem>
      <button
        onClick={onToggleColumn}
        className={cx('flex w-full items-center justify-between gap-2', !isShown && 'text-grey-03')}
      >
        <span>{column.name}</span>
        {isShown ? <Eye /> : <EyeHide />}
      </button>
    </MenuItem>
  );
};
