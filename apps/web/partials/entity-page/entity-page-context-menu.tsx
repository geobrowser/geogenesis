'use client';

import { batch } from '@legendapp/state';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';

import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Merge } from '~/design-system/icons/merge';
import { MoveSpace } from '~/design-system/icons/move-space';
import { Trash } from '~/design-system/icons/trash';
import { Menu } from '~/design-system/menu';

import { MergeEntityMenu } from '../merge-entity/merge-entity-menu';
import { MoveEntityMenu } from '../move-entity/move-entity-menu';

interface Props {
  entityId: string;
  spaceId: string;
}

export function EntityPageContextMenu({ entityId, spaceId }: Props) {
  const [isMenuOpen, onMenuOpenChange] = React.useState(false);
  const [isMoveEntityMenuOpen, onMoveEntityMenuOpenChange] = React.useState(false);
  const [isMergeEntityMenuOpen, onMergeEntityMenuOpenChange] = React.useState(false);

  const isEditing = useUserIsEditing(spaceId);
  const { remove } = useActionsStore();
  const { triples, schemaTriples } = useEntityPageStore();

  const onCopyId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      onMenuOpenChange(false);
    } catch (err) {
      console.error('Failed to copy entity ID in: ', entityId);
    }
  };

  const onDelete = () => {
    batch(() => {
      triples.forEach(t => remove(t));
      schemaTriples.forEach(t => remove(t));
    });

    onMenuOpenChange(false);
  };

  return (
    <Menu
      className="max-w-[160px]"
      open={isMenuOpen}
      onOpenChange={onMenuOpenChange}
      trigger={<Context color="grey-04" />}
      side="bottom"
    >
      <EntityPageContextMenuItem>
        <button className="flex h-full w-full items-center gap-2 px-2 py-2" onClick={onCopyId}>
          <Copy color="grey-04" />
          Copy ID
        </button>
      </EntityPageContextMenuItem>
      {isEditing && (
        <>
          <EntityPageContextMenuItem>
            <Menu
              open={isMoveEntityMenuOpen}
              onOpenChange={onMoveEntityMenuOpenChange}
              trigger={
                <button
                  className="flex h-full w-full items-center gap-2 px-2 py-2"
                  onClick={() => onMoveEntityMenuOpenChange(true)}
                >
                  <MoveSpace />
                  Move to space
                </button>
              }
              side="bottom"
            >
              <MoveEntityMenu entityId={entityId} spaceId={spaceId} />
            </Menu>
          </EntityPageContextMenuItem>
          <EntityPageContextMenuItem>
            <Menu
              open={isMergeEntityMenuOpen}
              onOpenChange={onMergeEntityMenuOpenChange}
              trigger={
                <button
                  className="flex h-full w-full items-center gap-2 px-2 py-2"
                  onClick={() => onMergeEntityMenuOpenChange(true)}
                >
                  <Merge />
                  Merge with entity
                </button>
              }
              side="bottom"
            >
              <MergeEntityMenu entityId={entityId} />
            </Menu>
          </EntityPageContextMenuItem>
          <EntityPageContextMenuItem>
            <button className="flex h-full w-full items-center gap-2 px-2 py-2 text-red-01" onClick={onDelete}>
              <Trash />
              Delete entity
            </button>
          </EntityPageContextMenuItem>
        </>
      )}
    </Menu>
  );
}

interface EntityPageContextMenuItemProps {
  children: React.ReactNode;
}

function EntityPageContextMenuItem({ children }: EntityPageContextMenuItemProps) {
  return (
    <div className={`w-full divide-y divide-divider bg-white text-button text-grey-04 hover:bg-bg hover:text-text`}>
      {children}
    </div>
  );
}
